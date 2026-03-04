"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchTop5DataFull,
  fetchTop5Sparklines24h,
  fetchTop5PricesMultiSource,
  fetchTop5FallbackSafe,
  generateFallbackSparkline,
  generateTrendSparkline,
  type TopCoinWithSparkline,
} from "@/lib/coingecko";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCurrencySymbol } from "@/lib/currencies";
import { PriceSparklineChart } from "@/components/PriceSparklineChart";

const PRICE_POLL_MS = 2000; // 2 sec - real-time prices
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
  const [coins, setCoins] = useState<TopCoinWithSparkline[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchingRef = useRef(false);
  const sparklineFetchingRef = useRef(false);

  const fetchFullData = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    fetchTop5DataFull(currency)
      .then((list) => {
        if (list.length > 0) setCoins(list);
        else return fetchTop5FallbackSafe(currency);
      })
      .then((fallback) => {
        if (fallback && fallback.length > 0) setCoins(fallback);
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
    if (fetchingRef.current || coins.length === 0) return;
    fetchingRef.current = true;
    fetchTop5PricesMultiSource(currency)
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
      .catch(() => {})
      .finally(() => {
        fetchingRef.current = false;
      });
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
      <h2 className="text-lg font-semibold text-slate-200">{t("dashboard.topCrypto")}</h2>
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
            <div className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] items-center gap-4 px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <span />
              <span className="text-center">{t("dashboard.last24h")}</span>
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
                  className="grid grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)] items-center gap-4 rounded-lg border border-slate-700/50 bg-slate-800/30 px-4 py-3 transition hover:border-slate-600 hover:bg-slate-800/50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-700/80 text-xs font-medium text-slate-400">
                      {i + 1}
                    </span>
                    <span className="shrink-0 font-medium text-slate-200">{c.symbol}</span>
                    <span className="truncate text-sm text-slate-500">{c.name}</span>
                  </div>
                  <div className="flex justify-center">
                    <PriceSparklineChart prices={c.sparkline ?? []} change24h={c.priceChange24h} />
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-sm text-slate-300 tabular-nums">
                      {formatPrice(c.price, currency)}
                    </span>
                    <span className={`text-xs font-medium tabular-nums ${changeColor}`}>
                      {change24h > 0 ? "+" : ""}
                      {change24h.toFixed(2)}% 24h
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
