/**
 * Order book persistence in SQLite.
 */

import { db } from "../db";

db.exec(`
  CREATE TABLE IF NOT EXISTS market_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pair TEXT NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,
    filled REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_market_orders_user ON market_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_market_orders_pair ON market_orders(pair);
  CREATE INDEX IF NOT EXISTS idx_market_orders_status ON market_orders(status);

  CREATE TABLE IF NOT EXISTS market_trades (
    id TEXT PRIMARY KEY,
    pair TEXT NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,
    buy_order_id TEXT NOT NULL,
    sell_order_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_market_trades_pair ON market_trades(pair);

  CREATE TABLE IF NOT EXISTS market_book (
    pair TEXT NOT NULL,
    side TEXT NOT NULL,
    price REAL NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (pair, side, price)
  );
`);

export function nextOrderId(): string {
  return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nextTradeId(): string {
  return `trd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface Order {
  id: string;
  userId: string;
  pair: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  filled: number;
  createdAt: number;
  status: "open" | "filled" | "partially_filled" | "cancelled";
}

export interface Trade {
  id: string;
  pair: string;
  price: number;
  amount: number;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  timestamp: number;
}

export function insertOrder(o: Order): void {
  db.prepare(
    "INSERT INTO market_orders (id, user_id, pair, side, price, amount, filled, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(o.id, o.userId, o.pair, o.side, o.price, o.amount, o.filled, o.status, o.createdAt);
}

export function updateOrder(id: string, filled: number, status: string): void {
  db.prepare("UPDATE market_orders SET filled = ?, status = ? WHERE id = ?").run(filled, status, id);
}

export function insertTrade(t: Trade): void {
  db.prepare(
    "INSERT INTO market_trades (id, pair, price, amount, buy_order_id, sell_order_id, buyer_id, seller_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(t.id, t.pair, t.price, t.amount, t.buyOrderId, t.sellOrderId, t.buyerId, t.sellerId, t.timestamp);
}

export function getBookLevels(pair: string, side: "buy" | "sell"): Map<number, number> {
  const rows = db.prepare(
    "SELECT price, amount FROM market_book WHERE pair = ? AND side = ? AND amount > 0"
  ).all(pair, side) as { price: number; amount: number }[];
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.price, r.amount);
  return m;
}

export function updateBookLevel(pair: string, side: "buy" | "sell", price: number, delta: number): void {
  const row = db.prepare(
    "SELECT amount FROM market_book WHERE pair = ? AND side = ? AND price = ?"
  ).get(pair, side, price) as { amount: number } | undefined;
  const current = row?.amount ?? 0;
  const next = current + delta;
  if (next <= 0) {
    db.prepare("DELETE FROM market_book WHERE pair = ? AND side = ? AND price = ?").run(pair, side, price);
  } else if (row) {
    db.prepare("UPDATE market_book SET amount = ? WHERE pair = ? AND side = ? AND price = ?").run(next, pair, side, price);
  } else {
    db.prepare("INSERT INTO market_book (pair, side, price, amount) VALUES (?, ?, ?, ?)").run(pair, side, price, next);
  }
}

export function getOrderById(id: string): Order | null {
  const row = db.prepare(
    "SELECT id, user_id as userId, pair, side, price, amount, filled, status, created_at as createdAt FROM market_orders WHERE id = ?"
  ).get(id) as Order | undefined;
  return row ?? null;
}

export function getOrdersByUser(
  userId: string,
  options?: { pair?: string; status?: string; limit?: number }
): Order[] {
  let sql = "SELECT id, user_id as userId, pair, side, price, amount, filled, status, created_at as createdAt FROM market_orders WHERE user_id = ?";
  const params: (string | number)[] = [userId];
  if (options?.pair) {
    sql += " AND pair = ?";
    params.push(options.pair);
  }
  if (options?.status) {
    sql += " AND status = ?";
    params.push(options.status);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(options?.limit ?? 50);
  return db.prepare(sql).all(...params) as Order[];
}

export function getTrades(pair: string, limit = 50): Trade[] {
  const rows = db.prepare(
    "SELECT id, pair, price, amount, buy_order_id as buyOrderId, sell_order_id as sellOrderId, buyer_id as buyerId, seller_id as sellerId, timestamp FROM market_trades WHERE pair = ? ORDER BY timestamp DESC LIMIT ?"
  ).all(pair, limit) as Trade[];
  return rows.reverse();
}
