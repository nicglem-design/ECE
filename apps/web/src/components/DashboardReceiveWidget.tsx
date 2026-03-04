"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useWalletChains, useWalletAddresses } from "@/hooks/useWallet";
import { CurrencyCombobox } from "./CurrencyCombobox";
import QRCode from "qrcode";

export function DashboardReceiveWidget() {
  const { t } = useLanguage();
  const { chains, loading: chainsLoading } = useWalletChains();
  const { addresses, loading: addressesLoading } = useWalletAddresses();
  const [selectedChain, setSelectedChain] = useState("");
  const [qrData, setQrData] = useState("");
  const [copied, setCopied] = useState(false);

  const chainOptions = chains.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol }));
  const currentAddress = addresses.find((a) => a.chainId === selectedChain)?.address ?? "";
  const currentChain = chains.find((c) => c.id === selectedChain);

  useEffect(() => {
    if (chains.length > 0 && !selectedChain) setSelectedChain(chains[0].id);
  }, [chains, selectedChain]);

  useEffect(() => {
    if (currentAddress) {
      QRCode.toDataURL(currentAddress, { width: 160 }).then(setQrData).catch(() => setQrData(""));
    } else setQrData("");
  }, [currentAddress]);

  function copyAddress() {
    if (currentAddress) {
      navigator.clipboard.writeText(currentAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const loading = chainsLoading || addressesLoading;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h3 className="font-medium text-sky-400">{t("receive.title")}</h3>
      <p className="mt-1 text-sm text-slate-400">{t("receive.subtitle")}</p>
      {loading ? (
        <p className="mt-4 text-slate-500">{t("receive.generatingAddress")}</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm text-slate-400">{t("receive.walletCurrency")}</label>
            <div className="mt-1">
              <CurrencyCombobox
                options={chainOptions}
                value={selectedChain}
                onChange={setSelectedChain}
                placeholder={t("receive.searchCurrency")}
              />
            </div>
          </div>
          {currentAddress && (
            <div className="flex items-start gap-4">
              {qrData && <img src={qrData} alt="QR" width={80} height={80} className="shrink-0 rounded" />}
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-sm text-slate-300">{currentAddress}</p>
                <button
                  onClick={copyAddress}
                  className="mt-2 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600"
                >
                  {copied ? t("receive.copied") : t("receive.copy")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
