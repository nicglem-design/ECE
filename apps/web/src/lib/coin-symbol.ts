/**
 * Dynamic symbol resolution for any coin.
 * Fetches from CoinGecko when not in static map - supports all existing and future tokens.
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

/** Static overrides: CoinGecko id -> exchange symbol (for rebrands, etc.) */
const SYMBOL_OVERRIDES: Record<string, string> = {
  "matic-network": "MATIC",
  polygon: "MATIC",
  matic: "MATIC",
};

/** In-memory cache: coinId -> symbol, TTL 1 hour */
const symbolCache = new Map<string, { symbol: string; expires: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Get trading symbol for a CoinGecko coin ID.
 * Uses static overrides first, then fetches from CoinGecko API.
 * Returns null if coin not found.
 */
export async function getSymbolForCoin(coinId: string): Promise<string | null> {
  const override = SYMBOL_OVERRIDES[coinId];
  if (override) return override;

  const cached = symbolCache.get(coinId);
  if (cached && cached.expires > Date.now()) return cached.symbol;

  try {
    const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { symbol?: string };
    const symbol = data.symbol?.toUpperCase?.() ?? null;
    if (symbol) {
      symbolCache.set(coinId, { symbol, expires: Date.now() + CACHE_TTL_MS });
    }
    return symbol;
  } catch {
    return null;
  }
}

/**
 * Get Binance symbol (e.g. BTCUSDT) for a coin.
 */
export async function getBinanceSymbol(coinId: string): Promise<string | null> {
  const symbol = await getSymbolForCoin(coinId);
  return symbol ? `${symbol}USDT` : null;
}

/**
 * Get CryptoCompare symbol (e.g. BTC) for a coin.
 */
export async function getCryptoCompareSymbol(coinId: string): Promise<string | null> {
  return getSymbolForCoin(coinId);
}

/** Bybit uses POL for Polygon (rebrand). */
const BYBIT_OVERRIDES: Record<string, string> = {
  "matic-network": "POL",
  polygon: "POL",
  matic: "POL",
  "137": "POL",
};

/**
 * Get Bybit symbol (e.g. BTCUSDT) for a coin.
 */
export async function getBybitSymbol(coinId: string): Promise<string | null> {
  const override = BYBIT_OVERRIDES[coinId];
  if (override) return `${override}USDT`;
  const symbol = await getSymbolForCoin(coinId);
  return symbol ? `${symbol}USDT` : null;
}
