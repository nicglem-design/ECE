"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWalletBalances } from "@/hooks/useWallet";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import { TopCryptoWidget } from "@/components/TopCryptoWidget";
import { PopularCryptoWidget } from "@/components/PopularCryptoWidget";
import { DashboardReceiveWidget } from "@/components/DashboardReceiveWidget";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencies";
import { getPricesBatch } from "@/lib/coingecko";

export default function DashboardPage() {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { currency } = useCurrency();
  const { assets, loading } = useWalletBalances();
  const [totalValue, setTotalValue] = useState<number | null>(null);

  const fetchTotal = useCallback(() => {
    if (assets.length === 0) {
      setTotalValue(0);
      return;
    }
    getPricesBatch(assets.map((a) => a.chainId), currency || "usd").then((prices) => {
      const total = assets.reduce((sum, a) => {
        const price = prices[a.chainId] ?? 0;
        return sum + parseFloat(a.amount) * price;
      }, 0);
      setTotalValue(total);
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
      <main className="min-h-screen bg-slate-950">
        <WalletNav />
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("dashboard.welcome")}</h1>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("kano-open"))}
            type="button"
            className="mt-8 flex w-full items-center justify-between rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4 text-left transition hover:border-sky-500/30 hover:bg-slate-800/30"
          >
            <div>
              <h3 className="font-medium text-sky-400">{t("dashboard.needHelp")}</h3>
              <p className="mt-1 text-sm text-slate-400">{t("dashboard.needHelpDesc")}</p>
            </div>
          </button>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Link
              href="/wallet"
              className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-6 transition hover:border-sky-500/50"
            >
              <span className="text-slate-400">{t("dashboard.balance")}</span>
              <span className="mt-2 font-mono text-xl font-semibold text-slate-200">
                {totalValue != null ? `${sym} ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </span>
              <span className="mt-2 text-sm text-sky-400">Open KanoWallet →</span>
            </Link>
            <Link
              href="/exchange"
              className="flex flex-col rounded-xl border border-amber-500/30 bg-amber-500/15 backdrop-blur-xl p-6 transition hover:border-amber-500/40 hover:bg-amber-500/20"
            >
              <span className="text-amber-400">{t("dashboard.swap")}</span>
              <p className="mt-2 text-slate-400">Trade on KanoExchange</p>
            </Link>
          </div>
          <div className="mt-8">
            <DashboardReceiveWidget />
          </div>
          <div className="mt-8 space-y-8">
            <TopCryptoWidget />
            <PopularCryptoWidget />
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
