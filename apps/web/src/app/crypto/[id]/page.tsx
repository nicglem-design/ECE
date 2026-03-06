"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  fetchMarketChartForDetail,
  fetchTop5LivePricesFast,
  generateFallbackChartData,
  getPriceAndChangeForCoin,
  getPriceByCoinId,
  TOP_5_COINS,
} from "@/lib/coingecko";
import { usePriceStream } from "@/hooks/usePriceStream";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getCurrencySymbol } from "@/lib/currencies";
import { CryptoDetailChart, type ChartRange, type ChartMode } from "@/components/CryptoDetailChart";
import { useChartMode } from "@/contexts/ChartModeContext";
import { TokenLogo } from "@/components/TokenLogo";

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
  const router = useRouter();
  const { currency } = useCurrency();
  const { t } = useLanguage();
  const { prices: wsPrices, priceChange24h: wsChange24h } = usePriceStream(currency);
  const id = typeof params?.id === "string" ? params.id : "";
  const coin = getCoinInfo(id || "");
  const isTop5 = TOP_5_COINS.some((c) => c.id === id);

  const [chartData, setChartData] = useState<[number, number][]>([]);
  const [chartCandles, setChartCandles] = useState<{ time: number; open: number; high: number; low: number; close: number }[] | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number | null>(null);
  const chartMaxDays = id === "tether" ? 365 : undefined;
  const [range, setRange] = useState<ChartRange>("7");
  const { chartMode, setChartMode } = useChartMode();
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartHeight, setChartHeight] = useState(420);
  const [isFallbackChart, setIsFallbackChart] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateHeight = () => {
      const h = el.clientHeight;
      if (h > 0) setChartHeight(Math.max(320, h));
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
      const days = parseInt(r, 10);
      const { prices, candles } = await fetchMarketChartForDetail(id, currency, days);
      if (prices.length > 0) {
        setChartData(prices);
        setChartCandles(candles && candles.length > 0 ? candles : null);
        setIsFallbackChart(false);
      } else {
        const { price, priceChange24h } = await getPriceAndChangeForCoin(id, currency);
        const fallback = generateFallbackChartData(price, days, priceChange24h);
        setChartData(fallback);
        setChartCandles(null);
        setIsFallbackChart(true);
      }
      setChartLoading(false);
    },
    [id, currency]
  );

  useEffect(() => {
    if (!id) return;
    const effectiveRange =
      chartMaxDays != null && parseInt(range, 10) > chartMaxDays ? "365" : range;
    if (effectiveRange !== range) setRange(effectiveRange as ChartRange);
    fetchChart(effectiveRange as ChartRange);
  }, [id, range, fetchChart, chartMaxDays]);

  const fetchPrice = useCallback((showLoading = false) => {
    if (!id) return;
    if (showLoading) setLoading(true);
    const done = () => { if (showLoading) setLoading(false); };
    if (isTop5) {
      fetchTop5LivePricesFast(currency)
        .then(({ prices, priceChange24h: change }) => {
          const p = prices[id];
          if (p != null && p > 0) setPrice(p);
          if (change[id] != null) setPriceChange24h(change[id]);
        })
        .finally(done);
    } else {
      getPriceByCoinId(id, currency)
        .then((p) => { if (p > 0) setPrice(p); })
        .finally(done);
    }
  }, [id, currency, isTop5]);

  // Initial fetch + REST polling (always runs as backup)
  useEffect(() => {
    fetchPrice(true);
    const idInterval = setInterval(() => fetchPrice(false), 5000);
    return () => clearInterval(idInterval);
  }, [fetchPrice]);

  // Stream prices for top-5 coins (apply when we have data)
  useEffect(() => {
    if (!isTop5 || !id) return;
    const p = wsPrices[id];
    const ch = wsChange24h[id];
    if (p != null && p > 0) setPrice(p);
    if (ch != null) setPriceChange24h(ch);
  }, [isTop5, id, wsPrices, wsChange24h]);

  // When price/change updates and we're showing fallback chart, regenerate chart with live data
  useEffect(() => {
    if (!id || !isFallbackChart || price == null || price <= 0) return;
    const days = parseInt(range, 10);
    const fallback = generateFallbackChartData(price, days, priceChange24h ?? undefined);
    setChartData(fallback);
    setChartCandles(null);
  }, [id, isFallbackChart, price, priceChange24h, range]);

  const changeColor = priceChange24h != null
    ? priceChange24h > 0 ? "text-green-400" : priceChange24h < 0 ? "text-red-400" : "text-slate-500"
    : "text-slate-500";

  return (
    <ProtectedRoute>
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800/50 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
            aria-label={t("common.back") || "Back"}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <TokenLogo chainId={id} symbol={coin.symbol} size={40} />
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
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-6">
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4">
          {chartLoading && chartData.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            </div>
          ) : chartData.length > 0 ? (
            <div ref={containerRef} className="flex min-h-0 flex-1 flex-col" style={{ minHeight: 320 }}>
              <CryptoDetailChart
                data={chartData}
                candles={chartCandles}
                range={range}
                onRangeChange={setRange}
                chartMode={chartMode}
                height={chartHeight}
                maxDays={chartMaxDays}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              {t("crypto.noChartData") || "No chart data available"}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {chartData.length > 0 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setChartMode("simple")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  chartMode === "simple"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
              >
                {t("portfolio.chartSimple")}
              </button>
              <button
                type="button"
                onClick={() => setChartMode("complex")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  chartMode === "complex"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
              >
                {t("portfolio.chartComplex")}
              </button>
            </div>
          )}
          <div className="flex flex-1 flex-wrap gap-3 sm:justify-end">
            <Link
              href={`/exchange?buy=${id}`}
              className="flex items-center justify-center rounded-xl bg-amber-500 px-6 py-4 text-base font-semibold text-white transition hover:bg-amber-600"
            >
              {t("crypto.buy") || "Buy"} {coin.symbol}
            </Link>
          </div>
        </div>
      </main>
    </div>
    </ProtectedRoute>
  );
}
