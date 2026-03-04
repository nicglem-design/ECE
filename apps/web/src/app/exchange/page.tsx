"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TopCryptoWidget } from "@/components/TopCryptoWidget";
import { TerminologyToggle } from "@/components/TerminologyToggle";

export default function ExchangePage() {
  const { t } = useLanguage();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-950">
        <header className="border-b border-slate-800/50">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-xl font-bold text-amber-400 hover:text-amber-300">
              {t("nav.kanox")}
            </Link>
            <div className="flex gap-6">
              <Link href="/wallet" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.wallet")}
              </Link>
              <Link href="/exchange" className="text-sm text-amber-400">
                {t("nav.exchange")}
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
          <h1 className="text-2xl font-bold text-slate-200">{t("home.exchange.title")}</h1>
          <p className="mt-2 text-slate-400">{t("home.exchange.desc")}</p>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div>
              <TopCryptoWidget />
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
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
