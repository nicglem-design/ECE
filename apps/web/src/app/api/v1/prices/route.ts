import { NextRequest, NextResponse } from "next/server";
import { CHAIN_TO_COINGECKO } from "@/lib/coingecko";

const TOP_5_CG_IDS = new Set(["bitcoin", "ethereum", "tether", "binancecoin", "solana"]);
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const chainIds = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (chainIds.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  function getBaseUrl(): string {
    try {
      if (request.url) {
        const url = new URL(request.url);
        if (url.origin && url.origin !== "null") return url.origin;
      }
    } catch {
      /* ignore */
    }
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    if (host) return `${proto === "https" ? "https" : "http"}://${host}`;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return `http://localhost:${process.env.PORT ?? 3000}`;
  }

  let consensus: { prices?: Record<string, number>; sourcesUsed?: Record<string, number> } | null = null;
  try {
    const base = getBaseUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const consensusRes = await fetch(`${base}/api/crypto/consensus?currency=${currency}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (consensusRes.ok) consensus = await consensusRes.json();
  } catch {
    /* consensus failed - continue with CoinGecko only */
  }

  const consensusPrices = consensus?.prices ?? {};
  const consensusSources = consensus?.sourcesUsed ?? {};

  try {
    const cgIdsNeeded = [...new Set(chainIds.map((c) => CHAIN_TO_COINGECKO[c]).filter(Boolean))];
    const top5FromConsensus = cgIdsNeeded.filter((id) => TOP_5_CG_IDS.has(id));
    const needCoinGecko = cgIdsNeeded.filter((id) => !TOP_5_CG_IDS.has(id) || (consensusSources[id] ?? 0) < 2);

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
      ethereum: 2000,
      bitcoin: 69000,
      "matic-network": 0.38,
      binancecoin: 580,
      solana: 85,
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
      const useConsensus = TOP_5_CG_IDS.has(cgId) && (consensusSources[cgId] ?? 0) >= 2;
      const consensusPrice = consensusPrices[cgId];
      const cgPrice = cgPrices[cgId]?.[currency];
      prices[chainId] =
        (useConsensus && consensusPrice != null && consensusPrice > 0) ? consensusPrice
        : (cgPrice != null && cgPrice > 0) ? cgPrice
        : (consensusPrice != null && consensusPrice > 0) ? consensusPrice
        : (fallbackUsd[cgId] ?? 2000) / rate;
    }

    return NextResponse.json({ prices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
