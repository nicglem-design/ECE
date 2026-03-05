"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { TerminologyToggle } from "@/components/TerminologyToggle";
import { TopCryptoWidget } from "@/components/TopCryptoWidget";
import { HeaderCurrencySelector } from "@/components/HeaderCurrencySelector";

export default function HomePage() {
  const { t } = useLanguage();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  return (
    <main className="min-h-screen">
      <header className="relative overflow-hidden border-b border-slate-800/50">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-900/20 via-transparent to-amber-900/10" />
        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-xl font-bold tracking-tight text-sky-400">
            {t("nav.kanox")}
          </span>
          <div className="flex gap-6">
            <Link href="/wallet" className="text-sm text-slate-400 transition hover:text-sky-400">
              {t("nav.wallet")}
            </Link>
            <Link href="/exchange" className="text-sm text-slate-400 transition hover:text-sky-400">
              {t("nav.exchange")}
            </Link>
            <Link href="/profile" className="text-sm text-slate-400 transition hover:text-sky-400">
              {t("nav.profile")}
            </Link>
            <TerminologyToggle />
            {isAuthenticated ? (
              <button
                onClick={() => { logout(); router.refresh(); }}
                className="text-sm text-slate-400 transition hover:text-sky-400"
              >
                {t("nav.logout")}
              </button>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-400 transition hover:text-sky-400">
                  {t("nav.login")}
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
                >
                  {t("nav.getStarted")}
                </Link>
              </>
            )}
          </div>
        </nav>
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            {t("home.hero.title")}
            <br />
            <span className="bg-gradient-to-r from-sky-400 to-amber-400 bg-clip-text text-transparent">
              {t("home.hero.titleHighlight")}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            {t("home.hero.subtitle")}
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            {!isAuthenticated && (
              <>
                <Link
                  href="/register"
                  className="rounded-xl bg-sky-500 px-6 py-3 font-medium text-white transition hover:bg-sky-600"
                >
                  {t("home.createAccount")}
                </Link>
                <Link
                  href="/login"
                  className="rounded-xl border border-slate-600 px-6 py-3 font-medium text-slate-300 transition hover:border-sky-500/50 hover:text-sky-400"
                >
                  {t("auth.login")}
                </Link>
              </>
            )}
            {isAuthenticated && (
              <Link
                href="/dashboard"
                className="rounded-xl bg-sky-500 px-6 py-3 font-medium text-white transition hover:bg-sky-600"
              >
                {t("nav.dashboard")}
              </Link>
            )}
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-200">
                {t("home.livePrices") || "Live crypto prices"}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {t("home.livePricesDesc") || "Real-time prices from Binance, CoinGecko, CoinPaprika & CryptoCompare"}
              </p>
            </div>
            <HeaderCurrencySelector />
          </div>
          <TopCryptoWidget />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 md:grid-cols-2">
          <div id="wallet" className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
            <h2 className="text-2xl font-bold text-sky-400">{t("home.wallet.title")}</h2>
            <p className="mt-3 text-slate-400">{t("home.wallet.desc")}</p>
            <Link
              href="/wallet"
              className="mt-4 inline-block text-sm font-medium text-sky-400 transition hover:text-sky-300"
            >
              {t("home.wallet.open")}
            </Link>
          </div>
          <div id="exchange" className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
            <h2 className="text-2xl font-bold text-amber-400">{t("home.exchange.title")}</h2>
            <p className="mt-3 text-slate-400">{t("home.exchange.desc")}</p>
            <Link
              href="/exchange"
              className="mt-4 inline-block text-sm font-medium text-amber-400 transition hover:text-amber-300"
            >
              Open KanoExchange →
            </Link>
          </div>
        </div>
      </section>
      <footer className="border-t border-slate-800/50 py-12">
        <div className="mx-auto max-w-6xl px-6 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} KanoXchange.com. {t("home.footer")}
          {" · "}
          <Link href="/terms" className="text-sky-400 hover:underline">{t("legal.terms")}</Link>
          {" · "}
          <Link href="/privacy" className="text-sky-400 hover:underline">{t("legal.privacy")}</Link>
        </div>
      </footer>
    </main>
  );
}
