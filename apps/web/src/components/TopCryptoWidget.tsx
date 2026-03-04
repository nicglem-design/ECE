"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchTop5Sparklines24h,
  fetchTop5LivePricesFast,
  fetchTop5FallbackSafe,
  generateFallbackSparkline,
  generateTrendSparkline,
  type TopCoinWithSparkline,
} from "@/lib/coingecko";
import { usePriceStream } from "@/hooks/usePriceStream";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCurrencySymbol } from "@/lib/currencies";
import { PriceSparklineChart } from "@/components/PriceSparklineChart";
import { SPARKLINE_WIDTH, SPARKLINE_HEIGHT } from "@/lib/chart-config";

const PRICE_POLL_MS = 2000; // REST fallback when WebSocket disconnected
const SPARKLINE_POLL_MS = 60000; // 60 sec - 24h charts (CoinGecko rate limits)

function formatPrice(price: number, currencyId: string): string {
  const sym = getCurrencySymbol(currencyId);
  const rounded = Math.round(price * 100) / 100;
  if (rounded >= 1) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (rounded >= 0.01) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export function TopCryptoWidget() {
  const { currency } = useCurrency();
  const { t } = useLanguage();
  const { prices: wsPrices, priceChange24h: wsChange24h, connected: wsConnected } = usePriceStream(currency);
  const [coins, setCoins] = useState<TopCoinWithSparkline[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);
  const sparklineFetchingRef = useRef(false);

  const fetchFullData = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    // Initial load: live prices first (fast), then sparklines - real-time from exchange APIs
    fetchTop5LivePricesFast(currency)
      .then(({ prices, priceChange24h }) => {
        const list: TopCoinWithSparkline[] = [
          { id: "bitcoin", symbol: "BTC", name: "Bitcoin", price: prices.bitcoin ?? 0, sparkline: [], priceChange24h: priceChange24h.bitcoin ?? null },
          { id: "ethereum", symbol: "ETH", name: "Ethereum", price: prices.ethereum ?? 0, sparkline: [], priceChange24h: priceChange24h.ethereum ?? null },
          { id: "tether", symbol: "USDT", name: "Tether", price: prices.tether ?? 1, sparkline: [], priceChange24h: priceChange24h.tether ?? null },
          { id: "binancecoin", symbol: "BNB", name: "BNB", price: prices.binancecoin ?? 0, sparkline: [], priceChange24h: priceChange24h.binancecoin ?? null },
          { id: "solana", symbol: "SOL", name: "Solana", price: prices.solana ?? 0, sparkline: [], priceChange24h: priceChange24h.solana ?? null },
        ].map((c) => ({
          ...c,
          sparkline: c.priceChange24h != null ? generateTrendSparkline(c.price, c.priceChange24h) : generateFallbackSparkline(c.price),
        }));
        if (list.some((c) => c.price > 0)) {
          setCoins(list);
          setLoading(false);
          fetchingRef.current = false;
          // Fetch sparklines in background
          fetchTop5Sparklines24h(currency).then((sparkData) => {
            if (sparkData) {
              setCoins((prev) =>
                prev.map((c) => {
                  const s = sparkData[c.id];
                  const sparkline = s?.sparkline?.length >= 2 ? s.sparkline : c.sparkline;
                  return { ...c, sparkline, priceChange24h: s?.priceChange24h ?? c.priceChange24h };
                })
              );
            }
          }).catch(() => {});
          return null;
        }
        return fetchTop5FallbackSafe(currency);
      })
      .then((fallback) => {
        if (fallback && Array.isArray(fallback) && fallback.length > 0) {
          setCoins(fallback);
        }
      })
      .catch(async () => {
        const fallback = await fetchTop5FallbackSafe(currency);
        setCoins(fallback);
      })
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  }, [currency]);

  const fetchPricesOnly = useCallback(() => {
    if (coins.length === 0) return;
    fetchTop5LivePricesFast(currency)
      .then(({ prices, priceChange24h }) => {
        if (Object.keys(prices).length > 0) {
          setCoins((prev) =>
            prev.map((c) => ({
              ...c,
              price: prices[c.id] ?? c.price,
              priceChange24h: priceChange24h[c.id] ?? c.priceChange24h ?? null,
            }))
          );
        }
      })
      .catch(() => {});
  }, [currency, coins.length]);

  const fetchSparklinesOnly = useCallback(() => {
    if (sparklineFetchingRef.current || coins.length === 0) return;
    sparklineFetchingRef.current = true;
    fetchTop5Sparklines24h(currency)
      .then((sparkData) => {
        setCoins((prev) =>
          prev.map((c) => {
            const s = sparkData[c.id];
            if (!s) return c;
            const newChange = s.priceChange24h != null ? s.priceChange24h : c.priceChange24h;
            let sparkline = s.sparkline?.length >= 2 ? s.sparkline : c.sparkline ?? [];
            if (sparkline.length < 2 && c.price > 0) {
              sparkline = newChange != null ? generateTrendSparkline(c.price, newChange) : generateFallbackSparkline(c.price);
            }
            return {
              ...c,
              sparkline,
              priceChange24h: newChange,
            };
          })
        );
      })
      .catch(() => {})
      .finally(() => {
        sparklineFetchingRef.current = false;
      });
  }, [currency, coins.length]);

  useEffect(() => {
    setLoading(true);
    fetchFullData();
  }, [fetchFullData]);

  // Apply stream prices when we have data (from usePriceStream)
  useEffect(() => {
    if (coins.length === 0) return;
    const hasCryptoPrices = Object.keys(wsPrices).some((k) => k !== "tether");
    if (!hasCryptoPrices) return;
    setCoins((prev) =>
      prev.map((c) => ({
        ...c,
        price: wsPrices[c.id] ?? c.price,
        priceChange24h: wsChange24h[c.id] ?? c.priceChange24h ?? null,
      }))
    );
  }, [wsPrices, wsChange24h, coins.length]);

  // REST polling - always runs as backup so prices update even if stream fails
  useEffect(() => {
    if (coins.length === 0) return;
    const id = setInterval(fetchPricesOnly, PRICE_POLL_MS);
    fetchPricesOnly();
    return () => clearInterval(id);
  }, [fetchPricesOnly, coins.length]);

  useEffect(() => {
    if (coins.length === 0) return;
    const id = setInterval(fetchSparklinesOnly, SPARKLINE_POLL_MS);
    fetchSparklinesOnly();
    return () => clearInterval(id);
  }, [fetchSparklinesOnly, coins.length]);

  if (loading && coins.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <h2 className="text-lg font-semibold text-slate-200">{t("dashboard.topCrypto")}</h2>
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-800/50 py-3 px-4 animate-pulse">
              <div className="h-5 w-24 rounded bg-slate-700" />
              <div className="h-5 w-20 rounded bg-slate-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-200">{t("dashboard.topCrypto")}</h2>
        {wsConnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400" title="Live stream (Binance-style types, own API)">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400" title="REST polling fallback">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
            Polling
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {t("dashboard.livePrices")} {getCurrencySymbol(currency)} · {t("dashboard.byMarketCap")}
      </p>
      <div className="mt-4 space-y-2">
        {coins.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            {t("dashboard.unableToLoad")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] items-center gap-4 px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <span />
              <span className="text-center">{t("dashboard.last7d")}</span>
              <span />
            </div>
            {coins.map((c, i) => {
              const spark = c.sparkline;
              const change24h =
                c.priceChange24h ??
                (spark.length >= 2 && spark[0] > 0
                  ? ((spark[spark.length - 1] - spark[0]) / spark[0]) * 100
                  : 0);
              const changeColor =
                change24h > 0 ? "text-green-400" : change24h < 0 ? "text-red-400" : "text-slate-500";
              return (
                <Link
                  key={c.id}
                  href={`/crypto/${c.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] items-center gap-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3 transition hover:border-slate-600 hover:bg-slate-800/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-700/80 text-xs font-medium text-slate-400">
                      {i + 1}
                    </span>
                    <span className="shrink-0 font-medium text-slate-200">{c.symbol}</span>
                    <span className="truncate text-sm text-slate-500">{c.name}</span>
                  </div>
                  <div className="flex justify-center">
                    <PriceSparklineChart
                      prices={c.sparkline ?? []}
                      change24h={c.priceChange24h}
                      width={SPARKLINE_WIDTH}
                      height={SPARKLINE_HEIGHT}
                    />
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-sm text-slate-300 tabular-nums">
                      {formatPrice(c.price, currency)}
                    </span>
                    <span className={`text-xs font-medium tabular-nums ${changeColor}`}>
                      {change24h > 0 ? "+" : ""}
                      {change24h.toFixed(2)}% 7d
                    </span>
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
