/**
 * Order book and matching engine types.
 * CEX-style: prices derived from our own order book and trades.
 */

export type Side = "buy" | "sell";

export interface Order {
  id: string;
  userId: string;
  pair: string;   // e.g. "BTCUSDT"
  side: Side;
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

export interface OrderBookLevel {
  price: number;
  amount: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastTradePrice: number | null;
  lastTradeTime: number | null;
}

/** CoinGecko id -> trading pair symbol */
export const COIN_TO_PAIR: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  solana: "SOLUSDT",
};

export const PAIR_TO_COIN: Record<string, string> = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
};
