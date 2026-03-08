"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTerminology } from "@/contexts/TerminologyContext";
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
  const { isPro } = useTerminology();
  const { isAuthenticated } = useAuth();
  const { currency } = useCurrency();
  const { assets, loading, error, refetch } = useWalletBalances();
  const { setOpen: setAskKanoOpen } = useAskKano();
  const [totalValue, setTotalValue] = useState<number | null>(null);
  const [allTimePct, setAllTimePct] = useState<number | null>(null);
  const [riskDisclaimerDismissed, setRiskDisclaimerDismissed] = useState(false);

  useEffect(() => {
    setRiskDisclaimerDismissed(localStorage.getItem("kanox_risk_disclaimer_dismissed") === "1");
  }, []);

  const dismissRiskDisclaimer = () => {
    localStorage.setItem("kanox_risk_disclaimer_dismissed", "1");
    setRiskDisclaimerDismissed(true);
  };

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
    const id = setInterval(fetchTotal, 5000); // Live prices every 5s
    return () => clearInterval(id);
  }, [fetchTotal]);

  const sym = getCurrencySymbol(currency || "usd");

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-theme">
        <WalletNav />
        <div className="mx-auto max-w-6xl px-6 py-8">
          {!riskDisclaimerDismissed && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-800/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-200/90">
              <p className="flex-1">{t("legal.riskDisclaimer")}</p>
              <button
                onClick={dismissRiskDisclaimer}
                aria-label="Dismiss"
                className="shrink-0 rounded p-1 text-amber-400/80 transition hover:bg-amber-800/30 hover:text-amber-200"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          <h1 className="text-2xl font-bold text-slate-200">{t("wallet.title")}</h1>
          <p className="mt-2 text-slate-400">{isPro ? t("wallet.subtitlePro") : t("wallet.subtitleSimple")}</p>
          {error ? (
            <div className="mt-6 rounded-xl border border-red-800/50 bg-red-900/20 p-4">
              <p className="text-red-400">{error}</p>
              <p className="mt-2 text-sm text-slate-400">
                {t("wallet.apiErrorHint") || "Make sure you're logged in and the API is running."}
              </p>
              <button
                onClick={() => refetch()}
                className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
              >
                {t("common.tryAgain") || "Try again"}
              </button>
            </div>
          ) : loading ? (
            <p className="mt-6 text-slate-500">{t("common.loading")}</p>
          ) : (
            <>
              {!isPro && (
                <button
                  onClick={() => setAskKanoOpen(true)}
                  className="mt-8 flex w-full items-center justify-between rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4 text-left transition hover:border-sky-500/30 hover:bg-slate-800/30"
                >
                  <div>
                    <h3 className="font-medium text-sky-400">{t("wallet.askKano")}</h3>
                    <p className="mt-1 text-sm text-slate-400">{t("wallet.askKanoDesc")}</p>
                  </div>
                </button>
              )}
              <Link
                href="/wallet/portfolio"
                className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6 transition hover:border-sky-500/30 hover:bg-slate-800/30"
              >
                <div className="shrink-0">
                  <span className="block text-slate-400">{t("wallet.totalBalance")}</span>
                  {!isPro && (
                    <span className="mt-1 block text-xs text-slate-500">{t("wallet.totalBalanceHint")}</span>
                  )}
                </div>
                <span className="flex-1 text-center font-mono text-xl font-semibold text-slate-200">
                  {totalValue != null ? `${sym} ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </span>
                <div className="flex shrink-0 flex-col items-end text-right">
                  {allTimePct != null && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">{t("wallet.allTime")}</span>
                        <span
                          className={`font-mono font-semibold ${
                            allTimePct > 0 ? "text-green-400" : allTimePct < 0 ? "text-red-400" : "text-slate-500"
                          }`}
                        >
                          {allTimePct > 0 ? "+" : ""}{allTimePct.toFixed(2)}%
                        </span>
                      </div>
                      {!isPro && (
                        <span className="mt-1 block text-xs text-slate-500">{t("wallet.allTimeHint")}</span>
                      )}
                    </>
                  )}
                </div>
              </Link>
              <div className="mt-6 grid grid-cols-2 gap-6">
                <Link
                  href="/wallet/send"
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8 text-center transition hover:border-sky-500/30 hover:bg-slate-800/30"
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
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8 text-center transition hover:border-sky-500/30 hover:bg-slate-800/30"
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
                  href="/accounts"
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8 text-center transition hover:border-green-500/30 hover:bg-slate-800/30"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                    <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                  </span>
                  <h3 className="text-2xl font-medium text-green-400">Accounts</h3>
                  <p className="mt-2 text-lg text-slate-400">Deposit & withdraw to bank or card</p>
                </Link>
                <Link
                  href="/wallet/deposit"
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8 text-center transition hover:border-sky-500/30 hover:bg-slate-800/30"
                >
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
                    <svg className="h-6 w-6 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </span>
                  <h3 className="text-2xl font-medium text-sky-400">Add crypto</h3>
                  <p className="mt-2 text-lg text-slate-400">Simulated crypto deposit</p>
                </Link>
                <Link
                  href="/exchange"
                  className="flex min-h-[140px] flex-col items-center justify-center rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8 text-center transition hover:border-amber-500/30 hover:bg-slate-800/30"
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
