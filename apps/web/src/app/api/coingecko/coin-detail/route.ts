import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  try {
    const url = `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = await res.json();
    const genesisDate = data.genesis_date ?? null;
    return NextResponse.json(
      { genesis_date: genesisDate },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
