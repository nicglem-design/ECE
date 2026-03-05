/**
 * Top 5 cryptocurrencies by market cap.
 * Cached 24 hours - refreshed daily to stay up to date.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCachedWithTTL, getStaleCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const FALLBACK_COINS = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "ethereum", symbol: "eth", name: "Ethereum", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "tether", symbol: "usdt", name: "Tether", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "binancecoin", symbol: "bnb", name: "BNB", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "solana", symbol: "sol", name: "Solana", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const params = `top-mcap:${currency}`;

  const cached = getCachedWithTTL<unknown>("top-mcap", params, CACHE_TTL_MS);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": `public, max-age=${86400}`,
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=5&page=1&sparkline=true&price_change_percentage=24h`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      const stale = getStaleCached<unknown>("top-mcap", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      return NextResponse.json(FALLBACK_COINS, {
        headers: { "Cache-Control": "public, max-age=3600", "X-Cache": "FALLBACK" },
      });
    }
    const data = await res.json();
    setCached("top-mcap", params, data);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `public, max-age=${86400}`,
        Pragma: "no-cache",
      },
    });
  } catch {
    const stale = getStaleCached<unknown>("top-mcap", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json(FALLBACK_COINS, {
      headers: { "Cache-Control": "public, max-age=3600", "X-Cache": "FALLBACK" },
    });
  }
}
