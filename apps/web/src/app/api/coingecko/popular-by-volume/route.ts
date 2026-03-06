/**
 * Top 5 cryptocurrencies by trading volume.
 * Uses coins/markets with volume_desc (1 API call) for reliability - avoids rate limits
 * from multiple market_chart calls. Cached 2 min.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCachedWithTTL, getStaleCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min - reduce API calls to avoid rate limits

/** Static fallback when CoinGecko is rate-limited (429) - top 5 by volume */
const FALLBACK_COINS = [
  { id: "tether", symbol: "usdt", name: "Tether", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "ethereum", symbol: "eth", name: "Ethereum", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "binancecoin", symbol: "bnb", name: "BNB", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
  { id: "solana", symbol: "sol", name: "Solana", current_price: null, price_change_percentage_24h_in_currency: null, sparkline_in_7d: undefined },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const params = `popular-volume:${currency}`;

  const cached = getCachedWithTTL<unknown>("popular-volume", params, CACHE_TTL_MS);
  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=volume_desc&per_page=5&page=1&sparkline=true&price_change_percentage=24h`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      const stale = getStaleCached<unknown>("popular-volume", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      // Rate limited (429) or other error - return static fallback so widget still shows coins
      return NextResponse.json(FALLBACK_COINS, {
        headers: { "Cache-Control": "public, max-age=60", "X-Cache": "FALLBACK" },
      });
    }
    const data = await res.json();
    // CoinGecko can return { error: "..." } on rate limit even with 200 - ensure we have an array
    const safeData = Array.isArray(data) && data.length > 0 ? data : FALLBACK_COINS;
    setCached("popular-volume", params, safeData);
    return NextResponse.json(safeData, {
      headers: {
        "Cache-Control": `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`,
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    const stale = getStaleCached<unknown>("popular-volume", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json(FALLBACK_COINS, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "FALLBACK" },
    });
  }
}
