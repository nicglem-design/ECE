/**
 * Crypto price fetching - uses multi-source API (CoinGecko + Binance + CoinPaprika)
 * when available for real-time accuracy. Falls back to direct CoinGecko.
 */

import { API_BASE } from "@/lib/api";

export const FIAT_CURRENCIES = [
  { id: "usd", name: "US Dollar", symbol: "USD" },
  { id: "sek", name: "Swedish Krona", symbol: "SEK" },
  { id: "eur", name: "Euro", symbol: "EUR" },
  { id: "gbp", name: "British Pound", symbol: "GBP" },
  { id: "nok", name: "Norwegian Krone", symbol: "NOK" },
  { id: "dkk", name: "Danish Krone", symbol: "DKK" },
] as const;

export type FiatCurrencyId = (typeof FIAT_CURRENCIES)[number]["id"];

/** Fallback USD prices when APIs fail (only used when all sources unavailable) */
const FALLBACK_PRICES_USD: Record<string, number> = {
  ethereum: 4000,
  bitcoin: 97000,
  solana: 200,
  polygon: 0.55,
  bnb: 600,
  arbitrum: 2000,
  optimism: 2000,
  avalanche: 28,
  base: 2000,
  fantom: 0.38,
  cronos: 0.1,
  gnosis: 1,
  zksync: 2000,
  linea: 2000,
  blast: 2000,
  mantle: 0.42,
  celo: 0.38,
  moonbeam: 0.18,
  aurora: 2000,
  metis: 32,
  scroll: 2000,
  mode: 2000,
  kava: 0.42,
  harmony: 0.015,
  litecoin: 72,
  dogecoin: 0.28,
};

/** Approximate USD rates for fiat (1 unit of fiat = X USD) */
const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

/** Reverse map: CoinGecko id -> primary chainId (for getPriceByCoinId) */
const COINGECKO_TO_CHAIN: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [chainId, cgId] of Object.entries({
    ethereum: "ethereum",
    polygon: "matic-network",
    bnb: "binancecoin",
    tether: "tether",
    avalanche: "avalanche-2",
    fantom: "fantom",
    cronos: "cronos",
    gnosis: "gnosis",
    mantle: "mantle",
    celo: "celo",
    moonbeam: "moonbeam",
    metis: "metis-token",
    kava: "kava",
    harmony: "harmony",
    solana: "solana",
    bitcoin: "bitcoin",
    litecoin: "litecoin",
    dogecoin: "dogecoin",
  } as Record<string, string>)) {
    if (!m[cgId]) m[cgId] = chainId;
  }
  return m;
})();

export const CHAIN_TO_COINGECKO: Record<string, string> = {
  ethereum: "ethereum",
  polygon: "matic-network",
  bnb: "binancecoin",
  arbitrum: "ethereum",
  optimism: "ethereum",
  avalanche: "avalanche-2",
  base: "ethereum",
  fantom: "fantom",
  cronos: "cronos",
  gnosis: "gnosis",
  zksync: "ethereum",
  linea: "ethereum",
  blast: "ethereum",
  mantle: "mantle",
  celo: "celo",
  moonbeam: "moonbeam",
  aurora: "ethereum",
  metis: "metis-token",
  scroll: "ethereum",
  mode: "ethereum",
  kava: "kava",
  harmony: "harmony",
  solana: "solana",
  bitcoin: "bitcoin",
  litecoin: "litecoin",
  dogecoin: "dogecoin",
  tether: "tether",
};

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

async function fetchWithRetry(url: string, retries = 2): Promise<Response | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status === 429 && i < retries) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return null;
    } catch {
      if (i < retries) await new Promise((r) => setTimeout(r, 500));
      return null;
    }
  }
  return null;
}

export async function fetchPrices(
  chainIds: string[],
  fiatIds: string[]
): Promise<Record<string, Record<string, number>>> {
  const ids = [...new Set(chainIds.map((c) => CHAIN_TO_COINGECKO[c]).filter(Boolean))];
  if (ids.length === 0) return {};
  const vs = fiatIds.join(",");
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids.join(",")}&vs_currencies=${vs}`;
  const res = await fetchWithRetry(url);
  if (!res) return {};
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/** Fetch prices from multi-source API (consensus + CoinGecko). Returns null on failure. */
async function fetchPricesFromMultiSourceAPI(
  chainIds: string[],
  fiatId: string
): Promise<Record<string, number> | null> {
  const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
  const url = `${base}/api/v1/prices?ids=${chainIds.join(",")}&currency=${fiatId}&t=${Date.now()}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data.prices ?? null;
  } catch {
    return null;
  }
}

