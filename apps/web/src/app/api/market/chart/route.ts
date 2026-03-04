/**
 * Unified chart API: uses our order book trades when we have enough data,
 * otherwise returns empty (caller falls back to external APIs).
 * Same pattern as /api/market/prices.
 */

import { NextRequest, NextResponse } from "next/server";
import { getChartFromTrades } from "@/lib/orderbook/engine";
import { COIN_TO_PAIR } from "@/lib/orderbook/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const days = Math.min(Math.max(1, parseInt(searchParams.get("days") || "7", 10)), 365);

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  const pair = COIN_TO_PAIR[coinId];
  if (!pair) {
    return NextResponse.json({ prices: [], source: "external" }, { headers: CACHE_HEADERS });
  }

  const prices = getChartFromTrades(pair, days, currency);
  if (prices && prices.length >= 2) {
    return NextResponse.json(
      { prices, candles: null, source: "orderbook" },
      { headers: CACHE_HEADERS }
    );
  }

  return NextResponse.json(
    { prices: [], candles: null, source: "external" },
    { headers: CACHE_HEADERS }
  );
}
