"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { TokenLogo } from "@/components/TokenLogo";

interface SearchCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
  thumb?: string;
}

const DEBOUNCE_MS = 150;

export function CryptoListWidget() {
  const { t } = useLanguage();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchCoin[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/coingecko/search?query=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { coins?: SearchCoin[] };
      setResults(data.coins ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const id = setTimeout(() => fetchResults(q), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, fetchResults]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectCoin = (coin: SearchCoin) => {
    setSearch("");
    setResults([]);
    setOpen(false);
    router.push(`/crypto/${coin.id}`);
  };

  return (
    <div ref={containerRef} className={`relative rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl overflow-visible ${open ? "z-[100]" : ""}`}>
      <div className="p-4">
        <div className="relative">
          <input
            type="text"
            placeholder={t("exchange.searchCrypto") || "Search by name or symbol..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
            autoComplete="off"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          )}
        </div>
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[200] mt-1 max-h-72 overflow-y-auto rounded-b-xl border border-t-0 border-slate-600 bg-slate-800 shadow-xl">
          {results.map((coin) => (
            <button
              key={coin.id}
              type="button"
              onClick={() => selectCoin(coin)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-700/80"
            >
              {coin.thumb ? (
                <img
                  src={coin.thumb}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <TokenLogo chainId={coin.id} symbol={coin.symbol} size={32} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">{coin.symbol}</span>
                  <span className="truncate text-sm text-slate-500">{coin.name}</span>
                </div>
                {coin.market_cap_rank != null && (
                  <span className="text-xs text-slate-500">#{coin.market_cap_rank}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && search.length >= 2 && !loading && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-[200] mt-1 rounded-b-xl border border-t-0 border-slate-600 bg-slate-800 px-4 py-6 text-center text-sm text-slate-500">
          {t("exchange.noResults") || "No cryptocurrencies found"}
        </div>
      )}
    </div>
  );
}
