import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";

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
    const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = (await res.json()) as { image?: { small?: string; thumb?: string } };
    const imageUrl = data.image?.small ?? data.image?.thumb ?? null;
    if (!imageUrl) {
      return NextResponse.json({ error: "No image" }, { status: 404 });
    }
    return NextResponse.json(
      { image: imageUrl },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
