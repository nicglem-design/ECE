/**
 * Binance-compatible WebSocket event types.
 * Use these types for a consistent market-data format without depending on Binance.
 * Data can come from any source (CoinGecko, consensus API, etc.) and be formatted to match.
 */

/** Stream name format: {symbol}@{streamType} e.g. btcusdt@miniTicker */
export type StreamType = "trade" | "miniTicker" | "ticker" | "kline_1m" | "kline_5m" | "kline_1h" | "kline_1d";

/** Base fields present in all Binance-style events */
export interface BinanceEventBase {
  /** Event type identifier */
  e: string;
  /** Event time (ms) */
  E: number;
  /** Symbol e.g. BTCUSDT */
  s: string;
}

/** @trade - Raw trade (single fill) */
export interface BinanceTradeEvent extends BinanceEventBase {
  e: "trade";
  t: number;   // Trade ID
  p: string;   // Price
  q: string;   // Quantity
  T: number;   // Trade time
  m: boolean; // Buyer is maker
  M?: boolean;
}

/** @miniTicker - 24h rolling window mini ticker */
export interface BinanceMiniTickerEvent extends BinanceEventBase {
  e: "24hrMiniTicker";
  c: string;   // Close price
  o: string;   // Open price
  h: string;   // High price
  l: string;   // Low price
  v: string;   // Base asset volume
  q: string;   // Quote asset volume
}

/** @ticker - 24h rolling window full ticker */
export interface BinanceTickerEvent extends BinanceEventBase {
  e: "24hrTicker";
  p: string;   // Price change
  P: string;   // Price change percent
  w: string;   // Weighted average price
  x: string;   // First trade price (24h ago)
  c: string;   // Last price
  Q: string;   // Last quantity
  b: string;   // Best bid
  B: string;   // Best bid qty
  a: string;   // Best ask
  A: string;   // Best ask qty
  o: string;   // Open price
  h: string;   // High price
  l: string;   // Low price
  v: string;   // Base volume
  q: string;   // Quote volume
  O: number;   // Stats open time
  C: number;   // Stats close time
  F: number;   // First trade ID
  L: number;   // Last trade ID
  n: number;   // Trade count
}

/** Kline (candlestick) inner payload */
export interface BinanceKlinePayload {
  t: number;   // Kline start time
  T: number;   // Kline close time
  s: string;   // Symbol
  i: string;   // Interval (1m, 5m, 1h, 1d)
  f: number;   // First trade ID
  L: number;   // Last trade ID
  o: string;   // Open price
  c: string;   // Close price
  h: string;   // High price
  l: string;   // Low price
  v: string;   // Base volume
  n: number;   // Trade count
  x: boolean;  // Is kline closed
  q: string;   // Quote volume
  V: string;   // Taker buy base volume
  Q: string;   // Taker buy quote volume
  B?: string;
}

/** @kline - Candlestick update */
export interface BinanceKlineEvent extends BinanceEventBase {
  e: "kline";
  k: BinanceKlinePayload;
}

/** Combined stream wrapper (when using /stream?streams=...) */
export interface BinanceCombinedStreamPayload<T = BinanceMiniTickerEvent | BinanceTradeEvent | BinanceKlineEvent> {
  stream: string;
  data: T;
}

/** Union of all stream event types */
export type BinanceStreamEvent =
  | BinanceTradeEvent
  | BinanceMiniTickerEvent
  | BinanceTickerEvent
  | BinanceKlineEvent;