export async function getPricesBatch(
  chainIds: string[],
  fiatId: string
): Promise<Record<string, number>> {
  const unique = [...new Set(chainIds)];
  if (unique.length === 0) return {};
  const apiPrices = await fetchPricesFromMultiSourceAPI(unique, fiatId);
  if (apiPrices && Object.keys(apiPrices).length > 0) {
    const out: Record<string, number> = {};
    for (const chainId of unique) {
      const price = apiPrices[chainId];
      out[chainId] = price != null && price > 0 ? price : getFallbackPrice(chainId, fiatId);
    }
    return out;
  }
  const result = await fetchPrices(unique, [fiatId]);
  const out: Record<string, number> = {};
  for (const chainId of unique) {
    const cgId = CHAIN_TO_COINGECKO[chainId];
    if (!cgId) {
      out[chainId] = getFallbackPrice(chainId, fiatId);
      continue;
    }
    const price = result[cgId]?.[fiatId] ?? 0;
    out[chainId] = price > 0 ? price : getFallbackPrice(chainId, fiatId);
  }
  return out;
}

const TOP_5_COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "solana", symbol: "SOL", name: "Solana" },
];

/** Binance symbol for each top-5 coin (USDT pair). USDT has no USDT pair, use 1. */
const COIN_TO_BINANCE_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
};

export { TOP_5_COINS };

/** Get midnight today in Europe/Oslo (Norwegian time) as Unix ms */
export function getMidnightOsloMs(): number {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "1", 10);
  const utcMidnight = Date.UTC(year, month, day);
  const hourStr = new Date(utcMidnight).toLocaleString("en", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    hour12: false,
  });
  const hourInOslo = parseInt(String(hourStr).trim(), 10) || 0;
  return utcMidnight - hourInOslo * 3600000;
}

/** Fetch market chart from midnight Norwegian time to now. Falls back to rolling 24h if range too short. */
export async function fetchMarketChartFromMidnightOslo(
  coinId: string,
  vsCurrency: string
): Promise<[number, number][]> {
  const from = Math.floor(getMidnightOsloMs() / 1000);
  const to = Math.floor(Date.now() / 1000);
  if (to <= from) return fetchMarketChart(coinId, vsCurrency, 1);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/market_chart/range?vs_currency=${vsCurrency}&from=${from}&to=${to}`,
      {
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return fetchMarketChart(coinId, vsCurrency, 1);
    const data = await res.json();
    const prices = data.prices ?? [];
    if (prices.length < 2) return fetchMarketChart(coinId, vsCurrency, 1);
    return prices;
  } catch {
    return fetchMarketChart(coinId, vsCurrency, 1);
  }
}

export type Top5MultiSourceResult = {
  prices: Record<string, number>;
  priceChange24h: Record<string, number>;
};

/** Cache-busting param for fresh price fetches */
const cacheBust = () => `_=${Date.now()}`;

/** Fetch from our order book (when we have trades) or consensus. Our book takes priority when we have liquidity. */
async function fetchTop5FromMarketPrices(
  fiatId: string
): Promise<{ prices: Record<string, number>; priceChange24h: Record<string, number> } | null> {
  try {
    const base = getClientApiBase();
    const res = await fetch(`${base}/api/market/prices?currency=${fiatId}&${cacheBust()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const prices = data.prices ?? {};
    const priceChange24h = data.priceChange24h ?? {};
    if (Object.keys(prices).length > 0) return { prices, priceChange24h };
    return null;
  } catch {
    return null;
  }
}

/** Fetch top 5 from Binance via API (price + 24h %). */
async function fetchTop5FromBinance(
  fiatId: string
): Promise<{ prices: Record<string, number>; priceChange24h: Record<string, number> } | null> {
  try {
    const base = getClientApiBase();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${base}/api/binance/prices?currency=${fiatId}&${cacheBust()}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const prices = data.prices ?? {};
    const priceChange24h = data.priceChange24h ?? {};
    if (Object.keys(prices).length > 0) return { prices, priceChange24h };
    return null;
  } catch {
    return null;
  }
}

