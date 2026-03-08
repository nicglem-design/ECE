"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { KanoXLogo } from "@/components/KanoXLogo";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CryptoListWidget } from "@/components/CryptoListWidget";
import { PopularCryptoWidget } from "@/components/PopularCryptoWidget";
import { TerminologyToggle } from "@/components/TerminologyToggle";

export default function ExchangePage() {
  const { t } = useLanguage();
  const [riskDisclaimerDismissed, setRiskDisclaimerDismissed] = useState(false);

  useEffect(() => {
    setRiskDisclaimerDismissed(localStorage.getItem("kanox_risk_disclaimer_dismissed") === "1");
  }, []);

  const dismissRiskDisclaimer = () => {
    localStorage.setItem("kanox_risk_disclaimer_dismissed", "1");
    setRiskDisclaimerDismissed(true);
  };
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-950">
        <header className="border-b border-slate-800/50">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <KanoXLogo label={t("nav.kanox")} variant="amber" size="md" />
            <div className="flex gap-6">
              <Link href="/wallet" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.wallet")}
              </Link>
              <Link href="/market" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.market")}
              </Link>
              <Link href="/profile" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.profile")}
              </Link>
              <TerminologyToggle />
              {isAuthenticated && (
                <button
                  onClick={() => { logout(); router.refresh(); }}
                  className="text-sm text-slate-400 hover:text-sky-400"
                >
                  {t("nav.logout")}
                </button>
              )}
            </div>
          </nav>
        </header>
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
          <h1 className="text-2xl font-bold text-slate-200">{t("home.exchange.title")}</h1>
          <p className="mt-2 text-slate-400">{t("home.exchange.desc")}</p>
          <Link
            href="/market"
            className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-slate-400/30 bg-slate-800/40 px-6 py-4 backdrop-blur-xl transition hover:border-amber-500/40 hover:bg-slate-700/50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </span>
              <div>
                <span className="font-semibold text-slate-200">{t("nav.market")}</span>
                <p className="text-sm text-slate-500">{t("exchange.cryptoList")}</p>
              </div>
            </div>
            <span className="text-amber-400">→</span>
          </Link>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="space-y-6">
              <CryptoListWidget />
              <PopularCryptoWidget />
            </div>
            <div className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
              <h2 className="text-lg font-semibold text-slate-200">Swap (coming soon)</h2>
              <p className="mt-3 text-slate-400">
                KanoExchange swap is under development. You can send and receive crypto in KanoWallet today.
              </p>
              <Link
                href="/wallet"
                className="mt-6 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                Open KanoWallet →
              </Link>
            </div>
          </div>
          <Link href="/" className="mt-6 inline-block text-sky-400 hover:underline">
            {t("nav.backTo")}
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}
