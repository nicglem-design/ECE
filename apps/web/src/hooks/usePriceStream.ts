"use client";

import { useEffect, useState } from "react";
import { fetchTop5LivePricesFast } from "@/lib/coingecko";
import type { BinanceMiniTickerEvent } from "@/lib/binance-types";
import {
  fromAppPricesMap,
  parseMiniTickerEvent,
} from "@/lib/binance-format";

const POLL_MS = 1000; // 1s - Binance miniTicker update speed

export type PriceStreamData = {
  prices: Record<string, number>;
  priceChange24h: Record<string, number>;
};

type Listener = (data: PriceStreamData) => void;
type ConnectionListener = (connected: boolean) => void;

let listeners = new Set<Listener>();
let connectionListeners = new Set<ConnectionListener>();
let lastData: PriceStreamData = { prices: { tether: 1 }, priceChange24h: {} };
let pollInterval: ReturnType<typeof setInterval> | null = null;
let currentCurrency: string | null = null;

function setConnectedState(connected: boolean) {
  connectionListeners.forEach((fn) => fn(connected));
}

function notifyListeners(data: PriceStreamData) {
  lastData = data;
  listeners.forEach((fn) => fn(data));
}

async function pollAndEmit(fiatId: string) {
  try {
    const { prices, priceChange24h } = await fetchTop5LivePricesFast(fiatId);
    if (Object.keys(prices).length > 0) {
      setConnectedState(true);
      const events = fromAppPricesMap(prices, priceChange24h);
      const out: PriceStreamData = {
        prices: { tether: prices.tether ?? 1 },
        priceChange24h: { tether: priceChange24h.tether ?? 0 },
      };
      for (const { data } of events) {
        const parsed = parseMiniTickerEvent(data as BinanceMiniTickerEvent);
        if (parsed) {
          out.prices[parsed.coinId] = parsed.price;
          out.priceChange24h[parsed.coinId] = parsed.priceChange24h;
        }
      }
      notifyListeners(out);
    }
  } catch {
    setConnectedState(false);
  }
}

function startPolling(fiatId: string) {
  if (typeof window === "undefined") return;
  if (pollInterval && currentCurrency === fiatId) return;
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  currentCurrency = fiatId;
  pollInterval = setInterval(() => pollAndEmit(fiatId), POLL_MS);
  pollAndEmit(fiatId);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  currentCurrency = null;
  setConnectedState(false);
}

/**
 * Price stream using Binance-style types (miniTicker) but fetching from own API.
 * No Binance connection - uses consensus/CoinGecko via fetchTop5LivePricesFast.
 */
export function usePriceStream(currency: string) {
  const [data, setData] = useState<PriceStreamData>({
    prices: { tether: 1 },
    priceChange24h: {},
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const listener: Listener = (d) => setData(d);
    const connListener: ConnectionListener = (c) => setConnected(c);
    listeners.add(listener);
    connectionListeners.add(connListener);
    if (Object.keys(lastData.prices).length > 1) listener(lastData);

    if (typeof window !== "undefined") {
      startPolling(currency);
      return () => {
        listeners.delete(listener);
        connectionListeners.delete(connListener);
        if (listeners.size === 0) stopPolling();
      };
    }
    return () => {
      listeners.delete(listener);
      connectionListeners.delete(connListener);
    };
  }, [currency]);

  return {
    prices: data.prices,
    priceChange24h: data.priceChange24h,
    connected,
  };
}
