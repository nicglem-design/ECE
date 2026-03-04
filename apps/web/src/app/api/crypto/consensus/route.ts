import { NextRequest, NextResponse } from "next/server";

/**
 * Consensus API - fetches from all trusted sources and returns data only when
 * multiple sources agree (within tolerance). Used for accurate, verified crypto data.
 *
 * Sources: Binance, CoinGecko, CoinPaprika, CryptoCompare
 * Consensus: price shown only when 2+ sources agree within 2% tolerance
 */

const TOP_5_COINS = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "tether", symbol: "USDT" },
  { id: "binancecoin", symbol: "BNB" },
  { id: "solana", symbol: "SOL" },
];

const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

const PRICE_TOLERANCE_PCT = 2;
const CHANGE_TOLERANCE_PCT = 3;

async function fetchBinance(currency: string) {
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]))}`,
      { cache: "no-store", next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ symbol: string; lastPrice: string; priceChangePercent: string }>;
    const rate = FIAT_TO_USD[currency] ?? 1;
    const map: Record<string, string> = { BTCUSDT: "bitcoin", ETHUSDT: "ethereum", BNBUSDT: "binancecoin", SOLUSDT: "solana" };
    const prices: Record<string, number> = { tether: 1 / rate };
    const change: Record<string, number> = { tether: 0 };
    for (const item of data) {
      const id = map[item.symbol];
      if (id) {
        prices[id] = parseFloat(item.lastPrice) / rate;
        change[id] = parseFloat(item.priceChangePercent) || 0;
      }
    }
    return { prices, priceChange24h: change };
  } catch {
    return null;
  }
}

async function fetchCoinGecko(currency: string) {
  try {
    const ids = TOP_5_COINS.map((c) => c.id).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${currency}&include_24hr_change=true`,
      { cache: "no-store", next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { [k: string]: number; usd_24h_change?: number }>;
    const prices: Record<string, number> = {};
    const change: Record<string, number> = {};
    for (const c of TOP_5_COINS) {
      const p = data[c.id]?.[currency];
      if (p != null && p > 0) prices[c.id] = p;
      const ch = data[c.id]?.usd_24h_change;
      if (ch != null) change[c.id] = ch;
    }
    change["tether"] = 0;
    return { prices, priceChange24h: change };
  } catch {
    return null;
  }
}

async function fetchCoinPaprika(currency: string) {
  try {
    const ids = ["btc-bitcoin", "eth-ethereum", "usdt-tether", "bnb-binance-coin", "sol-solana"];
    const map: Record<string, string> = {
      "btc-bitcoin": "bitcoin",
      "eth-ethereum": "ethereum",
      "usdt-tether": "tether",
      "bnb-binance-coin": "binancecoin",
      "sol-solana": "solana",
    };
    const quote = ["usd", "eur"].includes(currency) ? currency : "usd";
    const rate = FIAT_TO_USD[currency] ?? 1;
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`https://api.coinpaprika.com/v1/tickers/${id}?quotes=${quote}`, {
          cache: "no-store",
          next: { revalidate: 0 },
        }).then((r) => (r.ok ? r.json() : null))
      )
    );
    const prices: Record<string, number> = {};
    const change: Record<string, number> = {};
    const qKey = quote.toUpperCase();
    for (let i = 0; i < ids.length; i++) {
      const d = results[i];
      const cgId = map[ids[i]];
      if (d?.quotes?.[qKey]?.price != null && d.quotes[qKey].price > 0) {
        prices[cgId] = quote === currency ? d.quotes[qKey].price : d.quotes[qKey].price / rate;
      }
      if (d?.quotes?.[qKey]?.percent_change_24h != null) {
        change[cgId] = d.quotes[qKey].percent_change_24h;
      }
    }
    change["tether"] = 0;
    return { prices, priceChange24h: change };
  } catch {
    return null;
  }
}

