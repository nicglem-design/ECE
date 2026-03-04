import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};
const COIN_IDS: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
};

type Binance24hTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const rate = FIAT_TO_USD[currency] ?? 1;
  try {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(SYMBOLS))}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      cache: "no-store",
      next: { revalidate: 0 },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return NextResponse.json({ error: "Binance request failed" }, { status: res.status });
    }
    const data = (await res.json()) as Binance24hTicker[] | { error?: string };
    const tickers = Array.isArray(data) ? data : [];
    const prices: Record<string, number> = { tether: 1 / rate };
    const priceChange24h: Record<string, number> = { tether: 0 };
    for (const item of tickers) {
      const coinId = COIN_IDS[item.symbol];
      if (coinId) {
        prices[coinId] = parseFloat(item.lastPrice) / rate;
        priceChange24h[coinId] = parseFloat(item.priceChangePercent) || 0;
      }
    }
    return NextResponse.json(
      { prices, priceChange24h },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
