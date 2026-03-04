import { NextRequest, NextResponse } from "next/server";
import { CHAIN_TO_COINGECKO } from "@/lib/coingecko";
import { getConsensusPrices } from "@/lib/crypto-consensus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TOP_5_CG_IDS = new Set(["bitcoin", "ethereum", "tether", "binancecoin", "solana"]);
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const chainIds = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (chainIds.length === 0) {
    return NextResponse.json({ prices: {} }, { headers: CACHE_HEADERS });
  }

  const cgIdsNeeded = [...new Set(chainIds.map((c) => CHAIN_TO_COINGECKO[c]).filter(Boolean))];
  const allTop5 = cgIdsNeeded.length > 0 && cgIdsNeeded.every((id) => TOP_5_CG_IDS.has(id));

  // Fast path: when only top-5 tokens requested, fetch from Binance directly (real-time exchange data)
  if (allTop5) {
    try {
      const binanceRes = await fetch(
        `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]))}`,
        { cache: "no-store", next: { revalidate: 0 } }
      );
      if (binanceRes.ok) {
        const data = (await binanceRes.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
        const rate = FIAT_TO_USD[currency] ?? 1;
        const map: Record<string, string> = { BTCUSDT: "bitcoin", ETHUSDT: "ethereum", BNBUSDT: "binancecoin", SOLUSDT: "solana" };
        const binancePrices: Record<string, number> = { tether: 1 / rate };
        for (const item of data) {
          const id = map[item.symbol];
          if (id) binancePrices[id] = parseFloat(item.lastPrice) / rate;
        }
        const prices: Record<string, number> = {};
        for (const chainId of chainIds) {
          const cgId = CHAIN_TO_COINGECKO[chainId];
          const p = cgId ? binancePrices[cgId] : undefined;
          prices[chainId] = (p != null && p > 0) ? p : (2000 / rate);
        }
        return NextResponse.json({ prices }, { headers: CACHE_HEADERS });
      }
    } catch {
      /* fall through to full consensus */
    }
  }

  let consensus: { prices: Record<string, number>; sourcesUsed: Record<string, number> } | null = null;
  try {
    const result = await getConsensusPrices(currency);
    consensus = { prices: result.prices, sourcesUsed: result.sourcesUsed };
  } catch {
    /* consensus failed - continue with CoinGecko only */
  }

  const consensusPrices = consensus?.prices ?? {};
  const consensusSources = consensus?.sourcesUsed ?? {};

  try {
    const needCoinGecko = cgIdsNeeded.filter((id) => !TOP_5_CG_IDS.has(id) || (consensusSources[id] ?? 0) < 1);

    let cgPrices: Record<string, Record<string, number>> = {};
    if (needCoinGecko.length > 0) {
      const cgRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${needCoinGecko.join(",")}&vs_currencies=${currency}`,
        { cache: "no-store", next: { revalidate: 0 } }
      );
      if (cgRes.ok) cgPrices = await cgRes.json();
    }

    const prices: Record<string, number> = {};
    const rate = FIAT_TO_USD[currency] ?? 1;
    const fallbackUsd: Record<string, number> = {
      ethereum: 4000,
      bitcoin: 97000,
      "matic-network": 0.55,
      binancecoin: 600,
      solana: 200,
      tether: 1,
      "avalanche-2": 28,
      fantom: 0.38,
      cronos: 0.1,
      gnosis: 1,
      mantle: 0.42,
      celo: 0.38,
      moonbeam: 0.18,
      "metis-token": 32,
      kava: 0.42,
      harmony: 0.015,
      litecoin: 72,
      dogecoin: 0.28,
    };

    for (const chainId of chainIds) {
      const cgId = CHAIN_TO_COINGECKO[chainId];
      if (!cgId) {
        prices[chainId] = 2000 / rate;
        continue;
      }
      const useConsensus = TOP_5_CG_IDS.has(cgId) && (consensusSources[cgId] ?? 0) >= 1;
      const consensusPrice = consensusPrices[cgId];
      const cgPrice = cgPrices[cgId]?.[currency];
      prices[chainId] =
        (useConsensus && consensusPrice != null && consensusPrice > 0) ? consensusPrice
        : (cgPrice != null && cgPrice > 0) ? cgPrice
        : (consensusPrice != null && consensusPrice > 0) ? consensusPrice
        : (fallbackUsd[cgId] ?? 2000) / rate;
    }

    return NextResponse.json({ prices }, { headers: CACHE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
