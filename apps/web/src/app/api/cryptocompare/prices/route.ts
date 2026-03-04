import { NextRequest, NextResponse } from "next/server";

const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data";
const SYMBOLS = ["BTC", "ETH", "BNB", "SOL", "USDT"];
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  SOL: "solana",
  USDT: "tether",
};
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

type CryptoCompareRaw = {
  RAW?: Record<string, Record<string, { PRICE?: number; CHANGEPCT24HOUR?: number }>>;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const rate = FIAT_TO_USD[currency] ?? 1;
  const tsym = currency === "usd" ? "USD" : "USD";

  try {
    const url = `${CRYPTOCOMPARE_BASE}/pricemultifull?fsyms=${SYMBOLS.join(",")}&tsyms=${tsym}`;
    const res = await fetch(url, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json({ error: "CryptoCompare request failed" }, { status: res.status });
    }
    const data = (await res.json()) as CryptoCompareRaw;
    const raw = data.RAW ?? {};
    const prices: Record<string, number> = {};
    const priceChange24h: Record<string, number> = {};
    for (const sym of SYMBOLS) {
      const cgId = SYMBOL_TO_COINGECKO[sym];
      const quote = raw[sym]?.[tsym];
      if (quote?.PRICE != null && quote.PRICE > 0) {
        prices[cgId] = currency === "usd" ? quote.PRICE : quote.PRICE / rate;
      }
      if (quote?.CHANGEPCT24HOUR != null && cgId !== "tether") {
        priceChange24h[cgId] = quote.CHANGEPCT24HOUR;
      }
    }
    priceChange24h["tether"] = 0;
    return NextResponse.json({ prices, priceChange24h });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
