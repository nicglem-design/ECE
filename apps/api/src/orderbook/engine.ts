/**
 * Order book matching engine with Supabase/SQLite persistence.
 */

import {
  nextOrderId,
  nextTradeId,
  insertOrder,
  updateOrder,
  insertTrade,
  getBookLevels,
  updateBookLevel,
  getOrderById,
  getOrdersByUser,
  getTrades,
  type Order,
  type Trade,
} from "./db";

export const PAIR_TO_COIN: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
  DOGEUSDT: "dogecoin",
  PEPEUSDT: "pepe",
  BONKUSDT: "bonk",
  SHIBUSDT: "shiba-inu",
};

export const COIN_TO_PAIR: Record<string, string> = Object.fromEntries(
  Object.entries(PAIR_TO_COIN).map(([pair, coin]) => [coin, pair])
);

async function addToBook(
  pair: string,
  side: "buy" | "sell",
  price: number,
  amount: number
): Promise<void> {
  await updateBookLevel(pair, side, price, amount);
}

/** Match incoming order against the book. Returns executed trades and updated order. */
async function matchOrder(order: Order): Promise<Trade[]> {
  const { pair, side, price, amount } = order;
  const bids = await getBookLevels(pair, "buy");
  const asks = await getBookLevels(pair, "sell");
  const counterBook = side === "buy" ? asks : bids;
  const counterSide = side === "buy" ? "sell" : "buy";
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
    if (bookAmount <= 0) continue;

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

    await addToBook(pair, counterSide, bookPrice, -fillAmount);
    await insertTrade(trade);
  }

  order.status =
    order.filled >= order.amount ? "filled" : order.filled > 0 ? "partially_filled" : "open";
  await updateOrder(order.id, order.filled, order.status);

  return executed;
}

/** Place a limit order. Returns order and any executed trades. */
export async function placeOrder(
  userId: string,
  pair: string,
  side: "buy" | "sell",
  price: number,
  amount: number
): Promise<{ order: Order; trades: Trade[] }> {
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

  await insertOrder(order);
  const ourSide = side;
  await addToBook(pair, ourSide, price, amount);

  const trades = await matchOrder(order);

  if (order.filled > 0) {
    await addToBook(pair, ourSide, price, -order.filled);
  }

  return { order, trades };
}

/** Cancel an open order. Returns true if cancelled. */
export async function cancelOrder(orderId: string, userId: string): Promise<boolean> {
  const order = await getOrderById(orderId);
  if (!order || order.userId !== userId) return false;
  if (order.status !== "open") return false;

  const remaining = order.amount - order.filled;
  if (remaining > 0) {
    await addToBook(order.pair, order.side, order.price, -remaining);
  }
  await updateOrder(order.id, order.filled, "cancelled");
  return true;
}

export { getOrdersByUser, getOrderById, getTrades };

export async function getOrderBookSnapshot(pair: string): Promise<{
  bids: { price: number; amount: number }[];
  asks: { price: number; amount: number }[];
  lastTradePrice: number | null;
  lastTradeTime: number | null;
}> {
  const [bids, asks, pairTrades] = await Promise.all([
    getBookLevels(pair, "buy"),
    getBookLevels(pair, "sell"),
    getTrades(pair, 1),
  ]);
  const lastTrade = pairTrades[0] ?? null;

  const bidLevels = Array.from(bids.entries())
    .filter(([, amt]) => amt > 0)
    .sort(([a], [b]) => b - a)
    .slice(0, 20)
    .map(([price, amount]) => ({ price, amount }));

  const askLevels = Array.from(asks.entries())
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

export async function getLastTradePrice(pair: string): Promise<number | null> {
  const trades = await getTrades(pair, 1);
  return trades[0]?.price ?? null;
}

export async function getMidPrice(pair: string): Promise<number | null> {
  const [bids, asks] = await Promise.all([
    getBookLevels(pair, "buy"),
    getBookLevels(pair, "sell"),
  ]);
  const bidPrices = Array.from(bids.keys()).filter((p) => (bids.get(p) ?? 0) > 0);
  const askPrices = Array.from(asks.keys()).filter((p) => (asks.get(p) ?? 0) > 0);
  const bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : 0;
  const bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : Infinity;
  if (bestBid <= 0 || bestAsk === Infinity) return null;
  return (bestBid + bestAsk) / 2;
}

const FIAT_TO_USD: Record<string, number> = {
  usd: 1,
  eur: 1.08,
  gbp: 1.27,
  sek: 0.09,
  nok: 0.09,
  dkk: 0.14,
};

export async function getChartFromTrades(
  pair: string,
  days: number,
  currency: string
): Promise<[number, number][] | null> {
  const trades = await getTrades(pair, 1000);
  const cutoff = Date.now() - days * 86400 * 1000;
  const recent = trades.filter((t) => t.timestamp >= cutoff);
  if (recent.length < 2) return null;
  const rate = FIAT_TO_USD[currency.toLowerCase()] ?? 1;
  const sorted = [...recent].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.map((t) => [t.timestamp, t.price / rate]);
}
