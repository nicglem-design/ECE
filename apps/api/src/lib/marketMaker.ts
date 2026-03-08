/**
 * Market maker: seeds the order book with liquidity for instant swaps.
 * Fetches prices from CoinGecko and places buy/sell orders around the mid.
 */

import { placeOrder, cancelOrder, getOrdersByUser, PAIR_TO_COIN } from "../orderbook/engine";

/** Amount per level (base asset). */
const AMOUNT_PER_LEVEL: Record<string, number> = {
  BTCUSDT: 0.001,
  ETHUSDT: 0.01,
  BNBUSDT: 0.05,
  SOLUSDT: 0.5,
  DOGEUSDT: 100,
  PEPEUSDT: 1000000,
  BONKUSDT: 10000,
  SHIBUSDT: 100000,
};

const SPREAD_BPS = 100; // 1% spread each side
const LEVELS = 3;

async function fetchPrices(): Promise<Record<string, number>> {
  const ids = [...new Set(Object.values(PAIR_TO_COIN))].join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("CoinGecko fetch failed");
  const data = (await res.json()) as Record<string, { usd?: number }>;
  const prices: Record<string, number> = {};
  for (const [pair, coinId] of Object.entries(PAIR_TO_COIN)) {
    const p = data[coinId]?.usd;
    if (p != null && p > 0) prices[pair] = p;
  }
  return prices;
}

/** Cancel all open MM orders. */
async function cancelMMOrders(): Promise<number> {
  const orders = await getOrdersByUser("mm", { status: "open", limit: 200 });
  let cancelled = 0;
  for (const o of orders) {
    const ok = await cancelOrder(o.id, "mm");
    if (ok) cancelled++;
  }
  return cancelled;
}

/** Seed order book with market maker liquidity. */
export async function seedMarketMaker(): Promise<{
  pairs: number;
  ordersPlaced: number;
  cancelled: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let ordersPlaced = 0;

  try {
    const cancelled = await cancelMMOrders();
    const prices = await fetchPrices();
    const pairs = Object.keys(prices);

    for (const pair of pairs) {
      const price = prices[pair];
      const amount = AMOUNT_PER_LEVEL[pair] ?? 0.001;
      const spread = (price * SPREAD_BPS) / 10000;

      for (let i = 1; i <= LEVELS; i++) {
        try {
          const buyPrice = Math.floor((price - spread * i) * 100) / 100;
          await placeOrder("mm", pair, "buy", buyPrice, amount);
          ordersPlaced++;
        } catch (e) {
          errors.push(`${pair} buy: ${e instanceof Error ? e.message : String(e)}`);
        }
        try {
          const sellPrice = Math.ceil((price + spread * i) * 100) / 100;
          await placeOrder("mm", pair, "sell", sellPrice, amount);
          ordersPlaced++;
        } catch (e) {
          errors.push(`${pair} sell: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return {
      pairs: pairs.length,
      ordersPlaced,
      cancelled,
      errors: errors.slice(0, 10),
    };
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { pairs: 0, ordersPlaced: 0, cancelled: 0, errors };
  }
}
