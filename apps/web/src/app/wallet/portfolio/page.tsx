"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useWalletBalances } from "@/hooks/useWallet";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import { PortfolioChart } from "@/components/PortfolioChart";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencies";
import {
  getPricesBatch,
  fetchMarketChartForDetail,
  pricePointsToArray,
  getFallbackPriceForCoin,
  generateFallbackSparkline,
  CHAIN_TO_COINGECKO,
} from "@/lib/coingecko";
import { PriceSparklineChart } from "@/components/PriceSparklineChart";
import { TokenLogo } from "@/components/TokenLogo";
import { SPARKLINE_WIDTH, SPARKLINE_HEIGHT, SPARKLINE_DAYS } from "@/lib/chart-config";

function AssetSparkline({
  prices,
  price: knownPrice,
  chainId,
  chartMode = "complex",
}: {
  prices: number[];
  price?: number;
  chainId: string;
  chartMode?: "simple" | "complex";
}) {
  const displayPrices =
    prices.length >= 2
      ? prices
      : knownPrice != null && knownPrice > 0
        ? generateFallbackSparkline(knownPrice, 48)
        : prices;
  const change24h =
    displayPrices.length >= 2 && displayPrices[0] > 0
      ? ((displayPrices[displayPrices.length - 1] - displayPrices[0]) / displayPrices[0]) * 100
      : null;

  return (
    <PriceSparklineChart
      prices={displayPrices}
      change24h={change24h}
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      chartMode={chartMode}
    />
  );
}

export default function PortfolioPage() {
  const { t } = useLanguage();
  const { isPro } = useTerminology();
  const { currency } = useCurrency();
  const { assets, loading } = useWalletBalances();
  const [totalValue, setTotalValue] = useState(0);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [assetValues, setAssetValues] = useState<Record<string, number>>({});
  const [assetPrices, setAssetPrices] = useState<Record<string, number>>({});
  const [assetSparklines, setAssetSparklines] = useState<Record<string, number[]>>({});

  const onTotalChange = useCallback((total: number, change: number | null) => {
    setTotalValue(total);
    setChangePct(change);
  }, []);

  const fetchAssetPrices = useCallback(() => {
    if (assets.length === 0) {
      setAssetValues({});
      setAssetPrices({});
      return;
    }
    getPricesBatch(assets.map((a) => a.chainId), currency || "usd").then((prices) => {
      const vals: Record<string, number> = {};
      const prs: Record<string, number> = {};
      assets.forEach((a) => {
        const price = prices[a.chainId] ?? 0;
        vals[a.chainId] = parseFloat(a.amount) * price;
        prs[a.chainId] = price;
      });
      setAssetValues(vals);
      setAssetPrices(prs);
    });
  }, [assets, currency]);

  useEffect(() => {
    fetchAssetPrices();
    const id = setInterval(fetchAssetPrices, 5000); // Live prices every 5s
    return () => clearInterval(id);
  }, [fetchAssetPrices]);

  // Fetch sparklines for all assets once (deduplicated - was N fetches, now 1 batch)
  useEffect(() => {
    if (assets.length === 0) {
      setAssetSparklines({});
      return;
    }
    const fiat = (currency || "usd").toLowerCase();
    const fetchAll = assets.map(async (a) => {
      const cgId = CHAIN_TO_COINGECKO[a.chainId] ?? a.chainId;
      try {
        const { prices: points } = await fetchMarketChartForDetail(cgId, fiat, SPARKLINE_DAYS);
        const arr = pricePointsToArray(points);
        if (arr.length >= 2) return { chainId: a.chainId, prices: arr };
        const fallbackPrice = getFallbackPriceForCoin(cgId, fiat);
        return { chainId: a.chainId, prices: generateFallbackSparkline(fallbackPrice, 48) };
      } catch {
        const fallbackPrice = getFallbackPriceForCoin(cgId, fiat);
        return { chainId: a.chainId, prices: generateFallbackSparkline(fallbackPrice, 48) };
      }
    });
    Promise.all(fetchAll).then((results) => {
      const next: Record<string, number[]> = {};
      results.forEach((r) => {
        next[r.chainId] = r.prices;
      });
      setAssetSparklines(next);
    });
  }, [assets, currency]);

  const sym = getCurrencySymbol(currency || "usd");

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-950">
        <WalletNav />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("portfolio.title")}</h1>
          <p className="mt-2 text-slate-400">{isPro ? t("portfolio.subtitle") : t("portfolio.subtitleCoins")}</p>
          {loading ? (
            <p className="mt-8 text-slate-500">{isPro ? t("portfolio.loadingAssets") : t("portfolio.loadingCoins")}</p>
          ) : assets.length === 0 ? (
            <p className="mt-8 text-slate-500">{isPro ? t("portfolio.noAssets") : t("portfolio.noCoins")}</p>
          ) : (
            <>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
                <span className="text-lg font-semibold text-slate-200">{t("portfolio.totalValue")}</span>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-lg font-semibold text-slate-200">
                    {sym} {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {changePct != null && (
                    <span
                      className={`text-lg font-semibold ${
                        changePct > 0 ? "text-green-400" : changePct < 0 ? "text-red-400" : "text-slate-500"
                      }`}
                    >
                      {changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-8">
                <PortfolioChart
                  assets={assets}
                  onTotalChange={onTotalChange}
                  useCoinsTerminology={!isPro}
                  chartMode="complex"
                />
              </div>
              <div className="mt-8 space-y-4">
                {assets.map((a) => (
                  <Link
                    key={a.chainId}
                    href={`/wallet/portfolio/asset/${encodeURIComponent(a.chainId)}`}
                    className="flex items-center gap-4 rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4 transition hover:border-slate-400/30 hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 flex-1 basis-0 items-center gap-3">
                      <TokenLogo chainId={a.chainId} symbol={a.symbol} size={32} />
                      <div className="min-w-0">
                        <span className="font-medium text-slate-200">{a.symbol}</span>
                        <span className="ml-2 truncate text-sm text-slate-500">{a.name}</span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 justify-center" style={{ width: SPARKLINE_WIDTH }}>
                      <AssetSparkline
                        chainId={a.chainId}
                        price={assetPrices[a.chainId]}
                        prices={assetSparklines[a.chainId] ?? []}
                        chartMode="complex"
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 basis-0 items-center justify-end gap-2">
                      <span className="font-mono text-slate-200">
                        {sym} {(assetValues[a.chainId] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <svg className="h-5 w-5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
          <Link href="/wallet" className="mt-6 inline-block text-sky-400 hover:underline">
            {t("portfolio.backToWallet")}
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}
