import { NextRequest, NextResponse } from "next/server";
import { getBybitSymbol } from "@/lib/coin-symbol";
import { fetchExternal } from "@/lib/fetch-external";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BYBIT_BASE = "https://api.bybit.com/v5/market";
/** Static map for common coins; unknown coins resolved dynamically via CoinGecko */
const COIN_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
  "matic-network": "POLUSDT",
  polygon: "POLUSDT",
  matic: "POLUSDT",
  "137": "POLUSDT",
};
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

/** Bybit kline: [startTime, open, high, low, close, volume, turnover] - newest first */
type BybitKline = [string, string, string, string, string, string, string];

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
    symbol = (await getBybitSymbol(coinId)) ?? "";
  }
  if (!symbol) {
    return NextResponse.json({ error: "Unsupported coin for Bybit klines" }, { status: 400 });
  }

  const rate = FIAT_TO_USD[currency] ?? 1;
  const interval =
    days <= 1 ? "15" : days <= 7 ? "60" : days <= 30 ? "120" : days <= 180 ? "240" : "D";
  const limit =
    days <= 1 ? 96 : days <= 7 ? 168 : days <= 30 ? 360 : days <= 180 ? Math.min(days * 6, 1000) : Math.min(days, 1000);

  try {
    const url = `${BYBIT_BASE}/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetchExternal(url, { timeoutMs: 10000 });
    if (!res.ok) {
      return NextResponse.json({ error: "Bybit request failed" }, { status: res.status });
    }
    const json = (await res.json()) as { retCode: number; result?: { list?: BybitKline[] } };
    const list = json.result?.list ?? [];
    const prices: [number, number][] = [];
    const candles: { time: number; open: number; high: number; low: number; close: number }[] = [];
    for (const k of list.reverse()) {
      const openTime = parseInt(k[0], 10);
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
      { error: err instanceof Error ? err.message : "Bybit klines failed" },
      { status: 500 }
    );
  }
}
