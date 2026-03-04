/**
 * Order book and matching engine.
 * Price-time priority. In-memory store (swap to DB/Redis when scaling).
 */

import type { Order, Trade, OrderBookLevel, OrderBookSnapshot } from "./types";
import { PAIR_TO_COIN } from "./types";

let orderIdCounter = 0;
let tradeIdCounter = 0;

const orders = new Map<string, Order>();
const tradesByPair = new Map<string, Trade[]>();
const bidsByPair = new Map<string, Map<number, number>>(); // price -> total amount
const asksByPair = new Map<string, Map<number, number>>();

function nextOrderId(): string {
  return `ord_${Date.now()}_${++orderIdCounter}`;
}

function nextTradeId(): string {
  return `trd_${Date.now()}_${++tradeIdCounter}`;
}

function getOrCreateBook(pair: string): { bids: Map<number, number>; asks: Map<number, number> } {
  if (!bidsByPair.has(pair)) {
    bidsByPair.set(pair, new Map());
    asksByPair.set(pair, new Map());
  }
  return {
    bids: bidsByPair.get(pair)!,
    asks: asksByPair.get(pair)!,
  };
}

function addToBook(book: Map<number, number>, price: number, amount: number) {
  const current = book.get(price) ?? 0;
  const next = current + amount;
  if (next <= 0) book.delete(price);
  else book.set(price, next);
}

/** Match incoming order against the book. Returns executed trades and updated order. */
function matchOrder(order: Order): Trade[] {
  const { pair, side, price, amount } = order;
  const { bids, asks } = getOrCreateBook(pair);
  const counterBook = side === "buy" ? asks : bids;
  const executed: Trade[] = [];
  let remaining = amount - order.filled;

  const prices = Array.from(counterBook.keys()).sort((a, b) =>
    side === "buy" ? a - b : b - a
  );

  for (const bookPrice of prices) {
    if (remaining <= 0) break;
    if (side === "buy" && bookPrice > price) break;
    if (side === "sell" && bookPrice < price) break;

    const bookAmount = counterBook.get(bookPrice) ?? 0;
    if (bookAmount <= 0) {
      counterBook.delete(bookPrice);
      continue;
    }

    const fillAmount = Math.min(remaining, bookAmount);
    const trade: Trade = {
      id: nextTradeId(),
      pair,
      price: bookPrice,
      amount: fillAmount,
      buyOrderId: side === "buy" ? order.id : "",
      sellOrderId: side === "sell" ? order.id : "",
      buyerId: side === "buy" ? order.userId : "book",
      sellerId: side === "sell" ? order.userId : "book",
      timestamp: Date.now(),
    };

    executed.push(trade);
    remaining -= fillAmount;
    order.filled += fillAmount;

    addToBook(counterBook, bookPrice, -fillAmount);

    const pairTrades = tradesByPair.get(pair) ?? [];
    pairTrades.push(trade);
    tradesByPair.set(pair, pairTrades);
  }

  order.status =
    order.filled >= order.amount ? "filled" : order.filled > 0 ? "partially_filled" : "open";

  return executed;
}

/** Place a limit order. Returns order and any executed trades. */
export function placeOrder(
  userId: string,
  pair: string,
  side: "buy" | "sell",
  price: number,
  amount: number
): { order: Order; trades: Trade[] } {
  const order: Order = {
    id: nextOrderId(),
    userId,
    pair,
    side,
    price,
    amount,
    filled: 0,
    createdAt: Date.now(),
    status: "open",
  };

  orders.set(order.id, order);

  const { bids, asks } = getOrCreateBook(pair);
  const ourBook = side === "buy" ? bids : asks;
  addToBook(ourBook, price, amount);

  const trades = matchOrder(order);

  if (order.filled > 0) {
    addToBook(ourBook, price, -order.filled);
  }

  return { order, trades };
}

/** Get order book snapshot for a pair. */
export function getOrderBook(pair: string): OrderBookSnapshot {
  const { bids, asks } = getOrCreateBook(pair);
  const pairTrades = tradesByPair.get(pair) ?? [];
  const lastTrade = pairTrades[pairTrades.length - 1];

  const bidLevels: OrderBookLevel[] = Array.from(bids.entries())
    .filter(([, amt]) => amt > 0)
    .sort(([a], [b]) => b - a)
    .slice(0, 20)
    .map(([price, amount]) => ({ price, amount }));

  const askLevels: OrderBookLevel[] = Array.from(asks.entries())
    .filter(([, amt]) => amt > 0)
    .sort(([a], [b]) => a - b)
    .slice(0, 20)
    .map(([price, amount]) => ({ price, amount }));

  return {
    bids: bidLevels,
    asks: askLevels,
    lastTradePrice: lastTrade?.price ?? null,
    lastTradeTime: lastTrade?.timestamp ?? null,
  };
}

/** Get last trade price for a pair, or null if no trades. */
export function getLastTradePrice(pair: string): number | null {
  const pairTrades = tradesByPair.get(pair) ?? [];
  const last = pairTrades[pairTrades.length - 1];
  return last?.price ?? null;
}

/** Get mid price (best bid + best ask) / 2, or null if no depth. */
export function getMidPrice(pair: string): number | null {
  const { bids, asks } = getOrCreateBook(pair);
  const bestBid = Math.max(...bids.keys(), 0);
  const bestAsk = Math.min(...asks.keys(), Infinity);
  if (bestBid <= 0 || bestAsk === Infinity) return null;
  return (bestBid + bestAsk) / 2;
}

/**
 * Get our prices for supported pairs.
 * Returns { prices: Record<coinId, number>, source: "orderbook" } when we have data,
 * else null (caller should use external feed).
 */
export function getOurPrices(currency: string): {
  prices: Record<string, number>;
  priceChange24h: Record<string, number>;
  source: "orderbook";
} | null {
  const FIAT_TO_USD: Record<string, number> = {
    usd: 1,
    eur: 1.08,
    gbp: 1.27,
    sek: 0.09,
    nok: 0.09,
    dkk: 0.14,
  };
  const rate = FIAT_TO_USD[currency.toLowerCase()] ?? 1;

  const prices: Record<string, number> = {};
  const priceChange24h: Record<string, number> = {};

  for (const [pair, coinId] of Object.entries(PAIR_TO_COIN)) {
    const lastTrade = getLastTradePrice(pair);
    const midPrice = getMidPrice(pair);
    const price = lastTrade ?? midPrice;
    if (price != null && price > 0) {
      prices[coinId] = price / rate;
      priceChange24h[coinId] = 0; // We don't track 24h change from our book yet
    }
  }

  if (Object.keys(prices).length === 0) return null;

  prices["tether"] = 1 / rate;
  priceChange24h["tether"] = 0;

  return { prices, priceChange24h, source: "orderbook" };
}

/** Get recent trades for a pair. */
export function getTrades(pair: string, limit = 50): Trade[] {
  const pairTrades = tradesByPair.get(pair) ?? [];
  return pairTrades.slice(-limit).reverse();
}

const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

/**
 * Get chart data [timestamp_ms, price][] from our trades.
 * Returns null when we have fewer than 2 trades in range.
 */
export function getChartFromTrades(
  pair: string,
  days: number,
  currency: string
): [number, number][] | null {
  const pairTrades = tradesByPair.get(pair) ?? [];
  const cutoff = Date.now() - days * 86400 * 1000;
  const recent = pairTrades.filter((t) => t.timestamp >= cutoff);
  if (recent.length < 2) return null;
  const rate = FIAT_TO_USD[currency.toLowerCase()] ?? 1;
  const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.map((t) => [t.timestamp, t.price / rate]);
}
