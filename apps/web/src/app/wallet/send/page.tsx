"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { KanoXLogo } from "@/components/KanoXLogo";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWalletChains, useWalletBalances } from "@/hooks/useWallet";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CurrencyCombobox } from "@/components/CurrencyCombobox";
import { FiatCurrencyCombobox } from "@/components/FiatCurrencyCombobox";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getPrice } from "@/lib/coingecko";
import { apiPost, apiGet } from "@/lib/apiClient";

function SendPageContent() {
  const { t } = useLanguage();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currency } = useCurrency();
  useEffect(() => { setFiatCurrency(currency || "usd"); }, [currency]);
  const { chains, loading: chainsLoading } = useWalletChains();
  const { assets, loading: balancesLoading } = useWalletBalances();
  const [chainId, setChainId] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amountCrypto, setAmountCrypto] = useState("");
  const [amountFiat, setAmountFiat] = useState("");
  const [amountMode, setAmountMode] = useState<"crypto" | "fiat">("crypto");
  const [fiatCurrency, setFiatCurrency] = useState(currency || "usd");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ txHash?: string } | null>(null);

  const TOKEN_OPTIONS = [
    { id: "tether", name: "Tether", symbol: "USDT" },
    { id: "usd-coin", name: "USD Coin", symbol: "USDC" },
  ];
  const chainOptions = [
    ...chains.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol })),
    ...TOKEN_OPTIONS,
  ];
  const evmChainsForTokens = chains.filter(
    (c) => ["ethereum", "binancecoin", "matic-network", "avalanche-2"].includes(c.id)
  );
  const isERC20Token = chainId === "tether" || chainId === "usd-coin";

  const [evmChainId, setEvmChainId] = useState("ethereum");
  const [gasEstimate, setGasEstimate] = useState<{
    feeEth: string;
    feeSymbol: string;
    gasPriceGwei: string;
  } | null>(null);

  const isEVM = ["ethereum", "binancecoin", "matic-network", "avalanche-2"].includes(chainId);
  const showGasEstimate =
    (isEVM || isERC20Token) &&
    toAddress.trim().length >= 10 &&
    amountCrypto &&
    parseFloat(amountCrypto) > 0;

  useEffect(() => {
    if (!showGasEstimate) {
      setGasEstimate(null);
      return;
    }
    const params = new URLSearchParams({
      chainId,
      toAddress: toAddress.trim(),
      amount: amountCrypto,
    });
    if (isERC20Token) {
      params.set("tokenId", chainId);
      params.set("evmChainId", evmChainId);
    }
    apiGet<{ feeEth?: string; feeSymbol?: string; gasPriceGwei?: string; supported?: boolean }>(
      `/api/v1/wallet/estimate-gas?${params}`
    )
      .then((data) => {
        if (data.supported && data.feeEth && data.feeSymbol) {
          setGasEstimate({
            feeEth: data.feeEth,
            feeSymbol: data.feeSymbol,
            gasPriceGwei: data.gasPriceGwei || "",
          });
        } else {
          setGasEstimate(null);
        }
      })
      .catch(() => setGasEstimate(null));
  }, [showGasEstimate, chainId, evmChainId, toAddress, amountCrypto, isERC20Token]);

  useEffect(() => {
    const urlChain = searchParams.get("chain") ?? "";
    if (urlChain && chainOptions.some((c) => c.id === urlChain)) {
      setChainId(urlChain);
    } else if (chains.length > 0 && !chainId) {
      setChainId(chains[0].id);
    }
  }, [chains, chainId, searchParams]);

  useEffect(() => {
    if (amountMode === "fiat" && amountFiat && parseFloat(amountFiat) > 0 && chainId) {
      getPrice(chainId, fiatCurrency).then((price) => {
        if (price > 0) {
          const crypto = parseFloat(amountFiat) / price;
          setAmountCrypto(crypto.toFixed(8));
        }
      });
    }
  }, [amountFiat, fiatCurrency, amountMode, chainId]);

  const loading = chainsLoading || balancesLoading;
  const selectedAsset = assets.find((a) => a.chainId === chainId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(null);
    const amt = amountCrypto.trim();
    if (!chainId || !toAddress.trim() || !amt) {
      setError(t("send.enterValidAmount"));
      return;
    }
    const num = parseFloat(amt);
    if (isNaN(num) || num <= 0) {
      setError(t("send.enterValidAmount"));
      return;
    }
    setSending(true);
    try {
      const body: Record<string, string> = {
        chainId,
        toAddress: toAddress.trim(),
        amount: amt,
      };
      if (isERC20Token) {
        body.tokenId = chainId;
        body.evmChainId = evmChainId;
      }
      const res = await apiPost<{ success: boolean; txHash?: string }>("/api/v1/wallet/send", body);
      setSuccess(res);
      setAmountCrypto("");
      setAmountFiat("");
      setToAddress("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("send.failed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-theme">
        <header className="border-b border-slate-800/50">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <KanoXLogo label={t("nav.kanox")} variant="sky" size="md" />
            <div className="flex gap-6">
              <Link href="/wallet" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.wallet")}
              </Link>
              <Link href="/profile" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.profile")}
              </Link>
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
        <div className="mx-auto max-w-2xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("send.title")}</h1>
          <p className="mt-2 text-slate-400">{t("send.subtitle")}</p>
          {loading ? (
            <p className="mt-8 text-slate-500">{t("common.loading")}</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("send.walletCurrency")}</label>
                <CurrencyCombobox
                  options={chainOptions}
                  value={chainId}
                  onChange={setChainId}
                  placeholder={t("send.searchCurrency")}
                  className="mt-2"
                />
                {selectedAsset && (
                  <p className="mt-1 text-sm text-slate-500">
                    {t("portfolio.currentValue")}: {selectedAsset.amount} {selectedAsset.symbol}
                  </p>
                )}
                {isERC20Token && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-slate-400">
                      {t("send.network") || "Network"}
                    </label>
                    <select
                      value={evmChainId}
                      onChange={(e) => setEvmChainId(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      {evmChainsForTokens.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("send.amount")}</label>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAmountMode("crypto")}
                    className={`rounded-lg px-3 py-2 text-sm ${amountMode === "crypto" ? "bg-sky-500/20 text-sky-400" : "text-slate-500"}`}
                  >
                    {selectedAsset?.symbol ?? "Crypto"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountMode("fiat")}
                    className={`rounded-lg px-3 py-2 text-sm ${amountMode === "fiat" ? "bg-sky-500/20 text-sky-400" : "text-slate-500"}`}
                  >
                    {t("send.fiat")}
                  </button>
                </div>
                {amountMode === "fiat" ? (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={amountFiat}
                      onChange={(e) => setAmountFiat(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                    <div className="w-48">
                      <FiatCurrencyCombobox
                        value={fiatCurrency}
                        onChange={setFiatCurrency}
                        placeholder={t("send.searchFiat")}
                      />
                    </div>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={amountCrypto}
                    onChange={(e) => setAmountCrypto(e.target.value)}
                    placeholder="0.00"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                  />
                )}
                {amountMode === "fiat" && amountCrypto && parseFloat(amountCrypto) > 0 && (
                  <p className="mt-1 text-sm text-slate-500">
                    ≈ {amountCrypto} {selectedAsset?.symbol ?? ""}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("send.recipientAddress")}</label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder={t("send.placeholder")}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
                {gasEstimate && (
                  <p className="mt-2 text-sm text-amber-400/90">
                    {t("send.estimatedFee") || "Estimated fee"}: ~{parseFloat(gasEstimate.feeEth).toFixed(6)}{" "}
                    {gasEstimate.feeSymbol}
                    {gasEstimate.gasPriceGwei && ` (${gasEstimate.gasPriceGwei} gwei)`}
                  </p>
                )}
              </div>
              {error && <p className="text-red-400">{error}</p>}
              {success && (
                <p className="text-green-400">{t("send.transactionSent")}</p>
              )}
              <button
                type="submit"
                disabled={sending}
                className="rounded-lg bg-sky-500 px-6 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {sending ? t("send.sending") : t("send.send")}
              </button>
            </form>
          )}
          <Link href="/wallet" className="mt-6 inline-block text-sky-400 hover:underline">
            {t("portfolio.backToWallet")}
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-theme">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    }>
      <SendPageContent />
    </Suspense>
  );
}
