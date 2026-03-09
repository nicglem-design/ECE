"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { TokenLogo } from "@/components/TokenLogo";
import { ChartAnalysisFullScreen } from "@/components/ChartAnalysisFullScreen";
import { getCurrencySymbol } from "@/lib/currencies";
import { TOP_5_COINS } from "@/lib/coingecko";
import { PriceSparklineChart } from "@/components/PriceSparklineChart";

interface SearchCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
  thumb?: string;
}

const DEFAULT_COINS = TOP_5_COINS.map((c) => ({
  id: c.id,
  symbol: c.symbol.toUpperCase(),
  name: c.name,
}));

export function ChartAnalysisWidget() {
  const { t } = useLanguage();
  const { isPro } = useTerminology();
  const { currency } = useCurrency();
  const [selectedCoin, setSelectedCoin] = useState<{ id: string; symbol: string; name: string }>(DEFAULT_COINS[0]);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchCoin[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [sparkline, setSparkline] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetch(`/api/coingecko/search?query=${encodeURIComponent(search)}`)
        .then((r) => r.json())
        .then((data: { coins?: SearchCoin[] }) => {
          setSearchResults(data.coins ?? []);
          setSearchOpen(true);
        })
        .catch(() => setSearchResults([]));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchPriceAndSparkline = useCallback(async () => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const fiat = (currency || "usd").toLowerCase();
    try {
      const res = await fetch(
        `${base}/api/coingecko/market-chart?coinId=${encodeURIComponent(selectedCoin.id)}&currency=${fiat}&days=7`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { prices?: [number, number][] };
      const prices = data.prices ?? [];
      if (prices.length > 0) {
        const last = prices[prices.length - 1][1];
        setPrice(last);
        setSparkline(prices.map(([, p]) => p));
      }
    } catch {
      /* ignore */
    }
  }, [selectedCoin.id, currency]);

  useEffect(() => {
    fetchPriceAndSparkline();
  }, [fetchPriceAndSparkline]);

  const selectCoin = (coin: SearchCoin) => {
    setSelectedCoin({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
    });
    setSearch("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  if (!isPro) return null;

  const sym = getCurrencySymbol(currency || "usd");

  return (
    <div ref={containerRef} className="rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold text-slate-200">Chart analysis</h2>
      <p className="mt-1 text-sm text-slate-500">
        Analyze price charts with drawing tools. Click to open full screen.
      </p>

      <div className="mt-4">
        <label className="block text-sm font-medium text-slate-400">Token</label>
        <div className="relative mt-2">
          <input
            type="text"
            placeholder="Search token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => search.trim().length >= 2 && setSearchOpen(true)}
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
              {searchResults.slice(0, 15).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCoin(c)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-700"
                >
                  <TokenLogo chainId={c.id} size={24} />
                  <div>
                    <span className="font-medium text-slate-200">{c.symbol.toUpperCase()}</span>
                    <span className="ml-2 text-slate-500">{c.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {DEFAULT_COINS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCoin(c)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                selectedCoin.id === c.id
                  ? "bg-amber-500/30 text-amber-400"
                  : "bg-slate-700/50 text-slate-400 hover:bg-slate-700"
              }`}
            >
              <TokenLogo chainId={c.id} size={20} />
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFullScreenOpen(true)}
        className="mt-6 flex w-full items-center justify-between rounded-xl border border-slate-600 bg-slate-900/50 p-4 transition hover:border-amber-500/50 hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-4">
          <TokenLogo chainId={selectedCoin.id} size={40} />
          <div className="text-left">
            <p className="font-semibold text-slate-200">
              {selectedCoin.symbol} – {selectedCoin.name}
            </p>
            <p className="text-sm text-slate-400">
              {price != null ? `${sym} ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-[120px] h-[48px]">
            <PriceSparklineChart
              prices={sparkline}
              width={120}
              height={48}
            />
          </div>
          <span className="text-amber-400">Open full screen →</span>
        </div>
      </button>

      {fullScreenOpen && (
        <ChartAnalysisFullScreen
          coinId={selectedCoin.id}
          symbol={selectedCoin.symbol}
          name={selectedCoin.name}
          onClose={() => setFullScreenOpen(false)}
        />
      )}
    </div>
  );
}
