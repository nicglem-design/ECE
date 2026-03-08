"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiPost } from "@/lib/apiClient";
import { TokenLogo } from "@/components/TokenLogo";

interface SearchCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank?: number;
  thumb?: string;
}

const POPULAR_COINS: SearchCoin[] = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "tether", symbol: "USDT", name: "Tether" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "usd-coin", symbol: "USDC", name: "USD Coin" },
  { id: "dogecoin", symbol: "DOGE", name: "Dogecoin" },
  { id: "cardano", symbol: "ADA", name: "Cardano" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "avalanche-2", symbol: "AVAX", name: "Avalanche" },
];

/** Fiat currencies for buying crypto with account balance */
const FIAT_COINS: SearchCoin[] = [
  { id: "usd", symbol: "USD", name: "US Dollar" },
  { id: "eur", symbol: "EUR", name: "Euro" },
  { id: "gbp", symbol: "GBP", name: "British Pound" },
  { id: "sek", symbol: "SEK", name: "Swedish Krona" },
];

function CoinSelector({
  coin,
  setCoin,
  open,
  setOpen,
  search,
  setSearch,
  results,
  allCoins,
  containerRef,
  otherCoin,
}: {
  coin: SearchCoin | null;
  setCoin: (c: SearchCoin) => void;
  open: boolean;
  setOpen: (v: boolean) => void;
  search: string;
  setSearch: (v: string) => void;
  results: SearchCoin[];
  allCoins: SearchCoin[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  otherCoin: SearchCoin | null;
}) {
  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-left transition hover:border-amber-500/50"
      >
        {coin ? (
          <>
            <TokenLogo chainId={coin.id} symbol={coin.symbol} size={32} />
            <div className="min-w-0 flex-1">
              <span className="font-semibold text-slate-200">{coin.symbol}</span>
            </div>
            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </>
        ) : (
          <span className="text-slate-500">Select asset</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-600 bg-slate-800 shadow-xl">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-b border-slate-600 bg-slate-800/80 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          <div className="max-h-48 overflow-y-auto">
            {(search.length >= 1
              ? (allCoins.length > 0
                  ? allCoins.filter(
                      (c) =>
                        c.symbol.toLowerCase().includes(search.toLowerCase()) ||
                        c.name.toLowerCase().includes(search.toLowerCase()) ||
                        c.id.toLowerCase().includes(search.toLowerCase())
                    )
                  : results)
              : allCoins.length > 0
                ? allCoins
                : POPULAR_COINS)
              .filter((c) => c.id !== otherCoin?.id)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCoin(c);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-700/80"
                >
                  <TokenLogo chainId={c.id} symbol={c.symbol} size={24} />
                  <span className="font-medium text-slate-200">{c.symbol}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface SwapWidgetProps {
  initialBuyCoinId?: string;
}

export function SwapWidget({ initialBuyCoinId }: SwapWidgetProps = {}) {
  const { currency } = useCurrency();
  const { isAuthenticated } = useAuth();
  const [fromCoin, setFromCoin] = useState<SearchCoin | null>({ id: "tether", symbol: "USDT", name: "Tether" });
  const [toCoin, setToCoin] = useState<SearchCoin | null>(
    initialBuyCoinId ? null : { id: "bitcoin", symbol: "BTC", name: "Bitcoin" }
  );

  useEffect(() => {
    if (!initialBuyCoinId) return;
    if (POPULAR_COINS.some((c) => c.id === initialBuyCoinId)) {
      setToCoin(POPULAR_COINS.find((c) => c.id === initialBuyCoinId)!);
      return;
    }
    fetch(`/api/coingecko/search?query=${encodeURIComponent(initialBuyCoinId)}`)
      .then((r) => r.json())
      .then((data: { coins?: SearchCoin[] }) => {
        const match = data.coins?.find((c) => c.id === initialBuyCoinId);
        if (match) setToCoin(match);
        else setToCoin({ id: initialBuyCoinId, symbol: initialBuyCoinId.slice(0, 4).toUpperCase(), name: initialBuyCoinId });
      })
      .catch(() => setToCoin({ id: initialBuyCoinId, symbol: initialBuyCoinId.slice(0, 4).toUpperCase(), name: initialBuyCoinId }));
  }, [initialBuyCoinId]);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [fiatAmount, setFiatAmount] = useState("");
  const [quote, setQuote] = useState<{
    toAmount: number;
    rate: number;
    feeUsd: number;
    valueUsd: number;
    fromPrice?: number;
    toPrice?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [fromSearch, setFromSearch] = useState("");
  const [toSearch, setToSearch] = useState("");
  const [fromResults, setFromResults] = useState<SearchCoin[]>([]);
  const [toResults, setToResults] = useState<SearchCoin[]>([]);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  const [allCoins, setAllCoins] = useState<SearchCoin[]>([]);

  const STABLECOINS = ["tether", "usd-coin", "dai", "first-digital-usd", "true-usd", "paxos-standard", "gemini-dollar", "frax", "liquity-usd"];

  const fetchSearch = useCallback(async (q: string): Promise<SearchCoin[]> => {
    if (q.length < 1) return [];
    const res = await fetch(`/api/coingecko/search?query=${encodeURIComponent(q)}`);
    const data = (await res.json()) as { coins?: SearchCoin[] };
    return data.coins ?? [];
  }, []);

  const fetchAllCoins = useCallback(async () => {
    if (allCoins.length > 0) return;
    try {
      const pages = await Promise.all([
        fetch(`/api/coingecko/coins-markets?per_page=250&page=1&currency=${currency}`),
        fetch(`/api/coingecko/coins-markets?per_page=250&page=2&currency=${currency}`),
        fetch(`/api/coingecko/coins-markets?per_page=250&page=3&currency=${currency}`),
        fetch(`/api/coingecko/coins-markets?per_page=250&page=4&currency=${currency}`),
      ]);
      const data = await Promise.all(pages.map((r) => r.json()));
      const mapped = data.flatMap((d) =>
        (Array.isArray(d) ? d : []).map((c: { id: string; symbol?: string; name?: string; image?: string; market_cap_rank?: number }) => ({
          id: c.id,
          symbol: c.symbol?.toUpperCase() ?? c.id,
          name: c.name ?? c.id,
          market_cap_rank: c.market_cap_rank,
          thumb: c.image,
        }))
      );
      setAllCoins([...FIAT_COINS, ...mapped]);
    } catch {
      setAllCoins(POPULAR_COINS);
    }
  }, [allCoins.length, currency]);

  useEffect(() => {
    if (fromOpen || toOpen) fetchAllCoins();
  }, [fromOpen, toOpen, fetchAllCoins]);

  useEffect(() => {
    if (fromSearch.length < 1) {
      setFromResults([]);
      return;
    }
    const id = setTimeout(async () => {
      const q = fromSearch.toLowerCase();
      const fiatMatch = FIAT_COINS.filter(
        (f) => f.id.includes(q) || f.symbol.toLowerCase().includes(q) || f.name.toLowerCase().includes(q)
      );
      const r = await fetchSearch(fromSearch);
      setFromResults([...fiatMatch, ...r]);
    }, 150);
    return () => clearTimeout(id);
  }, [fromSearch, fetchSearch]);

  useEffect(() => {
    if (toSearch.length < 1) {
      setToResults([]);
      return;
    }
    const id = setTimeout(async () => {
      const r = await fetchSearch(toSearch);
      setToResults(r);
    }, 150);
    return () => clearTimeout(id);
  }, [toSearch, fetchSearch]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (fromRef.current && !fromRef.current.contains(e.target as Node)) setFromOpen(false);
      if (toRef.current && !toRef.current.contains(e.target as Node)) setToOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchQuote = useCallback(async () => {
    if (!fromCoin || !toCoin || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/market/swap?from=${fromCoin.id}&to=${toCoin.id}&amount=${fromAmount}&currency=${currency}`
      );
      const data = await res.json();
      if (res.ok) {
        setQuote({
          toAmount: data.toAmount,
          rate: data.rate,
          feeUsd: data.feeUsd,
          valueUsd: data.valueUsd,
          fromPrice: data.fromPrice,
          toPrice: data.toPrice,
        });
        setToAmount(data.toAmount.toFixed(8).replace(/\.?0+$/, ""));
        return;
      }
      // Fallback: compute estimate from individual coin prices when swap API fails
      const [fromRes, toRes] = await Promise.all([
        fetch(`/api/coingecko/coin-price?coinId=${encodeURIComponent(fromCoin.id)}&currency=${currency}`, { cache: "no-store" }),
        fetch(`/api/coingecko/coin-price?coinId=${encodeURIComponent(toCoin.id)}&currency=${currency}`, { cache: "no-store" }),
      ]);
      const fromData = await fromRes.json();
      const toData = await toRes.json();
      const fp = fromData?.price ?? (STABLECOINS.includes(fromCoin.id) ? 1 : null);
      const tp = toData?.price ?? (STABLECOINS.includes(toCoin.id) ? 1 : null);
      if (typeof fp === "number" && fp > 0 && typeof tp === "number" && tp > 0) {
        const valueUsd = parseFloat(fromAmount) * fp;
        const feeUsd = valueUsd * 0.005;
        const netUsd = valueUsd - feeUsd;
        const toAmount = netUsd / tp;
        const rate = fp / tp;
        setQuote({
          toAmount,
          rate,
          feeUsd,
          valueUsd,
          fromPrice: fp,
          toPrice: tp,
        });
        setToAmount(toAmount.toFixed(8).replace(/\.?0+$/, ""));
        setError(null);
      } else {
        setError(data.error || "Could not fetch prices");
        setQuote(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get quote");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, [fromCoin, toCoin, fromAmount, currency]);

  useEffect(() => {
    const num = parseFloat(fromAmount);
    if (num > 0 && fromCoin && toCoin) {
      fetchQuote();
    } else {
      setQuote(null);
      setToAmount("");
    }
  }, [fromAmount, fromCoin, toCoin, fetchQuote]);

  const [fromCoinPrice, setFromCoinPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [fiatConverting, setFiatConverting] = useState(false);

  const effectivePrice = quote?.fromPrice ?? fromCoinPrice;

  const fetchFromTokenPrice = useCallback(async (): Promise<number | null> => {
    if (!fromCoin) return null;
    if (STABLECOINS.includes(fromCoin.id)) return 1;
    try {
      // 1. Try coin-price API first (single coin, most reliable for conversion)
      const coinRes = await fetch(
        `/api/coingecko/coin-price?coinId=${encodeURIComponent(fromCoin.id)}&currency=${currency}`,
        { cache: "no-store" }
      );
      const coinData = await coinRes.json();
      if (!coinData?.error) {
        const p = coinData?.price;
        if (typeof p === "number" && p > 0) {
          if (!STABLECOINS.includes(fromCoin.id) && p >= 0.99 && p <= 1.01) return null;
          return p;
        }
      }
      // 2. Fallback: swap API
      const toId = toCoin?.id ?? "bitcoin";
      if (toId !== fromCoin.id) {
        const swapRes = await fetch(
          `/api/market/swap?from=${fromCoin.id}&to=${toId}&amount=1&currency=${currency}`,
          { cache: "no-store" }
        );
        if (swapRes.ok) {
          const swapData = await swapRes.json();
          const p = swapData.fromPrice;
          if (typeof p === "number" && p > 0) {
            if (!STABLECOINS.includes(fromCoin.id) && p >= 0.99 && p <= 1.01) return null;
            return p;
          }
        }
      }
      // 3. Fallback: prices API (CoinGecko)
      const res = await fetch(
        `/api/market/prices?currency=${currency}&ids=${fromCoin.id}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      let price = data.prices?.[fromCoin.id];
      if (typeof price === "number" && price > 0) {
        if (!STABLECOINS.includes(fromCoin.id) && price >= 0.99 && price <= 1.01) return null;
        return price;
      }
      // 4. Fallback: Binance (for BTC, ETH, BNB, SOL when CoinGecko fails)
      const binanceRes = await fetch(
        `/api/binance/prices?currency=${currency}`,
        { cache: "no-store" }
      );
      if (binanceRes.ok) {
        const binanceData = await binanceRes.json();
        price = binanceData.prices?.[fromCoin.id];
        if (typeof price === "number" && price > 0) {
          if (!STABLECOINS.includes(fromCoin.id) && price >= 0.99 && price <= 1.01) return null;
          return price;
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  }, [fromCoin, toCoin, currency]);

  useEffect(() => {
    if (!fromCoin) {
      setFromCoinPrice(null);
      setPriceError(null);
      setPriceLoading(false);
      return;
    }
    if (STABLECOINS.includes(fromCoin.id)) {
      setFromCoinPrice(1);
      setPriceError(null);
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceLoading(true);
    setPriceError(null);
    fetchFromTokenPrice()
      .then((price) => {
        if (!cancelled) {
          setFromCoinPrice(price);
          setPriceError(price ? null : "Could not load price");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFromCoinPrice(null);
          setPriceError("Price fetch failed");
        }
      })
      .finally(() => {
        if (!cancelled) setPriceLoading(false);
      });
    return () => { cancelled = true; };
  }, [fromCoin, fetchFromTokenPrice]);

  // Sync fiat amount when token amount or quote changes (token → fiat direction)
  useEffect(() => {
    if (quote?.fromPrice && fromAmount && parseFloat(fromAmount) > 0) {
      setFiatAmount((parseFloat(fromAmount) * quote.fromPrice).toFixed(2));
    }
  }, [quote, fromAmount]);

  const handleFiatAmountChange = useCallback(
    (value: string) => {
      setFiatAmount(value);
      const cleaned = value.replace(",", ".").replace(/[^0-9.]/g, "");
      const num = parseFloat(cleaned);
      if (!fromCoin || num <= 0 || isNaN(num)) {
        setFromAmount("");
        return;
      }
      const price = effectivePrice;
      if (price && price > 0) {
        const tokenAmount = num / price;
        const formatted = tokenAmount >= 0.00000001
          ? tokenAmount.toFixed(8).replace(/\.?0+$/, "") || "0"
          : "0";
        setFromAmount(formatted);
      } else {
        setFiatConverting(true);
        setPriceError(null);
        fetchFromTokenPrice().then((p) => {
          setFromCoinPrice(p);
          if (p && p > 0) {
            const tokenAmount = num / p;
            const formatted = tokenAmount >= 0.00000001
              ? tokenAmount.toFixed(8).replace(/\.?0+$/, "") || "0"
              : "0";
            setFromAmount(formatted);
          } else {
            setFromAmount("");
            setPriceError("Could not load price");
          }
          setFiatConverting(false);
        });
      }
    },
    [fromCoin, effectivePrice, fetchFromTokenPrice]
  );

  const handleTokenAmountChange = useCallback(
    (value: string) => {
      setFromAmount(value);
      const num = parseFloat(value.replace(",", ".").replace(/[^0-9.]/g, ""));
      if (!fromCoin || num <= 0 || isNaN(num)) {
        setFiatAmount("");
        return;
      }
      const price = effectivePrice;
      if (price && price > 0) {
        setFiatAmount((num * price).toFixed(2));
      } else {
        fetchFromTokenPrice().then((p) => {
          if (p && p > 0) {
            setFromCoinPrice(p);
            setFiatAmount((num * p).toFixed(2));
            setPriceError(null);
          } else {
            setFiatAmount("");
            setPriceError("Could not load price");
          }
        });
      }
    },
    [fromCoin, effectivePrice, fetchFromTokenPrice]
  );

  const swapCoins = () => {
    setFromCoin(toCoin);
    setToCoin(fromCoin);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
    setFiatAmount("");
    setQuote(null);
    setFromCoinPrice(null);
    setPriceError(null);
  };

  const executeSwap = async () => {
    if (!fromCoin || !toCoin || !fromAmount || !quote) return;
    setSwapping(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await apiPost<{
        ok?: boolean;
        error?: string;
        toAmount?: number;
        realExecution?: boolean;
      }>("/api/market/swap", {
        fromCoinId: fromCoin.id,
        toCoinId: toCoin.id,
        fromAmount: parseFloat(fromAmount),
        userId: isAuthenticated ? "user" : "guest",
      });
      if (data.error || !data.ok) throw new Error(data.error || "Swap failed");
      const received = data.toAmount ?? quote.toAmount;
      const msg = data.realExecution
        ? `Swapped ${fromAmount} ${fromCoin.symbol} → ${received.toFixed(6)} ${toCoin.symbol} (executed)`
        : `Swapped ${fromAmount} ${fromCoin.symbol} → ${received.toFixed(6)} ${toCoin.symbol}`;
      setSuccess(msg);
      setFromAmount("");
      setToAmount("");
      setFiatAmount("");
      setQuote(null);
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setSwapping(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-600 bg-slate-800/40 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-400">You spend</label>
        <p className="mb-2 text-xs text-slate-500">Type amount in {fromCoin?.symbol ?? "token"} or {currency.toUpperCase()} — both convert automatically</p>
        <div className="flex gap-2">
          <div className="w-40 shrink-0">
            <CoinSelector
              coin={fromCoin}
              setCoin={setFromCoin}
              open={fromOpen}
              setOpen={setFromOpen}
              search={fromSearch}
              setSearch={setFromSearch}
              results={fromResults}
              allCoins={allCoins}
              containerRef={fromRef}
              otherCoin={toCoin}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={fromAmount}
              onChange={(e) => handleTokenAmountChange(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-right text-lg text-slate-200 placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
              title={`Amount in ${fromCoin?.symbol ?? "token"}`}
              aria-label={`Amount of ${fromCoin?.symbol ?? "token"}`}
            />
            {(fiatConverting || priceLoading) && (
              <span className="text-xs text-slate-500">
                {fiatConverting ? "Converting..." : "Loading price..."}
              </span>
            )}
            {priceError && !fiatConverting && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-500/80">{priceError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPriceError(null);
                    setPriceLoading(true);
                    fetchFromTokenPrice().then((p) => {
                      setFromCoinPrice(p);
                      setPriceError(p ? null : "Could not load price");
                      setPriceLoading(false);
                    });
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 underline"
                >
                  Retry
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">≈ {currency.toUpperCase()}</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={fiatAmount}
                onChange={(e) => handleFiatAmountChange(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-2 text-right text-sm text-slate-200 placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                title={`Amount in ${currency.toUpperCase()}`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={swapCoins}
          className="rounded-full border border-slate-600 bg-slate-800 p-2 text-amber-400 transition hover:border-amber-500/50 hover:bg-slate-700"
          aria-label="Swap"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </button>
      </div>

      <div className="rounded-xl border border-slate-600 bg-slate-800/40 p-4">
        <label className="mb-2 block text-sm font-medium text-slate-400">You receive</label>
        <div className="flex gap-2">
          <div className="w-40 shrink-0">
            <CoinSelector
              coin={toCoin}
              setCoin={setToCoin}
              open={toOpen}
              setOpen={setToOpen}
              search={toSearch}
              setSearch={setToSearch}
              results={toResults}
              allCoins={allCoins}
              containerRef={toRef}
              otherCoin={fromCoin}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <input
              type="text"
              readOnly
              placeholder="0"
              value={toAmount}
              className="rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-right text-lg text-slate-200 placeholder-slate-500"
            />
            {quote?.toPrice != null && parseFloat(toAmount) > 0 && (
              <div className="rounded-lg border-0 bg-slate-700/40 px-3 py-1.5 text-right text-sm text-slate-400">
                ≈ {formatCurrency(parseFloat(toAmount) * quote.toPrice)}
              </div>
            )}
          </div>
        </div>
      </div>

      {quote && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 text-sm text-slate-400">
          <div className="flex justify-between">
            <span>Rate</span>
            <span>1 {fromCoin?.symbol} ≈ {quote.rate.toFixed(6)} {toCoin?.symbol}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span>Fee (0.5%)</span>
            <span>{formatCurrency(quote.feeUsd)}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-sky-800/50 bg-sky-900/20 px-4 py-2 text-sm text-sky-300">
          {success}
        </div>
      )}

      <button
        type="button"
        onClick={executeSwap}
        disabled={!quote || swapping || !fromAmount || parseFloat(fromAmount) <= 0}
        className="w-full rounded-xl bg-amber-500 py-3 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {swapping ? "Swapping..." : "Swap"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Swap uses live market prices. Set SWAP_REAL_MONEY=true for order book execution.
      </p>
    </div>
  );
}
