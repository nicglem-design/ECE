/**
 * Unified price API: uses our order book when we have trades/depth (active users),
 * otherwise falls back to external consensus.
 * Supports ?ids=bitcoin,dogecoin,pepe for Popular 5 - merges orderbook (when active) with CoinGecko.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConsensusPrices } from "@/lib/crypto-consensus";
import { fetchExternal } from "@/lib/fetch-external";

const API_BACKEND = process.env.API_BACKEND_URL || "http://localhost:4000";

async function getOurPricesFromApi(currency: string): Promise<{
  prices: Record<string, number>;
  priceChange24h: Record<string, number>;
  source: "orderbook";
} | null> {
  try {
    const res = await fetch(`${API_BACKEND}/api/v1/market/prices?currency=${currency}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { prices?: Record<string, number>; priceChange24h?: Record<string, number>; source?: string };
    if (!data.prices || data.source !== "orderbook") return null;
    return {
      prices: data.prices,
      priceChange24h: data.priceChange24h ?? {},
      source: "orderbook",
    };
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 30;

const CACHE_TTL = 30;
const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${CACHE_TTL}, stale-while-revalidate=60`,
};

/** Fetch prices for arbitrary coin ids from CoinGecko. */
async function fetchCoinGeckoPrices(
  ids: string[],
  currency: string
): Promise<{ prices: Record<string, number>; priceChange24h: Record<string, number> }> {
  if (ids.length === 0) return { prices: {}, priceChange24h: {} };
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=${currency}&include_24hr_change=true`;
  try {
    const res = await fetchExternal(url);
    if (!res.ok) return { prices: {}, priceChange24h: {} };
    const data = (await res.json()) as Record<string, { [k: string]: number }>;
    const prices: Record<string, number> = {};
    const priceChange24h: Record<string, number> = {};
    const changeKey = `${currency}_24h_change` as keyof (typeof data)[string];
    for (const id of ids) {
      const p = data[id]?.[currency];
      if (p != null && p > 0) prices[id] = p;
      const ch = data[id]?.[changeKey] ?? data[id]?.usd_24h_change;
      if (ch != null) priceChange24h[id] = ch;
    }
    return { prices, priceChange24h };
  } catch {
    return { prices: {}, priceChange24h: {} };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const idsParam = searchParams.get("ids");
  const requestedIds = idsParam
    ? idsParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : null;

  const ourPrices = await getOurPricesFromApi(currency);
  const hasOrderbookActive = ourPrices && Object.keys(ourPrices.prices).length > 1;

  // When ids provided (e.g. Popular 5): merge orderbook (when active) with CoinGecko for others
  if (requestedIds && requestedIds.length > 0) {
    const prices: Record<string, number> = {};
    const priceChange24h: Record<string, number> = {};
    const idsNeedingExternal: string[] = [];
    for (const id of requestedIds) {
      if (hasOrderbookActive && ourPrices!.prices[id] != null && ourPrices!.prices[id] > 0) {
        prices[id] = ourPrices!.prices[id];
        priceChange24h[id] = ourPrices!.priceChange24h[id] ?? 0;
      } else {
        idsNeedingExternal.push(id);
      }
    }
    if (idsNeedingExternal.length > 0) {
      const cg = await fetchCoinGeckoPrices(idsNeedingExternal, currency);
      for (const id of idsNeedingExternal) {
        if (cg.prices[id] != null) prices[id] = cg.prices[id];
        if (cg.priceChange24h[id] != null) priceChange24h[id] = cg.priceChange24h[id];
      }
    }
    const source = idsNeedingExternal.length < requestedIds.length ? "orderbook" : "coingecko";
    return NextResponse.json(
      {
        prices,
        priceChange24h,
        source,
        sourcesUsed: {},
        totalSources: 1,
      },
      { headers: CACHE_HEADERS }
    );
  }

  // No ids: original behavior - full orderbook or consensus
  if (hasOrderbookActive) {
    return NextResponse.json(
      {
        prices: ourPrices!.prices,
        priceChange24h: ourPrices!.priceChange24h,
        source: "orderbook",
        sourcesUsed: {},
        totalSources: 1,
      },
      { headers: CACHE_HEADERS }
    );
  }

  const result = await getConsensusPrices(currency);
  return NextResponse.json(
    {
      prices: result.prices,
      priceChange24h: result.priceChange24h,
      source: "consensus",
      sourcesUsed: result.sourcesUsed,
      totalSources: result.totalSources,
    },
    { headers: CACHE_HEADERS }
  );
}
