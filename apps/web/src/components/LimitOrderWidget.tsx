"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { apiPost, apiFetch } from "@/lib/apiClient";
import { PAIR_TO_COIN } from "@/lib/orderbook/types";
import { useCurrency } from "@/contexts/CurrencyContext";

const SUPPORTED_PAIRS = Object.entries(PAIR_TO_COIN).map(([pair, coinId]) => ({
  pair,
  coinId,
  base: pair.replace("USDT", ""),
}));

interface OrderBookSnapshot {
  bids: { price: number; amount: number }[];
  asks: { price: number; amount: number }[];
  lastTradePrice: number | null;
  lastTradeTime: number | null;
}

interface Order {
  id: string;
  pair: string;
  side: string;
  price: number;
  amount: number;
  filled: number;
  status: string;
  createdAt: number;
}

export function LimitOrderWidget() {
  const { isAuthenticated } = useAuth();
  const { profile } = useProfile();
  const { currency } = useCurrency();
  const [pair, setPair] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBookSnapshot | null>(null);
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const fetchMyOrders = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await apiFetch("/api/market/orders?status=open&limit=20");
      if (res.ok) {
        const data = (await res.json()) as { orders?: Order[] };
        setMyOrders(data.orders ?? []);
      }
    } catch {
      setMyOrders([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchMyOrders();
    const id = setInterval(fetchMyOrders, 5000);
    return () => clearInterval(id);
  }, [fetchMyOrders]);

  const handleCancelOrder = async (orderId: string) => {
    setCancellingId(orderId);
    try {
      const res = await apiFetch(`/api/market/orders/${orderId}`, { method: "DELETE" });
      if (res.ok) {
        setSuccess("Order cancelled");
        fetchMyOrders();
        fetchOrderBook();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Cancel failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingId(null);
    }
  };

  const fetchOrderBook = useCallback(async () => {
    try {
      const res = await fetch(`/api/market/orderbook/${pair}`);
      if (res.ok) {
        const data = (await res.json()) as OrderBookSnapshot;
        setOrderBook(data);
        const last = data.lastTradePrice;
        if (last != null) setMarketPrice(last);
        else if (data.asks.length > 0 && data.bids.length > 0) {
          const mid = (data.asks[0].price + data.bids[0].price) / 2;
          setMarketPrice(mid);
        } else setMarketPrice(null);
      }
    } catch {
      setOrderBook(null);
      setMarketPrice(null);
    }
  }, [pair]);

  useEffect(() => {
    fetchOrderBook();
    const id = setInterval(fetchOrderBook, 3000);
    return () => clearInterval(id);
  }, [fetchOrderBook]);

  const fetchMarketPrice = useCallback(async () => {
    const coinId = PAIR_TO_COIN[pair];
    if (!coinId) return;
    try {
      const res = await fetch(`/api/coingecko/coin-price?coinId=${encodeURIComponent(coinId)}&currency=${currency || "usd"}`);
      if (res.ok) {
        const data = (await res.json()) as { price?: number };
        if (data.price != null && data.price > 0) setMarketPrice(data.price);
      }
    } catch {
      // ignore
    }
  }, [pair, currency]);

  useEffect(() => {
    if (marketPrice == null) fetchMarketPrice();
  }, [marketPrice, fetchMarketPrice]);

  const useMarketPrice = () => {
    if (marketPrice != null) setPrice(String(marketPrice));
  };

  const handlePlaceOrder = async () => {
    const numPrice = parseFloat(price);
    const numAmount = parseFloat(amount);
    if (isNaN(numPrice) || numPrice <= 0 || isNaN(numAmount) || numAmount <= 0) {
      setError("Enter valid price and amount");
      return;
    }
    if (!isAuthenticated || !profile?.id) {
      setError("Sign in to place limit orders");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await apiPost<{ order?: { id: string; filled: number }; trades?: unknown[] }>(
        "/api/market/orders",
        {
          userId: profile.id,
          pair,
          side,
          price: numPrice,
          amount: numAmount,
        }
      );
      const ord = data.order;
      const filled = ord?.filled ?? 0;
      const msg =
        filled >= numAmount
          ? `Order filled: ${numAmount} @ ${numPrice}`
          : filled > 0
            ? `Partially filled: ${filled}/${numAmount} @ ${numPrice}`
            : `Limit order placed: ${numAmount} @ ${numPrice}`;
      setSuccess(msg);
      setPrice("");
      setAmount("");
      fetchOrderBook();
      fetchMyOrders();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setLoading(false);
    }
  };

  const sym = pair.replace("USDT", "");
  const totalUsd = parseFloat(amount) && parseFloat(price) ? parseFloat(amount) * parseFloat(price) : 0;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-slate-200">Limit order</h3>
      <p className="text-sm text-slate-500">
        Place a limit order to buy or sell at a specific price. Orders may fill immediately if the market matches.
      </p>

      {!isAuthenticated && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 px-4 py-2 text-sm text-amber-200/90">
          Sign in to place limit orders.
        </div>
      )}

      <div className="rounded-xl border border-slate-600 bg-slate-800/40 p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400">Pair</label>
          <select
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
          >
            {SUPPORTED_PAIRS.map(({ pair: p, base }) => (
              <option key={p} value={p}>
                {base}/USDT
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSide("buy")}
            className={`flex-1 rounded-lg py-2 font-medium transition ${
              side === "buy"
                ? "bg-green-500/30 text-green-400 border border-green-500/50"
                : "border border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide("sell")}
            className={`flex-1 rounded-lg py-2 font-medium transition ${
              side === "sell"
                ? "bg-red-500/30 text-red-400 border border-red-500/50"
                : "border border-slate-600 bg-slate-800 text-slate-400 hover:bg-slate-700"
            }`}
          >
            Sell
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400">Price (USDT)</label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={marketPrice != null ? String(marketPrice) : "0"}
              min="0"
              step="any"
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
            />
            {marketPrice != null && (
              <button
                type="button"
                onClick={useMarketPrice}
                className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-xs text-slate-400 hover:bg-slate-600"
              >
                Market
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400">Amount ({sym})</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min="0"
            step="any"
            className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
          />
          {totalUsd > 0 && (
            <p className="mt-1 text-xs text-slate-500">≈ {totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT</p>
          )}
        </div>

        <button
          onClick={handlePlaceOrder}
          disabled={loading || !isAuthenticated || !profile?.id || !price || !amount}
          className={`w-full rounded-xl py-3 font-semibold text-white transition disabled:opacity-50 ${
            side === "buy"
              ? "bg-green-600 hover:bg-green-500 disabled:hover:bg-green-600"
              : "bg-red-600 hover:bg-red-500 disabled:hover:bg-red-600"
          }`}
        >
          {loading ? "Placing..." : `Place ${side} order`}
        </button>
      </div>

      {isAuthenticated && myOrders.length > 0 && (
        <div className="rounded-xl border border-slate-600 bg-slate-800/40 p-4">
          <h4 className="mb-3 text-sm font-medium text-slate-400">My open orders</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {myOrders.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-lg bg-slate-700/30 px-3 py-2 text-sm"
              >
                <div>
                  <span className={o.side === "buy" ? "text-green-400" : "text-red-400"}>
                    {o.side.toUpperCase()}
                  </span>
                  <span className="ml-2 text-slate-300">
                    {o.pair.replace("USDT", "")} {o.amount - o.filled} @ {o.price.toLocaleString()}
                  </span>
                </div>
                <button
                  onClick={() => handleCancelOrder(o.id)}
                  disabled={cancellingId === o.id}
                  className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {cancellingId === o.id ? "..." : "Cancel"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {orderBook && (orderBook.bids.length > 0 || orderBook.asks.length > 0) && (
        <div className="rounded-xl border border-slate-600 bg-slate-800/40 p-4">
          <h4 className="mb-3 text-sm font-medium text-slate-400">Order book</h4>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="mb-1 font-medium text-green-400">Bids</div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {orderBook.bids.slice(0, 8).map((b, i) => (
                  <div key={i} className="flex justify-between text-slate-400">
                    <span>{b.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span>{b.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 font-medium text-red-400">Asks</div>
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {orderBook.asks.slice(0, 8).map((a, i) => (
                  <div key={i} className="flex justify-between text-slate-400">
                    <span>{a.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span>{a.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-800/50 bg-green-900/20 px-4 py-2 text-green-400 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