async function fetchCryptoCompare(currency: string) {
  try {
    const res = await fetch(
      "https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC,ETH,BNB,SOL,USDT&tsyms=USD",
      { cache: "no-store", next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      RAW?: Record<string, Record<string, { PRICE?: number; CHANGEPCT24HOUR?: number }>>;
    };
    const raw = data.RAW ?? {};
    const map: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", SOL: "solana", USDT: "tether" };
    const rate = FIAT_TO_USD[currency] ?? 1;
    const prices: Record<string, number> = {};
    const change: Record<string, number> = {};
    for (const [sym, quote] of Object.entries(raw)) {
      const p = quote?.USD?.PRICE;
      if (p != null && p > 0) {
        prices[map[sym]] = currency === "usd" ? p : p / rate;
      }
      const ch = quote?.USD?.CHANGEPCT24HOUR;
      if (ch != null) change[map[sym]] = ch;
    }
    change["tether"] = 0;
    return { prices, priceChange24h: change };
  } catch {
    return null;
  }
}

function withinTolerance(a: number, b: number, pct: number): boolean {
  if (a === 0 || b === 0) return a === b;
  const diff = Math.abs(a - b) / Math.min(a, b);
  return diff <= pct / 100;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeConsensusPrice(
  sources: Array<{ prices: Record<string, number>; priceChange24h: Record<string, number> }>,
  coinId: string,
  fallback: number
): { price: number; sourcesAgree: number } {
  const values = sources.map((s) => s.prices[coinId]).filter((v): v is number => v != null && v > 0);
  if (values.length === 0) return { price: fallback, sourcesAgree: 0 };
  if (values.length === 1) return { price: values[0], sourcesAgree: 1 };
  const cluster = values.filter((v) => {
    const count = values.filter((w) => withinTolerance(v, w, PRICE_TOLERANCE_PCT)).length;
    return count >= 2;
  });
  if (cluster.length >= 2) {
    return { price: median(cluster), sourcesAgree: cluster.length };
  }
  return { price: median(values), sourcesAgree: values.length };
}

function computeConsensusChange(
  sources: Array<{ prices: Record<string, number>; priceChange24h: Record<string, number> }>,
  coinId: string
): number | null {
  const values = sources
    .map((s) => s.priceChange24h[coinId])
    .filter((v): v is number => v != null && !Number.isNaN(v));
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  const cluster = values.filter((v) => {
    const count = values.filter((w) => Math.abs(v - w) <= CHANGE_TOLERANCE_PCT).length;
    return count >= 2;
  });
  if (cluster.length >= 2) return median(cluster);
  return median(values);
}

const FALLBACK_USD: Record<string, number> = {
  bitcoin: 69000,
  ethereum: 2000,
  tether: 1,
  binancecoin: 580,
  solana: 85,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const rate = FIAT_TO_USD[currency] ?? 1;

  const [binance, coingecko, coinpaprika, cryptocompare] = await Promise.all([
    fetchBinance(currency),
    fetchCoinGecko(currency),
    fetchCoinPaprika(currency),
    fetchCryptoCompare(currency),
  ]);

  const sources = [binance, coingecko, coinpaprika, cryptocompare].filter(
    (s): s is NonNullable<typeof s> => s != null && Object.keys(s.prices).length > 0
  );

  const prices: Record<string, number> = {};
  const priceChange24h: Record<string, number> = {};
  const sourcesUsed: Record<string, number> = {};

  for (const c of TOP_5_COINS) {
    const fallback = (FALLBACK_USD[c.id] ?? 2000) / rate;
    const { price, sourcesAgree } = computeConsensusPrice(sources, c.id, fallback);
    prices[c.id] = price;
    sourcesUsed[c.id] = sourcesAgree;
    const ch = computeConsensusChange(sources, c.id);
    priceChange24h[c.id] = ch ?? 0;
  }

  return NextResponse.json({
    prices,
    priceChange24h,
    sourcesUsed,
    totalSources: sources.length,
  });
}
