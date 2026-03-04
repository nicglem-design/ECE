import { NextRequest, NextResponse } from "next/server";

const COINPAPRIKA_BASE = "https://api.coinpaprika.com/v1";
const TOP_5_IDS = ["btc-bitcoin", "eth-ethereum", "usdt-tether", "bnb-binance-coin", "sol-solana"];
const COINPAPRIKA_TO_COINGECKO: Record<string, string> = {
  "btc-bitcoin": "bitcoin",
  "eth-ethereum": "ethereum",
  "usdt-tether": "tether",
  "bnb-binance-coin": "binancecoin",
  "sol-solana": "solana",
};
const SUPPORTED_QUOTES = ["usd", "eur"];
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const quoteCurrency = SUPPORTED_QUOTES.includes(currency) ? currency : "usd";
  const rate = FIAT_TO_USD[currency] ?? 1;
  try {
    const results = await Promise.all(
      TOP_5_IDS.map((id) =>
        fetch(`${COINPAPRIKA_BASE}/tickers/${id}?quotes=${quoteCurrency}`, {
          cache: "no-store",
          next: { revalidate: 0 },
        }).then((r) => (r.ok ? r.json() : null))
      )
    );
    const prices: Record<string, number> = {};
    const priceChange24h: Record<string, number> = {};
    const qKey = quoteCurrency.toUpperCase();
    for (let i = 0; i < TOP_5_IDS.length; i++) {
      const data = results[i];
      const cgId = COINPAPRIKA_TO_COINGECKO[TOP_5_IDS[i]];
      if (data?.quotes?.[qKey]) {
        const q = data.quotes[qKey];
        if (q?.price != null && q.price > 0) {
          prices[cgId] = quoteCurrency === currency ? q.price : q.price / rate;
        }
        if (q?.percent_change_24h != null) priceChange24h[cgId] = q.percent_change_24h;
      }
    }
    return NextResponse.json({ prices, priceChange24h });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
