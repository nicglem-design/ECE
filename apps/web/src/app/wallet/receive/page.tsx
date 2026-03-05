"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWalletChains, useWalletAddresses } from "@/hooks/useWallet";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { CurrencyCombobox } from "@/components/CurrencyCombobox";
import { FiatCurrencyCombobox } from "@/components/FiatCurrencyCombobox";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getPrice } from "@/lib/coingecko";
import QRCode from "qrcode";

const BIP21_CHAINS = ["bitcoin", "litecoin", "dogecoin"];

function buildBip21Uri(protocol: string, address: string, amountCrypto?: string): string {
  if (!amountCrypto || parseFloat(amountCrypto) <= 0) return address;
  const amt = parseFloat(amountCrypto);
  if (isNaN(amt)) return address;
  const uri = `${protocol}:${address}?amount=${amt}`;
  return uri;
}

function ReceivePageContent() {
  const { t } = useLanguage();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currency } = useCurrency();
  useEffect(() => { setFiatCurrency(currency || "usd"); }, [currency]);
  const { chains, loading: chainsLoading } = useWalletChains();
  const { addresses, loading: addressesLoading } = useWalletAddresses();
  const [selectedChain, setSelectedChain] = useState("");
  const [amountCrypto, setAmountCrypto] = useState("");
  const [amountFiat, setAmountFiat] = useState("");
  const [fiatCurrency, setFiatCurrency] = useState(currency || "usd");
  const [amountMode, setAmountMode] = useState<"crypto" | "fiat">("crypto");
  const [qrData, setQrData] = useState("");
  const [copied, setCopied] = useState(false);

  const chainOptions = chains.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol }));
  const currentAddress = addresses.find((a) => a.chainId === selectedChain)?.address ?? "";
  const currentChain = chains.find((c) => c.id === selectedChain);
  const supportsBip21 = selectedChain && BIP21_CHAINS.includes(selectedChain);

  useEffect(() => {
    const urlChain = searchParams.get("chain") ?? "";
    if (urlChain && chains.some((c) => c.id === urlChain)) {
      setSelectedChain(urlChain);
    } else if (chains.length > 0 && !selectedChain) {
      setSelectedChain(chains[0].id);
    }
  }, [chains, selectedChain, searchParams]);

  useEffect(() => {
    if (amountMode === "fiat" && amountFiat && parseFloat(amountFiat) > 0) {
      getPrice(selectedChain, fiatCurrency).then((price) => {
        if (price > 0) {
          const crypto = parseFloat(amountFiat) / price;
          setAmountCrypto(crypto.toFixed(8));
        }
      });
    }
  }, [amountFiat, fiatCurrency, amountMode, selectedChain]);

  const displayAmount = amountMode === "crypto" ? amountCrypto : amountFiat;
  const setDisplayAmount = amountMode === "crypto" ? setAmountCrypto : setAmountFiat;

  const uriOrAddress = supportsBip21 && currentAddress && parseFloat(amountCrypto) > 0
    ? buildBip21Uri(selectedChain, currentAddress, amountCrypto)
    : currentAddress;

  useEffect(() => {
    if (uriOrAddress) {
      QRCode.toDataURL(uriOrAddress, { width: 200 })
        .then(setQrData)
        .catch(() => setQrData(""));
    } else {
      setQrData("");
    }
  }, [uriOrAddress]);

  function copyAddress() {
    const toCopy = uriOrAddress || currentAddress;
    if (toCopy) {
      navigator.clipboard.writeText(toCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const loading = chainsLoading || addressesLoading;

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-950">
        <header className="border-b border-slate-800/50">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-xl font-bold text-sky-400 hover:text-sky-300">
              {t("nav.kanox")}
            </Link>
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
          <h1 className="text-2xl font-bold text-slate-200">{t("receive.title")}</h1>
          <p className="mt-2 text-slate-400">{t("receive.subtitle")}</p>
          {loading ? (
            <p className="mt-8 text-slate-500">{t("receive.generatingAddress")}</p>
          ) : (
            <div className="mt-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("receive.walletCurrency")}</label>
                <CurrencyCombobox
                  options={chainOptions}
                  value={selectedChain}
                  onChange={setSelectedChain}
                  placeholder={t("receive.searchCurrency")}
                  className="mt-2"
                />
              </div>
              {supportsBip21 && (
                <div>
                  <label className="block text-sm font-medium text-slate-300">{t("receive.amountOptional")}</label>
                  <p className="mt-1 text-xs text-slate-500">{t("receive.paymentRequestHint")}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAmountMode("crypto")}
                      className={`rounded-lg px-3 py-2 text-sm ${amountMode === "crypto" ? "bg-sky-500/20 text-sky-400" : "text-slate-500"}`}
                    >
                      {currentChain?.symbol ?? ""}
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
                        placeholder={t("receive.placeholderOptional")}
                        className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                      />
                      <div className="w-48">
                        <FiatCurrencyCombobox
                          value={fiatCurrency}
                          onChange={setFiatCurrency}
                          placeholder={t("receive.searchFiat")}
                        />
                      </div>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={amountCrypto}
                      onChange={(e) => setAmountCrypto(e.target.value)}
                      placeholder={t("receive.placeholderOptional")}
                      className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 font-mono text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  )}
                </div>
              )}
              {currentAddress && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center">
                  <p className="text-sm text-slate-400">
                    {t("receive.yourNameAddress").replace("{name}", currentChain?.name ?? selectedChain)}
                  </p>
                  {supportsBip21 && parseFloat(amountCrypto) > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{t("receive.sendOnlyTo").replace("{symbol}", currentChain?.symbol ?? "")}</p>
                  )}
                  {qrData && (
                    <div className="mt-4 flex justify-center">
                      <img src={qrData} alt="QR Code" width={200} height={200} />
                    </div>
                  )}
                  <p className="mt-4 break-all font-mono text-sm text-slate-300">{uriOrAddress}</p>
                  <button
                    onClick={copyAddress}
                    className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
                  >
                    {copied ? t("receive.copied") : t("receive.copy")}
                  </button>
                </div>
              )}
            </div>
          )}
          <Link href="/wallet" className="mt-6 inline-block text-sky-400 hover:underline">
            {t("portfolio.backToWallet")}
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}

export default function ReceivePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    }>
      <ReceivePageContent />
    </Suspense>
  );
}
