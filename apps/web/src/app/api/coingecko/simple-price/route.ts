import { NextRequest, NextResponse } from "next/server";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const TOP_5_IDS = "bitcoin,ethereum,tether,binancecoin,solana";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${TOP_5_IDS}&vs_currencies=${currency}`;
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
