"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWalletBalances } from "@/hooks/useWallet";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import { TopCryptoWidget } from "@/components/TopCryptoWidget";
import { useAskKano } from "@/contexts/AskKanoContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencies";
import { getPricesBatch } from "@/lib/coingecko";

export default function WalletPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { currency } = useCurrency();
  const { assets, loading, error } = useWalletBalances();
  const { setOpen: setAskKanoOpen } = useAskKano();
  const [totalValue, setTotalValue] = useState<number | null>(null);
  const [allTimePct, setAllTimePct] = useState<number | null>(null);

  const fetchTotal = useCallback(() => {
    if (assets.length === 0) {
      setTotalValue(0);
      setAllTimePct(null);
      return;
    }
    getPricesBatch(assets.map((a) => a.chainId), currency || "usd").then((prices) => {
      const total = assets.reduce((sum, a) => {
        const price = prices[a.chainId] ?? 0;
        return sum + parseFloat(a.amount) * price;
      }, 0);
      setTotalValue(total);

      const stored = localStorage.getItem("kanox_initial_portfolio_value");
      if (stored != null) {
        const initial = parseFloat(stored);
        if (initial > 0 && total > 0) {
          const pct = ((total - initial) / initial) * 100;
          setAllTimePct(pct);
        } else {
          setAllTimePct(null);
        }
      } else if (total > 0) {
        localStorage.setItem("kanox_initial_portfolio_value", String(total));
        setAllTimePct(0);
      }
    });
  }, [assets, currency]);

  useEffect(() => {
    fetchTotal();
    const id = setInterval(fetchTotal, 2000); // Live prices every 2s
    return () => clearInterval(id);
  }, [fetchTotal]);

  const sym = getCurrencySymbol(currency || "usd");

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-950">
        <WalletNav />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("wallet.title")}</h1>
          <p className="mt-2 text-slate-400">{t("wallet.subtitle")}</p>
          {error ? (
            <div className="mt-6 rounded-xl border border-red-800/50 bg-red-900/20 p-4">
              <p className="text-red-400">{error}</p>
              <p className="mt-2 text-sm text-slate-400">
                {t("wallet.apiErrorHint") || "Make sure you're logged in and the API is running."}
              </p>
            </div>
          ) : loading ? (
            <p className="mt-6 text-slate-500">{t("common.loading")}</p>
          ) : (
            <>
              <button
                onClick={() => setAskKanoOpen(true)}
                className="mt-8 flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-sky-500/50"
              >
                <div>
                  <h3 className="font-medium text-sky-400">{t("wallet.askKano")}</h3>
                  <p className="mt-1 text-sm text-slate-400">{t("wallet.askKanoDesc")}</p>
                </div>
              </button>
              <Link
                href="/wallet/portfolio"
                className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-sky-500/50"
              >
                <span className="shrink-0 text-slate-400">{t("wallet.totalBalance")}</span>
                <span className="flex-1 text-center font-mono text-xl font-semibold text-slate-200">
                  {totalValue != null ? `${sym} ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </span>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  {allTimePct != null && (
                    <>
                      <span className="text-slate-500">{t("wallet.allTime")}</span>
                      <span
                        className={`font-mono font-semibold ${
                          allTimePct > 0 ? "text-green-400" : allTimePct < 0 ? "text-red-400" : "text-slate-500"
                        }`}
                      >
                        {allTimePct > 0 ? "+" : ""}{allTimePct.toFixed(2)}%
                      </span>
                    </>
                  )}
                </div>
              </Link>
              <div className="mt-6 grid grid-cols-2 gap-6">
                <Link
                  href="/wallet/send"
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center transition hover:border-sky-500/50"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
                    <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7h-6M17 7v6" />
                    </svg>
                  </span>
                  <h3 className="text-2xl font-medium text-sky-400">{t("wallet.send")}</h3>
                  <p className="mt-2 text-lg text-slate-400">{t("wallet.sendDesc")}</p>
                </Link>
                <Link
                  href="/wallet/receive"
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center transition hover:border-sky-500/50"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
                    <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 7L7 17M7 17h6M7 17v-6" />
                    </svg>
                  </span>
                  <h3 className="text-2xl font-medium text-sky-400">{t("wallet.receive")}</h3>
                  <p className="mt-2 text-lg text-slate-400">{t("wallet.receiveDesc")}</p>
                </Link>
                <Link
                  href="/exchange"
                  className="col-span-2 flex min-h-[100px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center transition hover:border-amber-500/50"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20">
                    <svg className="h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </span>
                  <h3 className="text-2xl font-medium text-amber-400">{t("wallet.swap")}</h3>
                  <p className="mt-2 text-lg text-slate-400">{t("wallet.swapDesc")}</p>
                </Link>
              </div>
              <div className="mt-8">
                <TopCryptoWidget />
              </div>
            </>
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