/** Fetch top 5 from CoinGecko simple/price via API. */
async function fetchTop5FromCoinGeckoViaAPI(fiatId: string): Promise<Record<string, number> | null> {
  const fiat = (fiatId || "usd").toLowerCase();
  try {
    const base = getClientApiBase();
    const res = await fetch(`${base}/api/coingecko/simple-price?currency=${fiat}&${cacheBust()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out: Record<string, number> = {};
    for (const c of TOP_5_COINS) {
      const p = data[c.id]?.[fiat];
      if (p != null && p > 0) out[c.id] = p;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Fetch from CryptoCompare via API (price + 24h %). */
async function fetchTop5FromCryptoCompareViaAPI(
  fiatId: string
): Promise<{ prices: Record<string, number>; priceChange24h: Record<string, number> } | null> {
  try {
    const base = getClientApiBase();
    const res = await fetch(`${base}/api/cryptocompare/prices?currency=${fiatId}&${cacheBust()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const prices = data.prices ?? {};
    const priceChange24h = data.priceChange24h ?? {};
    if (Object.keys(prices).length > 0) return { prices, priceChange24h };
    return null;
  } catch {
    return null;
  }
}

/** Fast live prices. Uses our order book when we have trades, else external APIs. */
export async function fetchTop5LivePricesFast(
  fiatId: string
): Promise<Top5MultiSourceResult> {
  const fiat = (fiatId || "usd").toLowerCase();
  const market = await fetchTop5FromMarketPrices(fiatId);
  if (market && Object.keys(market.prices).length > 1) {
    return market;
  }
  const [binance, cryptocompare, paprika, cgPrices] = await Promise.all([
    fetchTop5FromBinance(fiatId),
    fetchTop5FromCryptoCompareViaAPI(fiatId),
    fetchTop5FromCoinPaprikaViaAPI(fiatId),
    fetchTop5FromCoinGeckoViaAPI(fiatId),
  ]);
  const prices: Record<string, number> = {};
  const priceChange24h: Record<string, number> = {};
  for (const c of TOP_5_COINS) {
    const b = binance?.prices[c.id];
    const cc = cryptocompare?.prices[c.id];
    const p = paprika?.prices[c.id];
    const cg = cgPrices?.[c.id];
    prices[c.id] =
      (b != null && b > 0) ? b
      : (cc != null && cc > 0) ? cc
      : (p != null && p > 0) ? p
      : (cg != null && cg > 0) ? cg
      : getFallbackPriceForCoin(c.id, fiat);
    const bCh = binance?.priceChange24h[c.id];
    const ccCh = cryptocompare?.priceChange24h[c.id];
    const pCh = paprika?.priceChange24h[c.id];
    priceChange24h[c.id] =
      (bCh != null && c.id !== "tether") ? bCh
      : (ccCh != null) ? ccCh
      : (pCh != null) ? pCh
      : 0;
  }
  return { prices, priceChange24h };
}

/** Fetch consensus data (multi-source verified). Primary source when available. */
async function fetchTop5FromConsensus(
  fiatId: string
): Promise<{ prices: Record<string, number>; priceChange24h: Record<string, number>; sourcesUsed?: Record<string, number> } | null> {
  try {
    const base = getClientApiBase();
    const res = await fetch(`${base}/api/crypto/consensus?currency=${fiatId}&${cacheBust()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const prices = data.prices ?? {};
    const priceChange24h = data.priceChange24h ?? {};
    if (Object.keys(prices).length > 0) return { prices, priceChange24h, sourcesUsed: data.sourcesUsed };
    return null;
  } catch {
    return null;
  }
}

/** Fetch top 5 from CoinPaprika via API (price + 24h %). */
async function fetchTop5FromCoinPaprikaViaAPI(
  fiatId: string
): Promise<{ prices: Record<string, number>; priceChange24h: Record<string, number> } | null> {
  try {
    const base = getClientApiBase();
    const res = await fetch(`${base}/api/coinpaprika/prices?currency=${fiatId}&${cacheBust()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const prices = data.prices ?? {};
    const priceChange24h = data.priceChange24h ?? {};
    if (Object.keys(prices).length > 0) return { prices, priceChange24h };
    return null;
  } catch {
    return null;
  }
}

/** Multi-source: Consensus (verified) > Binance > CoinGecko > CoinPaprika > CryptoCompare > fallback. */
export async function fetchTop5PricesMultiSource(
  fiatId: string
): Promise<Top5MultiSourceResult> {
  const fiat = (fiatId || "usd").toLowerCase();
  const [consensus, binance, cgPrices, cgMarkets, paprika, cryptocompare] = await Promise.all([
    fetchTop5FromConsensus(fiatId),
    fetchTop5FromBinance(fiatId),
    fetchTop5FromCoinGeckoViaAPI(fiatId),
    fetchTop5FromCoinGeckoMarkets(fiatId),
    fetchTop5FromCoinPaprikaViaAPI(fiatId),
    fetchTop5FromCryptoCompareViaAPI(fiatId),
  ]);

  const prices: Record<string, number> = {};
  const priceChange24h: Record<string, number> = {};

  for (const c of TOP_5_COINS) {
    const consensusPrice = consensus?.prices[c.id];
    const binancePrice = binance?.prices[c.id];
    const cgPrice = cgPrices?.[c.id];
    const cgMarket = cgMarkets?.find((m) => m.id === c.id);
    const cgMarketPrice = cgMarket?.price;
    const paprikaPrice = paprika?.prices[c.id];
    const ccPrice = cryptocompare?.prices[c.id];
    prices[c.id] =
      (consensusPrice != null && consensusPrice > 0 && (consensus?.sourcesUsed?.[c.id] ?? 0) >= 1) ? consensusPrice
      : (binancePrice != null && binancePrice > 0) ? binancePrice
      : (cgPrice != null && cgPrice > 0) ? cgPrice
      : (cgMarketPrice != null && cgMarketPrice > 0) ? cgMarketPrice
      : (paprikaPrice != null && paprikaPrice > 0) ? paprikaPrice
      : (ccPrice != null && ccPrice > 0) ? ccPrice
      : getFallbackPriceForCoin(c.id, fiat);
    const consensusChange = consensus?.priceChange24h[c.id];
    const binanceChange = binance?.priceChange24h[c.id];
    const cgChange = cgMarket?.priceChange24h;
    const paprikaChange = paprika?.priceChange24h[c.id];
    const ccChange = cryptocompare?.priceChange24h[c.id];
    priceChange24h[c.id] =
      (consensusChange != null && (consensus?.sourcesUsed?.[c.id] ?? 0) >= 1) ? consensusChange
      : (binanceChange != null && c.id !== "tether") ? binanceChange
      : (cgChange != null) ? cgChange
      : (paprikaChange != null) ? paprikaChange
      : (ccChange != null) ? ccChange
      : 0;
  }

  return { prices, priceChange24h };
}

/** Fetch top 5 prices from multi-source API. Returns null on failure. */
async function fetchTop5PricesFromMultiSourceAPI(
  fiatId: string
): Promise<Record<string, number> | null> {
  const base = API_BASE || "";
  const url = `${base}/api/v1/prices/top5?currency=${fiatId}&t=${Date.now()}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return data.prices ?? null;
  } catch {
    return null;
  }
}

export type TopCoinWithSparkline = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  sparkline: number[];
  priceChange24h: number | null;
};

function getClientApiBase(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** Fetch top 5 from CoinGecko markets. Uses API route (proxy) to avoid CORS. */
async function fetchTop5FromCoinGeckoMarkets(
  fiatId: string
): Promise<TopCoinWithSparkline[] | null> {
  const fiat = (fiatId || "usd").toLowerCase();
  const base = getClientApiBase();
  const apiUrl = `${base}/api/coingecko/top5?currency=${fiat}&${cacheBust()}`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      if (!res.ok) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      const data = (await res.json()) as Array<{
        id: string;
        symbol: string;
        name: string;
        current_price: number | null;
        price_change_percentage_24h_in_currency?: number | null;
        price_change_percentage_24h?: number | null;
        sparkline_in_7d?: { price?: number[] };
      }>;
      if (!Array.isArray(data) || data.length === 0) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      const byId = Object.fromEntries(data.map((d) => [d.id, d]));
      return TOP_5_COINS.map((c) => {
        const d = byId[c.id];
        const spark7d = (d?.sparkline_in_7d?.price ?? []) as number[];
        const spark24h =
          spark7d.length >= 24 ? spark7d.slice(-24) : spark7d.length >= 2 ? spark7d : [];
        return {
          id: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          price: d?.current_price ?? getFallbackPriceForCoin(c.id, fiat),
          sparkline: spark24h,
          priceChange24h: d?.price_change_percentage_24h_in_currency ?? d?.price_change_percentage_24h ?? null,
        };
      });
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
    }
  }
  return null;
}

/** Fetch top 5 - CoinGecko markets (price + chart + 24h%) or multi-source fallback. */
export async function fetchTop5PricesOnly(fiatId: string): Promise<TopCoinWithSparkline[]> {
  const markets = await fetchTop5FromCoinGeckoMarkets(fiatId);
  if (markets && markets.every((c) => c.price > 0)) return markets;
  const fiat = (fiatId || "usd").toLowerCase();
  const { prices, priceChange24h } = await fetchTop5PricesMultiSource(fiatId);
  return TOP_5_COINS.map((c) => {
    const price = prices[c.id] ?? getFallbackPriceForCoin(c.id, fiat);
    const change = priceChange24h[c.id] ?? null;
    const sparkline =
      change != null ? generateTrendSparkline(price, change) : generateFallbackSparkline(price);
    return {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price,
      sparkline,
      priceChange24h: change,
    };
  });
}

/** Fetch chart from Binance klines (fallback for top-5 when CoinGecko fails). */
async function fetchBinanceKlinesViaAPI(
  coinId: string,
  vsCurrency: string,
  days: number | "max"
): Promise<[number, number][]> {
  if (!COIN_TO_BINANCE_SYMBOL[coinId]) return [];
  const daysNum = days === "max" ? 365 : Math.min(Math.max(1, days), 365);
  const base = getClientApiBase();
  try {
    const u = `${base}/api/binance/klines?coinId=${encodeURIComponent(coinId)}&currency=${vsCurrency}&days=${daysNum}&${cacheBust()}`;
    const res = await fetch(u, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.prices ?? []) as [number, number][];
  } catch {
    return [];
  }
}

/** Fetch market chart via API route (no CORS). CoinGecko first, Binance klines fallback for top-5. */
export async function fetchMarketChartViaAPI(
  coinId: string,
  vsCurrency: string,
  days: number | "max"
): Promise<[number, number][]> {
  const daysParam = days === "max" ? "max" : String(days);
  const base = getClientApiBase();
  const tryCoinGecko = async (currency: string) => {
    const u = `${base}/api/coingecko/market-chart?coinId=${encodeURIComponent(coinId)}&currency=${currency}&days=${daysParam}&${cacheBust()}`;
    const res = await fetch(u, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.prices ?? []) as [number, number][];
  };
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      let prices = await tryCoinGecko(vsCurrency);
      if (prices.length > 0) return prices;
      if (vsCurrency !== "usd") {
        prices = await tryCoinGecko("usd");
        if (prices.length > 0) return prices;
      }
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
  const binancePrices = await fetchBinanceKlinesViaAPI(coinId, vsCurrency, days);
  if (binancePrices.length > 0) return binancePrices;
  return [];
}

/** Fetch 24h sparklines for polling. Uses single markets request when possible. */
export async function fetchTop5Sparklines24h(
  fiatId: string
): Promise<Record<string, { sparkline: number[]; priceChange24h: number | null }>> {
  const markets = await fetchTop5FromCoinGeckoMarkets(fiatId);
  if (markets) {
    return Object.fromEntries(
      markets.map((c) => [c.id, { sparkline: c.sparkline, priceChange24h: c.priceChange24h }])
    );
  }
  const fiat = (fiatId || "usd").toLowerCase();
  const results = await Promise.all(
    TOP_5_COINS.map(async (c) => {
      const points = await fetchMarketChartViaAPI(c.id, fiat, 1);
      const arr = pricePointsToArray(points);
      const change24h =
        arr.length >= 2 && arr[0] > 0
          ? ((arr[arr.length - 1] - arr[0]) / arr[0]) * 100
          : null;
      return { id: c.id, sparkline: arr, priceChange24h: change24h };
    })
  );
  return Object.fromEntries(
    results.map((r) => [r.id, { sparkline: r.sparkline, priceChange24h: r.priceChange24h }])
  );
}

/**
 * Fetch top 5 with multi-source fallback. Uses Promise.allSettled - never fails entirely.
 * Sources: Consensus (verified), Binance, CoinGecko (simple + markets), CoinPaprika, CryptoCompare.
 * Price: Consensus (2+ agree) > Binance > CoinGecko > CoinPaprika > CryptoCompare > fallback
 * 24h%: Consensus > Binance > CoinGecko markets > CoinPaprika > CryptoCompare > 0
 * Sparkline: CoinGecko markets > generated from price+change
 */
export async function fetchTop5DataFull(fiatId: string): Promise<TopCoinWithSparkline[]> {
  const fiat = (fiatId || "usd").toLowerCase();
  const [consensusRes, binanceRes, cgSimpleRes, cgMarketsRes, paprikaRes, ccRes] = await Promise.allSettled([
    fetchTop5FromConsensus(fiatId),
    fetchTop5FromBinance(fiatId),
    fetchTop5FromCoinGeckoViaAPI(fiatId),
    fetchTop5FromCoinGeckoMarkets(fiatId),
    fetchTop5FromCoinPaprikaViaAPI(fiatId),
    fetchTop5FromCryptoCompareViaAPI(fiatId),
  ]);

  const consensus = consensusRes.status === "fulfilled" ? consensusRes.value : null;
  const binance = binanceRes.status === "fulfilled" ? binanceRes.value : null;
  const cgPrices = cgSimpleRes.status === "fulfilled" ? cgSimpleRes.value : null;
  const cgMarkets = cgMarketsRes.status === "fulfilled" ? cgMarketsRes.value : null;
  const paprika = paprikaRes.status === "fulfilled" ? paprikaRes.value : null;
  const cryptocompare = ccRes.status === "fulfilled" ? ccRes.value : null;

  return TOP_5_COINS.map((c) => {
    const consensusPrice = consensus?.prices[c.id];
    const consensusAgree = consensus?.sourcesUsed?.[c.id] ?? 0;
    const binancePrice = binance?.prices[c.id];
    const cgPrice = cgPrices?.[c.id];
    const cgMarket = cgMarkets?.find((m) => m.id === c.id);
    const cgMarketPrice = cgMarket?.price;
    const paprikaPrice = paprika?.prices[c.id];
    const ccPrice = cryptocompare?.prices[c.id];
    const price =
      (consensusPrice != null && consensusPrice > 0 && consensusAgree >= 1) ? consensusPrice
      : (binancePrice != null && binancePrice > 0) ? binancePrice
      : (cgPrice != null && cgPrice > 0) ? cgPrice
      : (cgMarketPrice != null && cgMarketPrice > 0) ? cgMarketPrice
      : (paprikaPrice != null && paprikaPrice > 0) ? paprikaPrice
      : (ccPrice != null && ccPrice > 0) ? ccPrice
      : getFallbackPriceForCoin(c.id, fiat);

    const consensusChange = consensus?.priceChange24h[c.id];
    const binanceChange = binance?.priceChange24h[c.id];
    const cgChange = cgMarket?.priceChange24h;
    const paprikaChange = paprika?.priceChange24h[c.id];
    const ccChange = cryptocompare?.priceChange24h[c.id];
    const priceChange24h =
      (consensusChange != null && consensusAgree >= 1) ? consensusChange
      : (binanceChange != null && c.id !== "tether") ? binanceChange
      : (cgChange != null) ? cgChange
      : (paprikaChange != null) ? paprikaChange
      : (ccChange != null) ? ccChange
      : null;

    let sparkline = cgMarket?.sparkline ?? [];
    if (sparkline.length < 2 && price > 0) {
      sparkline =
        priceChange24h != null
          ? generateTrendSparkline(price, priceChange24h)
          : generateFallbackSparkline(price);
    }

    return {
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      price,
      sparkline,
      priceChange24h,
    };
  });
}

export async function fetchTop5WithSparkline(fiatId: string): Promise<TopCoinWithSparkline[]> {
  const fiat = (fiatId || "usd").toLowerCase();
  const [{ prices: multiSourcePrices, priceChange24h: multiSourceChange }, sparklineByCoin] =
    await Promise.all([
      fetchTop5PricesMultiSource(fiatId),
      fetchTop5Sparklines24h(fiatId),
    ]);
  const coinsWithPrices = TOP_5_COINS.map((c) => {
    const price = multiSourcePrices[c.id];
    const { sparkline, priceChange24h } = sparklineByCoin[c.id] ?? {};
    return {
      id: c.id,
      symbol: c.symbol,
      name: c.name,
      price: price != null && price > 0 ? price : getFallbackPriceForCoin(c.id, fiat),
      sparkline: sparkline ?? [],
      priceChange24h: multiSourceChange[c.id] ?? priceChange24h ?? null,
    };
  });
  if (coinsWithPrices.every((c) => c.price <= 0)) return fetchTop5Fallback(fiatId);
  return coinsWithPrices.map((c) => ({
    ...c,
    symbol: c.symbol.toUpperCase(),
    sparkline: c.sparkline.length >= 2 ? c.sparkline : [],
  }));
}

export function getFallbackPriceForCoin(coinId: string, fiatId: string): number {
  const usdPrices: Record<string, number> = {
    bitcoin: 97000,
    ethereum: 4000,
    tether: 1,
    binancecoin: 600,
    solana: 200,
  };
  const usd = usdPrices[coinId] ?? 2000;
  const rate = FIAT_TO_USD[fiatId] ?? 1;
  return usd / rate;
}

/** Static fallback for top 5 when CoinGecko is completely down */
function getStaticTop5Fallback(fiatId: string): TopCoinWithSparkline[] {
  const rate = FIAT_TO_USD[fiatId] ?? 1;
  return TOP_5_COINS.map((c) => {
    const usdPrice =
      c.id === "bitcoin"
        ? 97000
        : c.id === "ethereum"
          ? 4000
          : c.id === "tether"
            ? 1
            : c.id === "binancecoin"
              ? 600
              : 200;
    const price = usdPrice / rate;
    return {
      ...c,
      price,
      sparkline: generateFallbackSparkline(price, 24),
      priceChange24h: null,
    };
  });
}

/** Fallback when market_chart fails - uses /simple/price, then static data */
async function fetchTop5Fallback(fiatId: string): Promise<TopCoinWithSparkline[]> {
  try {
    const fallback = await fetchTop5Prices(fiatId);
    const list = fallback.map((c) => ({
      ...c,
      sparkline: c.price > 0 ? generateFallbackSparkline(c.price, 24) : [],
      priceChange24h: null,
    }));
    if (list.some((c) => c.price > 0)) return list;
  } catch {
    /* try static fallback */
  }
  return getStaticTop5Fallback(fiatId);
}

/** Exported fallback for when primary fetch fails. Never throws. */
export async function fetchTop5FallbackSafe(fiatId: string): Promise<TopCoinWithSparkline[]> {
  try {
    return await fetchTop5Fallback(fiatId);
  } catch {
    return getStaticTop5Fallback(fiatId);
  }
}

async function fetchTop5Prices(
  fiatId: string
): Promise<{ id: string; symbol: string; name: string; price: number }[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `${COINGECKO_BASE}/simple/price?ids=${TOP_5_COINS.map((c) => c.id).join(",")}&vs_currencies=${fiatId}`,
      {
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return TOP_5_COINS.map((c) => ({
      ...c,
      price: data[c.id]?.[fiatId] ?? 0,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMarketChart(
  coinId: string,
  vsCurrency: string,
  days: number | "max"
): Promise<[number, number][]> {
  const daysParam = days === "max" ? "max" : String(days);
  const url = `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=${vsCurrency}&days=${daysParam}`;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetchWithRetry(url);
      if (!res) {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      const data = await res.json();
      return data.prices ?? [];
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
    }
  }
  return [];
}

export function pricePointsToArray(points: [number, number][]): number[] {
  return points.map(([, p]) => p);
}

export type PricePoint = [number, number];

export async function getPriceAtTimestamp(
  coinId: string,
  vsCurrency: string,
  timestampMs: number
): Promise<number> {
  try {
    const from = Math.floor(timestampMs / 1000);
    const to = from + 86400;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${coinId}/market_chart/range?vs_currency=${vsCurrency}&from=${from}&to=${to}`,
      {
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return 0;
    const data = await res.json();
    const prices = data.prices ?? [];
    if (prices.length === 0) return 0;
    const closest = prices.reduce((a, b) =>
      Math.abs(a[0] - timestampMs) < Math.abs(b[0] - timestampMs) ? a : b
    );
    return closest[1] ?? 0;
  } catch {
    return 0;
  }
}

export async function getPricesAtTimestampBatch(
  chainIds: string[],
  fiatId: string,
  timestampMs: number
): Promise<Record<string, number>> {
  const uniqueCgIds = [...new Set(chainIds.map((c) => CHAIN_TO_COINGECKO[c]).filter(Boolean))];
  const results = await Promise.all(
    uniqueCgIds.map(async (cgId) => {
      const p = await getPriceAtTimestamp(cgId, fiatId, timestampMs);
      return { cgId, price: p };
    })
  );
  const cgToPrice = Object.fromEntries(results.map((r) => [r.cgId, r.price]));
  const out: Record<string, number> = {};
  for (const chainId of chainIds) {
    const cgId = CHAIN_TO_COINGECKO[chainId];
    const price = cgId ? cgToPrice[cgId] ?? 0 : 0;
    out[chainId] = price > 0 ? price : getFallbackPrice(chainId, fiatId);
  }
  return out;
}

/** Uses multi-source API (consensus) for supported coins, CoinGecko fallback for others. */
export async function getPrice(chainId: string, fiatId: string): Promise<number> {
  const prices = await getPricesBatch([chainId], fiatId);
  const price = prices[chainId];
  if (price != null && price > 0) return price;
  return getFallbackPrice(chainId, fiatId);
}

/** Get price by CoinGecko id. Uses multi-source for top 5 and mapped chains, CoinGecko for others. */
export async function getPriceByCoinId(coinId: string, fiatId: string): Promise<number> {
  const { prices } = await fetchTop5PricesMultiSource(fiatId);
  const p = prices[coinId];
  if (p != null && p > 0) return p;
  const chainId = COINGECKO_TO_CHAIN[coinId];
  if (chainId) {
    const batch = await getPricesBatch([chainId], fiatId);
    const bp = batch[chainId];
    if (bp != null && bp > 0) return bp;
  }
  const fiat = (fiatId || "usd").toLowerCase();
  const res = await fetchWithRetry(
    `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=${fiat}`
  );
  if (res) {
    try {
      const data = (await res.json()) as Record<string, Record<string, number>>;
      const price = data[coinId]?.[fiat];
      if (price != null && price > 0) return price;
    } catch {
      /* fall through */
    }
  }
  return getFallbackPriceForCoin(coinId, fiatId);
}

export function getFallbackPrice(chainId: string, fiatId: string): number {
  const usdPrice = FALLBACK_PRICES_USD[chainId] ?? FALLBACK_PRICES_USD.ethereum ?? 2000;
  const rate = FIAT_TO_USD[fiatId] ?? 1;
  return usdPrice / rate;
}

/** Generate synthetic sparkline when CoinGecko chart data is unavailable */
export function generateFallbackSparkline(basePrice: number, points = 24): number[] {
  const result: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1 || 1);
    const wave = Math.sin(t * Math.PI * 3) * 0.04 + Math.sin(t * Math.PI * 1.5) * 0.02;
    result.push(basePrice * (1 + wave));
  }
  return result;
}

/** Generate sparkline from price + 24h% when real data unavailable. Reflects trend. */
export function generateTrendSparkline(
  price: number,
  change24h: number,
  points = 24
): number[] {
  const result: number[] = [];
  const startMult = 1 - change24h / 100;
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1 || 1);
    const mult = startMult + t * (1 - startMult);
    result.push(price * mult);
  }
  return result;
}

/** Generate fallback chart data [timestamp_ms, price][] when API fails. */
export function generateFallbackChartData(
  price: number,
  days: number | "max",
  change24h?: number | null
): [number, number][] {
  const points = days === "max" ? 90 : Math.min(Math.max(days * 24, 24), 500);
  const prices =
    change24h != null ? generateTrendSparkline(price, change24h, points) : generateFallbackSparkline(price, points);
  const now = Date.now();
  const spanMs = (days === "max" ? 90 : days) * 24 * 60 * 60 * 1000;
  return prices.map((p, i) => {
    const t = i / (points - 1 || 1);
    const ts = now - spanMs * (1 - t);
    return [ts, p];
  });
}

export { fetchTop5Prices };
