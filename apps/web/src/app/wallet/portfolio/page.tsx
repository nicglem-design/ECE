"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWalletBalances, useWalletChains, useWalletTransactions } from "@/hooks/useWallet";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import { PortfolioChart } from "@/components/PortfolioChart";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencies";
import {
  getPricesBatch,
  fetchMarketChartViaAPI,
  pricePointsToArray,
  getFallbackPriceForCoin,
  generateFallbackSparkline,
  CHAIN_TO_COINGECKO,
} from "@/lib/coingecko";
import { PriceSparklineChart } from "@/components/PriceSparklineChart";

const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 36;

function AssetSparkline({
  chainId,
  price: knownPrice,
}: {
  chainId: string;
  price?: number;
}) {
  const { currency } = useCurrency();
  const [prices, setPrices] = useState<number[]>([]);

  useEffect(() => {
    const cgId = CHAIN_TO_COINGECKO[chainId];
    if (!cgId) return;
    fetchMarketChartViaAPI(cgId, currency || "usd", 1).then((points) => {
      const arr = pricePointsToArray(points);
      if (arr.length >= 2) {
        setPrices(arr);
      } else {
        const fallbackPrice =
          knownPrice != null && knownPrice > 0
            ? knownPrice
            : getFallbackPriceForCoin(cgId, currency || "usd");
        setPrices(generateFallbackSparkline(fallbackPrice, 24));
      }
    });
  }, [chainId, currency, knownPrice]);

  const change24h =
    prices.length >= 2 && prices[0] > 0
      ? ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100
      : null;

  return (
    <PriceSparklineChart
      prices={prices}
      change24h={change24h}
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
    />
  );
}

export default function PortfolioPage() {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const { assets, loading } = useWalletBalances();
  const { chains } = useWalletChains();
  const [selectedChain, setSelectedChain] = useState("");
  const { transactions, explorerTx, loading: txLoading } = useWalletTransactions(selectedChain || null);
  const [totalValue, setTotalValue] = useState(0);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [assetValues, setAssetValues] = useState<Record<string, number>>({});
  const [assetPrices, setAssetPrices] = useState<Record<string, number>>({});

  const onTotalChange = useCallback((total: number, change: number | null) => {
    setTotalValue(total);
    setChangePct(change);
  }, []);

  useEffect(() => {
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
    if (assets.length > 0 && !selectedChain) setSelectedChain(assets[0].chainId);
    else if (chains.length > 0 && !selectedChain) setSelectedChain(chains[0].id);
  }, [assets, chains, selectedChain]);

  const chainSymbol = assets.find((a) => a.chainId === selectedChain)?.symbol ?? selectedChain;
  const sym = getCurrencySymbol(currency || "usd");

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-950">
        <WalletNav />
        <div className="mx-auto max-w-4xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("portfolio.title")}</h1>
          <p className="mt-2 text-slate-400">{t("portfolio.subtitle")}</p>
          {loading ? (
            <p className="mt-8 text-slate-500">{t("portfolio.loadingAssets")}</p>
          ) : assets.length === 0 ? (
            <p className="mt-8 text-slate-500">{t("portfolio.noAssets")}</p>
          ) : (
            <>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
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
                <PortfolioChart assets={assets} onTotalChange={onTotalChange} />
              </div>
              <div className="mt-8 space-y-4">
                {assets.map((a) => (
                  <div
                    key={a.chainId}
                    className="flex items-center justify-between gap-6 rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  >
                    <div className="min-w-0 shrink-0">
                      <span className="font-medium text-slate-200">{a.symbol}</span>
                      <span className="ml-2 text-sm text-slate-500">{a.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-right">
                      <span className="font-mono text-slate-200">
                        {sym} {(assetValues[a.chainId] ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="shrink-0">
                      <AssetSparkline chainId={a.chainId} price={assetPrices[a.chainId]} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="mt-12">
            <h2 className="text-lg font-semibold text-slate-200">{t("portfolio.transactionHistory")}</h2>
            {chains.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm text-slate-400">{t("receive.chooseAsset")}</label>
                <select
                  value={selectedChain}
                  onChange={(e) => setSelectedChain(e.target.value)}
                  className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200"
                >
                  {chains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.symbol})
                    </option>
                  ))}
                </select>
                {txLoading ? (
                  <p className="mt-4 text-slate-500">{t("common.loading")}</p>
                ) : transactions.length === 0 ? (
                  <p className="mt-4 text-slate-500">{t("portfolio.noTransactions")}</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {transactions.slice(0, 10).map((tx, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                      >
                        <div>
                          <span
                            className={`text-sm font-medium ${
                              tx.type === "received" ? "text-green-400" : "text-amber-400"
                            }`}
                          >
                            {tx.type === "received" ? t("portfolio.received") : t("portfolio.sent")}
                          </span>
                          <span className="ml-2 font-mono text-slate-400">
                            {tx.amount} {chainSymbol}
                          </span>
                        </div>
                        <a
                          href={explorerTx + tx.txHash}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-sky-400 hover:underline"
                        >
                          {t("portfolio.viewOnExplorer")}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <Link href="/wallet" className="mt-6 inline-block text-sky-400 hover:underline">
            {t("portfolio.backToWallet")}
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}
