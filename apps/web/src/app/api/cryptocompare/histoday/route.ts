import { NextRequest, NextResponse } from "next/server";
import { getCryptoCompareSymbol } from "@/lib/coin-symbol";
import { fetchExternal } from "@/lib/fetch-external";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data/v2";
/** Static map for common coins; unknown coins resolved dynamically via CoinGecko */
const COIN_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  binancecoin: "BNB",
  solana: "SOL",
  tether: "USDT",
  "matic-network": "MATIC",
  polygon: "MATIC",
  matic: "MATIC",
  "137": "MATIC",
};
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

type CcDataPoint = { time: number; open: number; high: number; low: number; close: number };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coinId");
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const days = Math.min(Math.max(1, parseInt(searchParams.get("days") || "7", 10)), 365);

  if (!coinId) {
    return NextResponse.json({ error: "coinId required" }, { status: 400 });
  }

  let symbol = COIN_TO_SYMBOL[coinId];
  if (!symbol) {
    symbol = (await getCryptoCompareSymbol(coinId)) ?? "";
  }
  if (!symbol) {
    return NextResponse.json({ error: "Unsupported coin for CryptoCompare" }, { status: 400 });
  }

  const tsym = currency === "usd" ? "USD" : "USD";
  const rate = FIAT_TO_USD[currency] ?? 1;

  try {
    const endpoint = days <= 7 ? "histohour" : "histoday";
    const limit = days <= 7 ? Math.min(days * 24, 168) : Math.min(days, 365);
    const url = `${CRYPTOCOMPARE_BASE}/${endpoint}?fsym=${symbol}&tsym=${tsym}&limit=${limit}`;
    const res = await fetchExternal(url, { timeoutMs: 10000 });
    if (!res.ok) {
      return NextResponse.json({ error: "CryptoCompare request failed" }, { status: res.status });
    }
    const json = (await res.json()) as {
      Response?: string;
      Data?: { Data?: CcDataPoint[] };
    };
    const data = json.Data?.Data ?? [];
    const prices: [number, number][] = data.map((d) => [d.time * 1000, d.close / rate]);
    const candles = data.map((d) => ({
      time: d.time,
      open: d.open / rate,
      high: d.high / rate,
      low: d.low / rate,
      close: d.close / rate,
    }));
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
      { error: err instanceof Error ? err.message : "CryptoCompare histoday failed" },
      { status: 500 }
    );
  }
}
