import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

/** Get price and 24h change for any CoinGecko coin. Used for chart fallback when market_chart fails. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=${currency}&include_24hr_change=true`;
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: "CoinGecko request failed" }, { status: res.status });
    }
    const data = (await res.json()) as Record<string, { [key: string]: number } | undefined>;
    const coin = data[coinId];
    if (!coin) {
      return NextResponse.json({ price: null, priceChange24h: null });
    }
    const price = coin[currency];
    const priceChange24h = coin[`${currency}_24h_change`] ?? null;
    return NextResponse.json(
      { price: price ?? null, priceChange24h },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
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
