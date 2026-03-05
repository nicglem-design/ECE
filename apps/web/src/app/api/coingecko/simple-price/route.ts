import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCached, getStaleCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const TOP_5_IDS = "bitcoin,ethereum,tether,binancecoin,solana";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const params = `simple:${currency}`;

  const cached = getCached<unknown>("simple-price", params);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=30", "X-Cache": "HIT" },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${TOP_5_IDS}&vs_currencies=${currency}&include_24hr_change=true`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      const stale = getStaleCached<unknown>("simple-price", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = await res.json();
    setCached("simple-price", params, data);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=30", Pragma: "no-cache" },
    });
  } catch (err) {
    const stale = getStaleCached<unknown>("simple-price", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
