import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_BASE = "https://api.binance.com/api/v3";
const COIN_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
};
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

/** Binance kline: [openTime, open, high, low, close, volume, closeTime, ...] */
type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const days = parseInt(searchParams.get("days") || "1", 10);

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  const symbol = COIN_TO_SYMBOL[coinId];
  if (!symbol) {
    return NextResponse.json({ error: "Unsupported coin for Binance klines" }, { status: 400 });
  }

  const rate = FIAT_TO_USD[currency] ?? 1;
  const now = Date.now();
  const interval = days <= 1 ? "1h" : days <= 7 ? "1h" : days <= 30 ? "4h" : "1d";
  const limit = days <= 1 ? 24 : days <= 7 ? 168 : days <= 30 ? 180 : Math.min(days, 365);
  const startTime = now - days * 24 * 60 * 60 * 1000;

  try {
    const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return NextResponse.json({ error: "Binance request failed" }, { status: res.status });
    }
    const data = (await res.json()) as BinanceKline[];
    const prices: [number, number][] = data.map((k) => {
      const openTime = k[0];
      const close = parseFloat(k[4]);
      const priceInFiat = close / rate;
      return [openTime, priceInFiat];
    });
    return NextResponse.json(
      { prices },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Binance klines failed" },
      { status: 500 }
    );
  }
}
