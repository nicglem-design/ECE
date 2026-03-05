"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCurrencySymbol } from "@/lib/currencies";
import { PriceSparklineChart } from "@/components/PriceSparklineChart";
import { SPARKLINE_WIDTH, SPARKLINE_HEIGHT } from "@/lib/chart-config";
import {
  generateFallbackSparkline,
  generateTrendSparkline,
  fetchMarketChartViaAPI,
} from "@/lib/coingecko";
import { TokenLogo } from "@/components/TokenLogo";

const POLL_MS = 5000;
const SPARKLINE_POLL_MS = 60000;

interface TrendingCoin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  sparkline: number[];
  priceChange24h: number | null;
}

function formatPrice(price: number, currencyId: string): string {
  const sym = getCurrencySymbol(currencyId);
  const rounded = Math.round(price * 100) / 100;
  if (rounded >= 1) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (rounded >= 0.01) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export function PopularCryptoWidget() {
  const { currency } = useCurrency();
  const { t } = useLanguage();
  const [coins, setCoins] = useState<TrendingCoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderbookActive, setOrderbookActive] = useState(false);
  const fetchingRef = useRef(false);
  const sparklineFetchingRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const fiat = (currency || "usd").toLowerCase();
    const ts = Date.now();
    type CoinItem = {
      id: string;
      symbol: string;
      name: string;
      current_price: number | null;
      price_change_percentage_24h_in_currency?: number | null;
      price_change_percentage_24h?: number | null;
      sparkline_in_7d?: { price?: number[] };
    };
    let data: CoinItem[] = [];
    try {
      const volumeRes = await fetch(
        `${base}/api/coingecko/popular-by-volume?currency=${encodeURIComponent(fiat)}&_=${ts}`
      );
      if (volumeRes.ok) {
        const parsed = (await volumeRes.json()) as CoinItem[] | { error?: string };
        if (Array.isArray(parsed) && parsed.length > 0) data = parsed;
      }
      if (data.length === 0) {
        const fallbackRes = await fetch(
          `${base}/api/coingecko/coins-markets?currency=${encodeURIComponent(fiat)}&per_page=5&page=1&sparkline=true&order=volume_desc&_=${ts}`
        );
        if (fallbackRes.ok) {
          const fallback = (await fallbackRes.json()) as CoinItem[] | { error?: string };
          if (Array.isArray(fallback) && fallback.length > 0) data = fallback;
        }
      }
      if (data.length === 0) {
        setCoins([]);
        return;
      }
      const ids = data.map((c) => c.id);
      let marketPrices: Record<string, number> = {};
      let marketChange: Record<string, number> = {};
      try {
        const mRes = await fetch(
          `${base}/api/market/prices?currency=${encodeURIComponent(fiat)}&ids=${ids.join(",")}&_=${Date.now()}`
        );
        if (mRes.ok) {
          const mData = (await mRes.json()) as {
            prices?: Record<string, number>;
            priceChange24h?: Record<string, number>;
            source?: string;
          };
          marketPrices = mData.prices ?? {};
          marketChange = mData.priceChange24h ?? {};
          setOrderbookActive(mData.source === "orderbook");
        } else {
          setOrderbookActive(false);
        }
      } catch {
        setOrderbookActive(false);
      }
      const list: TrendingCoin[] = data.map((c) => {
        const spark7d = (c.sparkline_in_7d?.price ?? []) as number[];
        const sparkline = spark7d.length >= 2 ? spark7d : [];
        const price = marketPrices[c.id] ?? c.current_price ?? 0;
        const change24h =
          marketChange[c.id] != null
            ? marketChange[c.id]
            : c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null;
        const finalSparkline =
          sparkline.length >= 2
            ? sparkline
            : change24h != null
              ? generateTrendSparkline(price, change24h)
              : generateFallbackSparkline(price);
        return {
          id: c.id,
          symbol: (c.symbol ?? "").toUpperCase(),
          name: c.name ?? "",
          price,
          sparkline: finalSparkline,
          priceChange24h: change24h,
        };
      });
      setCoins(list);
    } catch {
      setCoins([]);
    } finally {
      fetchingRef.current = false;
    }
  }, [currency]);

  const fetchSparklines = useCallback(async () => {
    if (sparklineFetchingRef.current || coins.length === 0) return;
    sparklineFetchingRef.current = true;
    const fiat = (currency || "usd").toLowerCase();
    try {
      const results = await Promise.all(
        coins.map(async (c) => {
          const points = await fetchMarketChartViaAPI(c.id, fiat, 1);
          const arr = points.map(([, p]) => p);
          const change24h =
            arr.length >= 2 && arr[0] > 0 ? ((arr[arr.length - 1] - arr[0]) / arr[0]) * 100 : null;
          return { id: c.id, sparkline: arr, priceChange24h: change24h };
        })
      );
      setCoins((prev) =>
        prev.map((c) => {
          const r = results.find((x) => x.id === c.id);
          if (!r) return c;
          const sparkline = r.sparkline.length >= 2 ? r.sparkline : c.sparkline;
          return {
            ...c,
            sparkline,
            priceChange24h: r.priceChange24h ?? c.priceChange24h,
          };
        })
      );
    } catch {
      /* ignore */
    } finally {
      sparklineFetchingRef.current = false;
    }
  }, [currency, coins]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [currency]);

  useEffect(() => {
    if (coins.length === 0) return;
    const id = setInterval(fetchData, POLL_MS);
    fetchData();
    return () => clearInterval(id);
  }, [fetchData, coins.length]);

  useEffect(() => {
    if (coins.length === 0) return;
    const id = setInterval(fetchSparklines, SPARKLINE_POLL_MS);
    fetchSparklines();
    return () => clearInterval(id);
  }, [fetchSparklines, coins.length]);

  if (loading && coins.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
        <h2 className="text-lg font-semibold text-slate-200">{t("dashboard.popularCrypto")}</h2>
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl py-3 px-4 animate-pulse"
            >
              <div className="h-5 w-24 rounded bg-slate-700" />
              <div className="h-5 w-20 rounded bg-slate-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-200">{t("dashboard.popularCrypto")}</h2>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400"
          title={orderbookActive ? "Live from order book (active users)" : "Live prices from CoinGecko"}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden />
          Live
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {t("dashboard.livePrices")} {getCurrencySymbol(currency)} · {t("dashboard.byVolume")}
      </p>
      <div className="mt-4 space-y-2">
        {coins.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-500">{t("dashboard.unableToLoad")}</p>
            <button
              onClick={() => fetchData()}
              className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
            >
              {t("common.tryAgain") || "Try again"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 px-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              <div className="min-w-0 flex-1 basis-0" />
              <span className="flex-shrink-0 text-center" style={{ width: SPARKLINE_WIDTH }}>
                {t("dashboard.last24h")}
              </span>
              <div className="flex min-w-0 flex-1 basis-0 justify-end" />
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
                  className="flex items-center gap-4 rounded-lg border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl px-4 py-3 transition hover:bg-slate-700/50"
                >
                  <div className="flex min-w-0 flex-1 basis-0 items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-700/80 text-xs font-medium text-slate-400">
                      {i + 1}
                    </span>
                    <TokenLogo chainId={c.id} symbol={c.symbol} size={28} />
                    <span className="shrink-0 font-medium text-slate-200">{c.symbol}</span>
                  </div>
                  <div className="flex flex-shrink-0 justify-center" style={{ width: SPARKLINE_WIDTH }}>
                    <PriceSparklineChart
                      prices={c.sparkline ?? []}
                      change24h={c.priceChange24h}
                      width={SPARKLINE_WIDTH}
                      height={SPARKLINE_HEIGHT}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 basis-0 flex-col items-end gap-0.5">
                    <span className="font-mono text-sm text-slate-300 tabular-nums">
                      {formatPrice(c.price, currency || "usd")}
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
