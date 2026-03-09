/**
 * Market / order book API. Persisted in SQLite.
 */

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import {
  placeOrder,
  cancelOrder,
  getOrdersByUser,
  getOrderBookSnapshot,
  getTrades,
  getLastTradePrice,
  getMidPrice,
  getChartFromTrades,
  PAIR_TO_COIN,
  COIN_TO_PAIR,
} from "../orderbook/engine";

const router = Router();

/** Resolve userId from auth. */
async function getUserId(req: Request): Promise<string | null> {
  const user = (req as Request & { user?: { sub: string } }).user;
  return user?.sub ?? null;
}

/** GET /orders - List user's orders */
router.get("/orders", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const pair = req.query.pair as string | undefined;
  const status = req.query.status as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 100);
  const orders = await getOrdersByUser(user.sub, { pair, status, limit });
  res.json({ orders });
});

/** POST /orders - Place limit order. Auth required, or X-Internal-Key for server-to-server (e.g. market maker). */
router.post("/orders", (req: Request, res: Response, next: () => void) => {
  const internalKey = req.headers["x-internal-key"] as string | undefined;
  const expectedKey = process.env.API_INTERNAL_KEY;
  if (internalKey && expectedKey && internalKey === expectedKey) {
    (req as Request & { user?: { sub: string } }).user = { sub: req.body?.userId || "mm" };
    return next();
  }
  authMiddleware(req, res, next);
}, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const { pair, side, price, amount } = req.body;
  const internalKey = req.headers["x-internal-key"] as string | undefined;
  const isInternal = !!(internalKey && process.env.API_INTERNAL_KEY && internalKey === process.env.API_INTERNAL_KEY);
  const effectiveUserId = isInternal ? (req.body?.userId || "mm") : user.sub;
  if (!pair || !side || !price || !amount) {
    res.status(400).json({ error: "pair, side, price, amount required" });
    return;
  }
  if (side !== "buy" && side !== "sell") {
    res.status(400).json({ error: "side must be buy or sell" });
    return;
  }
  const normalizedPair = String(pair).toUpperCase().replace(/-/g, "");
  const numPrice = parseFloat(String(price));
  const numAmount = parseFloat(String(amount));
  if (isNaN(numPrice) || numPrice <= 0 || isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: "price and amount must be positive numbers" });
    return;
  }
  try {
    const { order, trades } = await placeOrder(effectiveUserId, normalizedPair, side, numPrice, numAmount);
    res.json({ order, trades });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Place order failed" });
  }
});

/** DELETE /orders/:orderId - Cancel order */
router.delete("/orders/:orderId", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const ok = await cancelOrder(req.params.orderId, user.sub);
  if (!ok) {
    res.status(404).json({ error: "Order not found or not cancellable" });
    return;
  }
  res.json({ success: true });
});

/** GET /orderbook/:pair - Get order book snapshot */
router.get("/orderbook/:pair", async (req: Request, res: Response) => {
  const pair = String(req.params.pair || "").toUpperCase().replace(/-/g, "");
  if (!pair) {
    res.status(400).json({ error: "pair required" });
    return;
  }
  const snapshot = await getOrderBookSnapshot(pair);
  res.json(snapshot);
});

/** GET /trades/:pair - Get recent trades */
router.get("/trades/:pair", async (req: Request, res: Response) => {
  const pair = String(req.params.pair || "").toUpperCase().replace(/-/g, "");
  const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 100);
  const trades = await getTrades(pair, limit);
  res.json({ trades });
});

/** GET /prices - Get our prices from order book */
router.get("/prices", async (req: Request, res: Response) => {
  const currency = (req.query.currency as string) || "usd";
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
    const [lastTrade, midPrice] = await Promise.all([getLastTradePrice(pair), getMidPrice(pair)]);
    const price = lastTrade ?? midPrice;
    if (price != null && price > 0) {
      prices[coinId] = price / rate;
      priceChange24h[coinId] = 0;
    }
  }

  if (Object.keys(prices).length === 0) {
    res.json({ prices: {}, priceChange24h: {}, source: null });
    return;
  }

  prices["tether"] = 1 / rate;
  priceChange24h["tether"] = 0;
  res.json({ prices, priceChange24h, source: "orderbook" });
});

/** GET /chart - Get chart data from our trades */
router.get("/chart", async (req: Request, res: Response) => {
  const coinId = req.query.coinId as string;
  const currency = (req.query.currency as string) || "usd";
  const days = Math.min(Math.max(1, parseInt(String(req.query.days || "7"), 10)), 365);

  if (!coinId) {
    res.status(400).json({ error: "coinId required" });
    return;
  }

  const pair = COIN_TO_PAIR[coinId];
  if (!pair) {
    res.json({ prices: [], candles: null, source: "external" });
    return;
  }

  const prices = await getChartFromTrades(pair, days, currency);
  if (prices && prices.length >= 2) {
    res.json({ prices, candles: null, source: "orderbook" });
  } else {
    res.json({ prices: [], candles: null, source: "external" });
  }
});

export default router;
