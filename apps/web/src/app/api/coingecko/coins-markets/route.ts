/**
 * CoinGecko coins/markets - paginated list of coins with prices.
 * Used for the full crypto list in KanoExchange.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCached, getStaleCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const perPage = Math.min(250, Math.max(50, parseInt(searchParams.get("per_page") || "250", 10)));
  const sparkline = searchParams.get("sparkline") === "true";
  const order = searchParams.get("order") || "market_cap_desc";
  const params = `markets:${currency}:${page}:${perPage}:${sparkline}:${order}`;

  const cached = getCached<unknown>("coins-markets", params);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "HIT" },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&order=${order}&per_page=${perPage}&page=${page}&sparkline=${sparkline}&price_change_percentage=24h`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      const stale = getStaleCached<unknown>("coins-markets", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = await res.json();
    setCached("coins-markets", params, data);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" },
    });
  } catch (err) {
    const stale = getStaleCached<unknown>("coins-markets", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
