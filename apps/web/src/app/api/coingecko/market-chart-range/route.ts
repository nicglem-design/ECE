import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!coinId || !from || !to) {
    return NextResponse.json(
      { error: "coinId, from, and to are required" },
      { status: 400 }
    );
  }

  try {
    const fromTs = /^\d+$/.test(from) ? from : Math.floor(new Date(from).getTime() / 1000).toString();
    const toTs = /^\d+$/.test(to) ? to : Math.floor(new Date(to).getTime() / 1000).toString();
    const url = `${COINGECKO_BASE}/coins/${coinId}/market_chart/range?vs_currency=${currency}&from=${fromTs}&to=${toTs}`;
    const res = await fetchExternal(url, { timeoutMs: 15000 });
    if (!res.ok) {
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
