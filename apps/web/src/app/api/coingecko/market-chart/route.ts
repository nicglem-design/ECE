import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCached, getStaleCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const days = searchParams.get("days") || "1";

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  const params = `${coinId}:${currency}:${days}`;
  const cached = getCached<unknown>("market-chart", params);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "HIT" },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=${currency}&days=${days}`;
    const res = await fetchExternal(url, { timeoutMs: 15000 });
    if (!res.ok) {
      const stale = getStaleCached<unknown>("market-chart", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = await res.json();
    setCached("market-chart", params, data);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" },
    });
  } catch (err) {
    const stale = getStaleCached<unknown>("market-chart", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
