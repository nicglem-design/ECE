"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import { useWalletChains } from "@/hooks/useWallet";
import { apiPost } from "@/lib/apiClient";
import { TokenLogo } from "@/components/TokenLogo";

const FAUCET_AMOUNTS: Record<string, number> = {
  tether: 500,
  ethereum: 0.1,
  bitcoin: 0.001,
  solana: 1,
  binancecoin: 0.5,
};

export default function DepositPage() {
  const { t } = useLanguage();
  const { chains, loading: chainsLoading } = useWalletChains();
  const [selectedChain, setSelectedChain] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = async () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (!selectedChain) {
      setError("Select an asset");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await apiPost<{ success: boolean; amount: number }>("/api/v1/wallet/deposit", {
        chainId: selectedChain,
        amount: amt,
      });
      setSuccess(`Added ${amt} ${chains.find((c) => c.id === selectedChain)?.symbol ?? selectedChain}`);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  };

  const quickAdd = (chainId: string, amt: number) => {
    setSelectedChain(chainId);
    setAmount(String(amt));
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-theme">
        <WalletNav />
        <div className="mx-auto max-w-xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">Add funds</h1>
          <p className="mt-2 text-slate-400">
            Simulated deposit for testing. Add funds to your wallet to use the exchange.
          </p>

          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-800/40 p-4">
            <label className="block text-sm font-medium text-slate-400">Asset</label>
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-200"
            >
              <option value="">Select...</option>
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.symbol} – {c.name}
                </option>
              ))}
              <option value="tether">USDT – Tether</option>
            </select>

            <label className="mt-4 block text-sm font-medium text-slate-400">Amount</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="0"
              step="any"
              className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-slate-200"
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(FAUCET_AMOUNTS).map(([chainId, amt]) => (
                <button
                  key={chainId}
                  type="button"
                  onClick={() => quickAdd(chainId, amt)}
                  className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
                >
                  +{amt} {chainId === "tether" ? "USDT" : chains.find((c) => c.id === chainId)?.symbol ?? chainId}
                </button>
              ))}
            </div>

            <button
              onClick={handleDeposit}
              disabled={loading || !selectedChain || !amount}
              className="mt-6 w-full rounded-xl bg-sky-500 py-3 font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add funds"}
            </button>
          </div>

          {success && (
            <div className="mt-4 rounded-lg border border-green-800/50 bg-green-900/20 px-4 py-2 text-green-400">
              {success}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-red-400">
              {error}
            </div>
          )}

          <Link href="/wallet" className="mt-6 inline-block text-sky-400 hover:underline">
            ← Back to wallet
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}
