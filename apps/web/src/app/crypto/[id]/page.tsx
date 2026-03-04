"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchMarketChartViaAPI,
  fetchTop5PricesMultiSource,
  generateFallbackChartData,
  getFallbackPriceForCoin,
} from "@/lib/coingecko";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getCurrencySymbol } from "@/lib/currencies";
import { CryptoDetailChart, type ChartRange } from "@/components/CryptoDetailChart";

const COIN_NAMES: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: "BTC", name: "Bitcoin" },
  ethereum: { symbol: "ETH", name: "Ethereum" },
  tether: { symbol: "USDT", name: "Tether" },
  binancecoin: { symbol: "BNB", name: "BNB" },
  solana: { symbol: "SOL", name: "Solana" },
};

function getCoinInfo(id: string) {
  const known = COIN_NAMES[id];
  if (known) return known;
  const name = id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const symbol = id.split("-")[0]?.toUpperCase() ?? id.toUpperCase();
  return { symbol, name };
}

function formatPrice(price: number, currencyId: string): string {
  const sym = getCurrencySymbol(currencyId);
  const rounded = Math.round(price * 100) / 100;
  if (rounded >= 1) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (rounded >= 0.01) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export default function CryptoDetailPage() {
  const params = useParams();
  const { currency } = useCurrency();
  const { t } = useLanguage();
  const id = typeof params?.id === "string" ? params.id : "";
  const coin = getCoinInfo(id || "");

  const [chartData, setChartData] = useState<[number, number][]>([]);
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);
  const [range, setRange] = useState<ChartRange>("7");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(350);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      const h = el.clientHeight;
      if (h > 0) setChartHeight(Math.max(280, h));
    };
    updateHeight();
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fetchChart = useCallback(
    async (r: ChartRange) => {
      if (!id) return;
      setChartLoading(true);
      const days: number | "max" = r === "max" ? "max" : parseInt(r, 10);
      const points = await fetchMarketChartViaAPI(id, currency, days);
      if (points.length > 0) {
        setChartData(points);
      } else {
        const { prices, priceChange24h } = await fetchTop5PricesMultiSource(currency);
        const price = prices[id] ?? getFallbackPriceForCoin(id, currency);
        const change = priceChange24h[id] ?? null;
        const fallback = generateFallbackChartData(price, days, change);
        setChartData(fallback);
      }
      setChartLoading(false);
    },
    [id, currency]
  );

  useEffect(() => {
    if (!id) return;
    fetchChart(range);
  }, [id, range, fetchChart]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchTop5PricesMultiSource(currency)
      .then(({ prices, priceChange24h: change }) => {
        const p = prices[id];
        if (p != null) setPrice(p);
        if (change[id] != null) setPriceChange24h(change[id]);
      })
      .finally(() => setLoading(false));
  }, [id, currency]);

  const changeColor = priceChange24h != null
    ? priceChange24h > 0 ? "text-green-400" : priceChange24h < 0 ? "text-red-400" : "text-slate-500"
    : "text-slate-500";

  return (
    <ProtectedRoute>
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800/50 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
            aria-label={t("common.back") || "Back"}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-200 sm:text-xl">
              {coin.symbol} · {coin.name}
            </h1>
            <p className="text-sm text-slate-500">
              {loading ? "—" : price != null ? formatPrice(price, currency) : "—"}
              {priceChange24h != null && (
                <span className={`ml-2 font-medium ${changeColor}`}>
                  {priceChange24h > 0 ? "+" : ""}{priceChange24h.toFixed(2)}% 24h
                </span>
              )}
            </p>
          </div>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
          {chartLoading && chartData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          ) : chartData.length > 0 ? (
            <div ref={containerRef} className="flex min-h-0 flex-1 flex-col" style={{ minHeight: 280 }}>
              <CryptoDetailChart
                data={chartData}
                range={range}
                onRangeChange={setRange}
                height={chartHeight}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              {t("crypto.noChartData") || "No chart data available"}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/exchange?buy=${id}`}
            className="flex items-center justify-center rounded-xl bg-amber-500 px-6 py-4 text-base font-semibold text-white transition hover:bg-amber-600"
          >
            {t("crypto.buy") || "Buy"} {coin.symbol}
          </Link>
          <Link
            href="/exchange"
            className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/50 px-6 py-4 text-base font-medium text-slate-200 transition hover:bg-slate-700"
          >
            {t("crypto.openExchange") || "Open Exchange"}
          </Link>
        </div>
      </main>
    </div>
    </ProtectedRoute>
  );
}
