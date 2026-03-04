/**
 * Convert app data to Binance-style event format.
 * Use with any data source (CoinGecko, consensus, etc.) - no Binance dependency.
 */

import type { BinanceMiniTickerEvent, BinanceCombinedStreamPayload } from "./binance-types";

/** CoinGecko id -> Binance symbol (USDT pair). Tether has no USDT pair. */
export const COIN_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
};

/** Binance symbol -> CoinGecko id */
export const SYMBOL_TO_COIN: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
};

/**
 * Build a miniTicker event from price + 24h change.
 * Used when you have data from any source (REST, CoinGecko, etc.)
 */
export function toMiniTickerEvent(
  symbol: string,
  closePrice: number,
  openPrice: number,
  volume = 0
): BinanceMiniTickerEvent {
  const c = closePrice.toFixed(8);
  const o = openPrice.toFixed(8);
  const change = openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;
  const high = Math.max(closePrice, openPrice).toFixed(8);
  const low = Math.min(closePrice, openPrice).toFixed(8);
  return {
    e: "24hrMiniTicker",
    E: Date.now(),
    s: symbol,
    c,
    o,
    h: high,
    l: low,
    v: volume.toFixed(2),
    q: (closePrice * volume).toFixed(2),
  };
}

/**
 * Convert app price data (coinId, price, change24h) to miniTicker.
 */
export function fromAppPrice(
  coinId: string,
  price: number,
  priceChange24h: number | null
): BinanceMiniTickerEvent | null {
  const symbol = COIN_TO_SYMBOL[coinId];
  if (!symbol) return null;
  if (price <= 0) return null;

  const openPrice =
    priceChange24h != null
      ? price / (1 + priceChange24h / 100)
      : price * 0.99;

  return toMiniTickerEvent(symbol, price, openPrice);
}

/**
 * Convert app prices map to combined stream payloads (Binance-style).
 */
export function fromAppPricesMap(
  prices: Record<string, number>,
  priceChange24h: Record<string, number | null>
): BinanceCombinedStreamPayload<BinanceMiniTickerEvent>[] {
  const out: BinanceCombinedStreamPayload<BinanceMiniTickerEvent>[] = [];
  for (const [coinId, price] of Object.entries(prices)) {
    const event = fromAppPrice(coinId, price, priceChange24h[coinId] ?? null);
    if (event) {
      const stream = `${event.s.toLowerCase()}@miniTicker`;
      out.push({ stream, data: event });
    }
  }
  return out;
}

/**
 * Parse a miniTicker event into app prices (coinId, price, change24h).
 */
export function parseMiniTickerEvent(
  data: BinanceMiniTickerEvent
): { coinId: string; price: number; priceChange24h: number } | null {
  const coinId = SYMBOL_TO_COIN[data.s];
  if (!coinId) return null;

  const closePrice = parseFloat(data.c);
  const openPrice = parseFloat(data.o);
  if (closePrice <= 0) return null;

  const priceChange24h =
    openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : 0;

  return { coinId, price: closePrice, priceChange24h };
}
