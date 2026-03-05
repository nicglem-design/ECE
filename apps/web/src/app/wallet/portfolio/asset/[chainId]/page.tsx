"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  fetchMarketChartForDetail,
  generateFallbackChartData,
  getPriceAndChangeForCoin,
  getPriceForAsset,
  getPricesBatch,
  CHAIN_TO_COINGECKO,
} from "@/lib/coingecko";
import { useWalletBalances, useWalletTransactions } from "@/hooks/useWallet";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { getCurrencySymbol } from "@/lib/currencies";
import { CryptoDetailChart, type ChartRange, type ChartMode } from "@/components/CryptoDetailChart";
import { TokenLogo } from "@/components/TokenLogo";

function getAssetDisplay(chainId: string, symbol?: string, name?: string) {
  const sym = symbol ?? chainId.split("-")[0]?.toUpperCase() ?? chainId.toUpperCase();
  const nm = name ?? chainId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { symbol: sym, name: nm };
}

function shortenAddress(addr: string, chars = 6): string {
  if (!addr || addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatValue(value: number, currencyId: string): string {
  const sym = getCurrencySymbol(currencyId);
  const rounded = Math.round(value * 100) / 100;
  if (rounded >= 1) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (rounded >= 0.01) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export default function AssetPortfolioChartPage() {
  const params = useParams();
  const { currency } = useCurrency();
  const { t } = useLanguage();
  const { isPro } = useTerminology();
  const { assets, loading: assetsLoading } = useWalletBalances();
  const chainId = typeof params?.chainId === "string" ? params.chainId : "";

  const asset = assets.find(
    (a) => a.chainId === chainId || (a as { chain_id?: string }).chain_id === chainId
  );
  const display = getAssetDisplay(chainId, asset?.symbol, asset?.name);
  const amount = asset ? parseFloat(asset.amount) || 0 : 0;
  const { transactions, explorerTx, loading: txLoading } = useWalletTransactions(chainId || null);

  const cgId = CHAIN_TO_COINGECKO[chainId] ?? chainId;
  const chartMaxDays = cgId === "tether" ? 365 : undefined;

  const [chartData, setChartData] = useState<[number, number][]>([]);
  const [chartCandles, setChartCandles] = useState<{ time: number; open: number; high: number; low: number; close: number }[] | null>(null);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [pricePerToken, setPricePerToken] = useState<number | null>(null);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [range, setRange] = useState<ChartRange>("7");
  const [chartLoading, setChartLoading] = useState(true);
  const [isFallbackChart, setIsFallbackChart] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("complex");
  const CHART_HEIGHT = 360;

  const fetchChart = useCallback(
    async (r: ChartRange) => {
      if (!chainId || !cgId) return;
      setChartLoading(true);
      const days = parseInt(r, 10);
      const { prices, candles } = await fetchMarketChartForDetail(cgId, currency, days);

      if (prices.length > 0) {
        const portfolioData: [number, number][] = prices.map(([ts, price]) => [ts, amount * price]);
        setChartData(portfolioData);
        if (candles && candles.length > 0) {
          setChartCandles(
            candles.map((c) => ({
              ...c,
              open: amount * c.open,
              high: amount * c.high,
              low: amount * c.low,
              close: amount * c.close,
            }))
          );
        } else {
          setChartCandles(null);
        }
        setIsFallbackChart(false);
        if (portfolioData.length >= 2) {
          const first = portfolioData[0][1];
          const last = portfolioData[portfolioData.length - 1][1];
          setPortfolioValue(last);
          setChangePct(first > 0 ? ((last - first) / first) * 100 : null);
        } else {
          setPortfolioValue(portfolioData[0]?.[1] ?? null);
          setChangePct(null);
        }
        setPricePerToken((prev) => prev ?? prices[prices.length - 1]?.[1] ?? null);
      } else {
        const { price, priceChange24h } = await getPriceAndChangeForCoin(cgId, currency);
        const fallback = generateFallbackChartData(price, days, priceChange24h);
        const portfolioFallback: [number, number][] = fallback.map(([ts, p]) => [ts, amount * p]);
        setChartData(portfolioFallback);
        setChartCandles(null);
        setIsFallbackChart(true);
        setPortfolioValue(amount * price);
        setChangePct(priceChange24h);
        setPricePerToken((prev) => prev ?? price);
      }
      setChartLoading(false);
    },
    [chainId, cgId, currency, amount]
  );

  useEffect(() => {
    if (!chainId || !asset) return;
    const effectiveRange =
      chartMaxDays != null && parseInt(range, 10) > chartMaxDays ? "365" : range;
    if (effectiveRange !== range) setRange(effectiveRange as ChartRange);
    fetchChart(effectiveRange as ChartRange);
  }, [chainId, asset, range, fetchChart, chartMaxDays]);

  const fetchCurrentPrice = useCallback(() => {
    if (!chainId) return;
    getPriceForAsset(chainId, currency || "usd").then((price) => {
      if (price != null && price > 0) {
        setPricePerToken(price);
        if (asset) {
          const amt = parseFloat(asset.amount) || 0;
          if (amt > 0) setPortfolioValue(amt * price);
        }
      }
    });
  }, [chainId, currency, asset]);

  useEffect(() => {
    if (!chainId) return;
    fetchCurrentPrice();
    const interval = setInterval(fetchCurrentPrice, 30000);
    return () => clearInterval(interval);
  }, [chainId, fetchCurrentPrice]);


  const changeColor =
    changePct != null
      ? changePct > 0
        ? "text-green-400"
        : changePct < 0
          ? "text-red-400"
          : "text-slate-500"
      : "text-slate-500";

  if (!chainId) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-400">
          <p>Invalid asset</p>
          <Link href="/wallet/portfolio" className="text-sky-400 hover:underline">
            Back to portfolio
          </Link>
        </div>
      </ProtectedRoute>
    );
  }

  if (assetsLoading) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="text-slate-400">{(isPro ? t("portfolio.loadingAssets") : t("portfolio.loadingCoins")) || "Loading..."}</p>
        </div>
      </ProtectedRoute>
    );
  }

  if (!assetsLoading && assets.length > 0 && !asset) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-400">
          <p>{isPro ? t("portfolio.assetNotFound") : t("portfolio.coinNotFound")}</p>
          <Link href="/wallet/portfolio" className="text-sky-400 hover:underline">
            {t("portfolio.backToPortfolio") || "Back to portfolio"}
          </Link>
        </div>
      </ProtectedRoute>
    );
  }

  if (!assetsLoading && assets.length === 0) {
    return (
      <ProtectedRoute>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-400">
          <p>{isPro ? t("portfolio.noAssets") : t("portfolio.noCoins")}</p>
          <Link href="/wallet/portfolio" className="text-sky-400 hover:underline">
            {t("portfolio.backToPortfolio") || "Back to portfolio"}
          </Link>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-800/50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/wallet/portfolio"
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
              aria-label={t("common.back") || "Back"}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex items-center gap-3">
              <TokenLogo chainId={chainId} symbol={display.symbol} size={40} />
              <div>
                <h1 className="text-lg font-semibold text-slate-200 sm:text-xl">
                  {display.symbol} · {t("portfolio.assetValue") || "Portfolio value"}
                </h1>
              <p className="text-sm text-slate-500">
                {portfolioValue != null ? formatValue(portfolioValue, currency || "usd") : "—"}
                {changePct != null && (
                  <span className={`ml-2 font-medium ${changeColor}`}>
                    {changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%
                  </span>
                )}
              </p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">{display.symbol} {t("portfolio.pricePerToken") || "Price"}</p>
            <p className="font-mono text-sm font-medium text-slate-200 sm:text-base">
              {pricePerToken != null ? formatValue(pricePerToken, currency || "usd") : "—"}
            </p>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          <div className="flex shrink-0 flex-col rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4" style={{ minHeight: 460 }}>
            {chartLoading && chartData.length === 0 ? (
              <div className="flex h-[380px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
              </div>
            ) : chartData.length > 0 ? (
              <div className="w-full">
                <CryptoDetailChart
                  data={chartData}
                  candles={chartCandles}
                  range={range}
                  onRangeChange={setRange}
                  chartMode={chartMode}
                  height={CHART_HEIGHT}
                  maxDays={chartMaxDays}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500">
                <p>{t("portfolio.noChartData") || "No chart data available"}</p>
                <Link
                  href="/wallet/portfolio"
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
                >
                  {t("portfolio.backToPortfolio") || "Back to portfolio"}
                </Link>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/wallet/send?chain=${encodeURIComponent(chainId)}`}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-500/50 hover:bg-slate-700"
              >
                <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7h-6M17 7v6" />
                </svg>
                {t("wallet.send")}
              </Link>
              <Link
                href={`/wallet/receive?chain=${encodeURIComponent(chainId)}`}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-sky-500/50 hover:bg-slate-700"
              >
                <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 7L7 17M7 17h6M7 17v-6" />
                </svg>
                {t("wallet.receive")}
              </Link>
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-amber-500/50 hover:bg-slate-700"
                title={isPro ? t("portfolio.stake") : t("portfolio.earn")}
              >
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                {isPro ? t("portfolio.stake") : t("portfolio.earn")}
              </button>
            </div>
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
          </div>

          <div className="mt-12">
            <h2 className="text-lg font-semibold text-slate-200">{t("portfolio.transactionHistory")}</h2>
            {txLoading ? (
              <p className="mt-4 text-slate-500">{t("common.loading")}</p>
            ) : transactions.length === 0 ? (
              <p className="mt-4 text-slate-500">{t("portfolio.noTransactions")}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {transactions.map((tx, i) => (
                  <div
                    key={tx.txHash + i}
                    className="rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`text-sm font-medium ${
                          tx.type === "received" ? "text-green-400" : "text-amber-400"
                        }`}
                      >
                        {tx.type === "received" ? t("portfolio.received") : t("portfolio.sent")}
                      </span>
                      <span className="font-mono text-slate-200">
                        {tx.amount} {display.symbol}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-slate-500">{t("portfolio.from")}: </span>
                        <span className="font-mono text-slate-300" title={tx.from}>
                          {shortenAddress(tx.from)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">{t("portfolio.to")}: </span>
                        <span className="font-mono text-slate-300" title={tx.to}>
                          {shortenAddress(tx.to)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-slate-500">{formatTimestamp(tx.timestamp)}</span>
                      <a
                        href={explorerTx + tx.txHash}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-sky-400 hover:underline"
                      >
                        {t("portfolio.viewOnExplorer")}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={`/exchange?buy=${cgId}`}
              className="flex items-center justify-center rounded-xl bg-amber-500 px-6 py-4 text-base font-semibold text-white transition hover:bg-amber-600"
            >
              {t("crypto.buy") || "Buy"} {display.symbol}
            </Link>
            <Link
              href="/wallet/portfolio"
              className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-800/50 px-6 py-4 text-base font-medium text-slate-200 transition hover:bg-slate-700"
            >
              {t("portfolio.backToPortfolio") || "Back to portfolio"}
            </Link>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
