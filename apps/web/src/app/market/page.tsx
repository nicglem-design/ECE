"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TerminologyToggle } from "@/components/TerminologyToggle";
import { getCurrencySymbol } from "@/lib/currencies";
import { CoinLogo } from "@/components/CoinLogo";

const PER_PAGE = 250;
const LOAD_ALL_DELAY_MS = 2000; // Delay between pages to avoid CoinGecko rate limits

interface MarketCoin {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  market_cap_rank: number | null;
  current_price: number | null;
  price_change_percentage_24h_in_currency?: number | null;
  price_change_percentage_24h?: number | null;
}

function formatPrice(price: number, currencyId: string): string {
  const sym = getCurrencySymbol(currencyId);
  const rounded = Math.round(price * 100) / 100;
  if (rounded >= 1) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (rounded >= 0.01) return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  return `${sym} ${rounded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export default function MarketPage() {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [coins, setCoins] = useState<MarketCoin[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadAllProgress, setLoadAllProgress] = useState<string | null>(null);
  const [orderbookActive, setOrderbookActive] = useState(false);
  const fiat = (currency || "usd").toLowerCase();

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await fetch(
          `/api/coingecko/coins-markets?currency=${encodeURIComponent(fiat)}&page=${pageNum}&per_page=${PER_PAGE}&sparkline=false&order=market_cap_desc`
        );
        if (!res.ok) {
          setHasMore(false);
          return;
        }
        const data = (await res.json()) as MarketCoin[] | { error?: string };
        let list = Array.isArray(data) ? data : [];
        // Only use orderbook when site has active users - otherwise use coins-markets prices
        // When fallback coins (null prices), fetch from market/prices which uses CoinGecko
        if (list.length > 0) {
          try {
            const needsPrices = list.some((c) => c.current_price == null);
            const checkRes = await fetch(`/api/market/prices?currency=${encodeURIComponent(fiat)}&ids=bitcoin`);
            const checkData = (await checkRes.json()) as { source?: string };
            const isOrderbookActive = checkData.source === "orderbook";
            setOrderbookActive(isOrderbookActive);
            if (isOrderbookActive || needsPrices) {
              const BATCH = 50;
              const prices: Record<string, number> = {};
              const priceChange24h: Record<string, number> = {};
              for (let i = 0; i < list.length; i += BATCH) {
                const batch = list.slice(i, i + BATCH);
                const ids = batch.map((c) => c.id).join(",");
                const pRes = await fetch(`/api/market/prices?currency=${encodeURIComponent(fiat)}&ids=${ids}`);
                if (pRes.ok) {
                  const pData = (await pRes.json()) as { prices?: Record<string, number>; priceChange24h?: Record<string, number> };
                  Object.assign(prices, pData.prices ?? {});
                  Object.assign(priceChange24h, pData.priceChange24h ?? {});
                }
              }
              list = list.map((c) => ({
                ...c,
                current_price: prices[c.id] ?? c.current_price,
                price_change_percentage_24h_in_currency: priceChange24h[c.id] ?? c.price_change_percentage_24h_in_currency,
                price_change_percentage_24h: priceChange24h[c.id] ?? c.price_change_percentage_24h,
              }));
            }
          } catch {
            setOrderbookActive(false);
          }
        }
        setCoins((prev) => (append ? [...prev, ...list] : list));
        setHasMore(list.length > 0);
      } catch {
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [fiat]
  );

  useEffect(() => {
    setPage(1);
    fetchPage(1, false);
  }, [fiat]);

  useEffect(() => {
    if (page > 1) fetchPage(page, true);
  }, [page]);

  const loadMore = () => setPage((p) => p + 1);

  const loadAll = useCallback(async () => {
    if (loadingAll || loadingMore || loading) return;
    setLoadingAll(true);
    let nextPage = Math.floor(coins.length / PER_PAGE) + 1;
    if (nextPage === 1) nextPage = 2; // We already have page 1
    let isOrderbookActive: boolean | null = null; // Check once, reuse for all pages
    try {
      while (true) {
        setLoadAllProgress(`${(nextPage - 1) * PER_PAGE}+ coins loaded...`);
        const res = await fetch(
          `/api/coingecko/coins-markets?currency=${encodeURIComponent(fiat)}&page=${nextPage}&per_page=${PER_PAGE}&sparkline=false&order=market_cap_desc`
        );
        if (!res.ok) break;
        const data = (await res.json()) as MarketCoin[] | { error?: string };
        let list = Array.isArray(data) ? data : [];
        if (list.length > 0) {
          try {
            const needsPrices = list.some((c) => c.current_price == null);
            if (isOrderbookActive === null) {
              const checkRes = await fetch(`/api/market/prices?currency=${encodeURIComponent(fiat)}&ids=bitcoin`);
              const checkData = (await checkRes.json()) as { source?: string };
              isOrderbookActive = checkData.source === "orderbook";
              setOrderbookActive(isOrderbookActive);
            }
            if (isOrderbookActive || needsPrices) {
              const BATCH = 50;
              const prices: Record<string, number> = {};
              const priceChange24h: Record<string, number> = {};
              for (let i = 0; i < list.length; i += BATCH) {
                const batch = list.slice(i, i + BATCH);
                const ids = batch.map((c) => c.id).join(",");
                const pRes = await fetch(`/api/market/prices?currency=${encodeURIComponent(fiat)}&ids=${ids}`);
                if (pRes.ok) {
                  const pData = (await pRes.json()) as { prices?: Record<string, number>; priceChange24h?: Record<string, number> };
                  Object.assign(prices, pData.prices ?? {});
                  Object.assign(priceChange24h, pData.priceChange24h ?? {});
                }
              }
              list = list.map((c) => ({
                ...c,
                current_price: prices[c.id] ?? c.current_price,
                price_change_percentage_24h_in_currency: priceChange24h[c.id] ?? c.price_change_percentage_24h_in_currency,
                price_change_percentage_24h: priceChange24h[c.id] ?? c.price_change_percentage_24h,
              }));
            }
          } catch {
            setOrderbookActive(false);
          }
        }
        setCoins((prev) => [...prev, ...list]);
        if (list.length < PER_PAGE) {
          setHasMore(false);
          break;
        }
        nextPage++;
        await new Promise((r) => setTimeout(r, LOAD_ALL_DELAY_MS));
      }
    } finally {
      setLoadingAll(false);
      setLoadAllProgress(null);
    }
  }, [fiat, coins.length, loadingAll, loadingMore, loading]);

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
              <Link href="/exchange" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.exchange")}
              </Link>
              <Link href="/market" className="text-sm text-amber-400">
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-200">{t("market.title")}</h1>
            {orderbookActive && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400"
                title="Live prices from order book (active users)"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" aria-hidden />
                Live
              </span>
            )}
          </div>
          <p className="mt-2 text-slate-400">
            {t("market.subtitle")}
            {coins.length > 0 && (
              <span className="ml-2 text-slate-500">
                · {coins.length.toLocaleString()}
                {hasMore ? "+" : ""} {t("market.coinsLoaded")}
              </span>
            )}
          </p>

          {loading && coins.length === 0 ? (
            <div className="mt-8 space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-slate-400/30 bg-slate-800/40 px-4 py-3 animate-pulse"
                >
                  <div className="h-5 w-12 rounded bg-slate-700" />
                  <div className="h-5 w-24 rounded bg-slate-700" />
                  <div className="h-5 w-20 rounded bg-slate-700" />
                </div>
              ))}
            </div>
          ) : coins.length === 0 ? (
            <div className="mt-8 rounded-lg border border-slate-400/30 bg-slate-800/40 px-6 py-12 text-center">
              <p className="text-slate-500">{t("exchange.noResults")}</p>
              <button
                onClick={() => fetchPage(1, false)}
                className="mt-4 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                {t("common.tryAgain")}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 overflow-hidden rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  <span>{t("market.rank")}</span>
                  <span>Coin</span>
                  <span className="text-right">{t("market.price")}</span>
                  <span className="text-right">{t("market.change24h")}</span>
                </div>
                {coins.map((c) => {
                  const change24h =
                    c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0;
                  const changeColor =
                    change24h > 0 ? "text-green-400" : change24h < 0 ? "text-red-400" : "text-slate-500";
                  const price = c.current_price ?? 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/crypto/${c.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 border-t border-slate-600/50 px-4 py-3 transition hover:bg-slate-700/50"
                    >
                      <span className="text-sm text-slate-500">
                        {c.market_cap_rank != null ? `#${c.market_cap_rank}` : "—"}
                      </span>
                      <div className="flex min-w-0 items-center gap-3">
                        <CoinLogo image={c.image} coinId={c.id} symbol={c.symbol} size={32} />
                        <div className="min-w-0">
                          <span className="font-medium text-slate-200">{c.symbol.toUpperCase()}</span>
                          <span className="ml-2 truncate text-sm text-slate-500">{c.name}</span>
                        </div>
                      </div>
                      <span className="text-right font-mono text-sm text-slate-300 tabular-nums">
                        {formatPrice(price, currency || "usd")}
                      </span>
                      <span className={`text-right text-sm font-medium tabular-nums ${changeColor}`}>
                        {change24h > 0 ? "+" : ""}
                        {change24h.toFixed(2)}%
                      </span>
                    </Link>
                  );
                })}
              </div>
              {hasMore && (
                <div className="mt-6 flex flex-col items-center gap-3">
                  <div className="flex flex-wrap justify-center gap-3">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore || loadingAll}
                      className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      {loadingMore ? t("common.loading") : t("exchange.loadMore")}
                    </button>
                    <button
                      onClick={loadAll}
                      disabled={loadingMore || loadingAll}
                      className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-6 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      {loadingAll ? t("common.loading") : t("market.loadAll")}
                    </button>
                  </div>
                  {loadAllProgress && (
                    <p className="text-sm text-slate-500">{loadAllProgress}</p>
                  )}
                </div>
              )}
            </>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/exchange" className="text-sky-400 hover:underline">
              {t("nav.backTo")}
            </Link>
            <span className="text-slate-600">·</span>
            <a
              href="https://www.coingecko.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 text-sm hover:text-slate-400"
            >
              {t("market.coinLogosBy")} CoinGecko
            </a>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
