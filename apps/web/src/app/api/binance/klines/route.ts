import { NextRequest, NextResponse } from "next/server";
import { getBinanceSymbol } from "@/lib/coin-symbol";
import { fetchExternal } from "@/lib/fetch-external";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BINANCE_BASE = "https://api.binance.com/api/v3";
/** Static map for common coins; unknown coins resolved dynamically via CoinGecko */
const COIN_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
  "matic-network": "MATICUSDT",
  polygon: "MATICUSDT",
  matic: "MATICUSDT",
  "137": "MATICUSDT",
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

  let symbol = COIN_TO_SYMBOL[coinId];
  if (!symbol) {
    symbol = (await getBinanceSymbol(coinId)) ?? "";
  }
  if (!symbol) {
    return NextResponse.json({ error: "Unsupported coin for Binance klines" }, { status: 400 });
  }

  const rate = FIAT_TO_USD[currency] ?? 1;
  const now = Date.now();
  const interval =
    days <= 1 ? "15m" : days <= 7 ? "30m" : days <= 30 ? "2h" : days <= 180 ? "4h" : "1d";
  const limit =
    days <= 1 ? 96 : days <= 7 ? 336 : days <= 30 ? 360 : days <= 180 ? Math.min(days * 6, 1000) : Math.min(days, 1000);
  const startTime = now - days * 24 * 60 * 60 * 1000;

  try {
    const url = `${BINANCE_BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${startTime}&limit=${limit}`;
    const res = await fetchExternal(url, { timeoutMs: 10000 });
    if (!res.ok) {
      return NextResponse.json({ error: "Binance request failed" }, { status: res.status });
    }
    const data = (await res.json()) as BinanceKline[];
    const prices: [number, number][] = [];
    const candles: { time: number; open: number; high: number; low: number; close: number }[] = [];
    for (const k of data) {
      const openTime = k[0];
      const open = parseFloat(k[1]) / rate;
      const high = parseFloat(k[2]) / rate;
      const low = parseFloat(k[3]) / rate;
      const close = parseFloat(k[4]) / rate;
      prices.push([openTime, close]);
      candles.push({
        time: Math.floor(openTime / 1000),
        open,
        high,
        low,
        close,
      });
    }
    return NextResponse.json(
      { prices, candles },
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
