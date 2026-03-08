"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { WalletNav } from "@/components/WalletNav";
import {
  useFiatBalances,
  useLinkedAccounts,
  type LinkedAccount,
} from "@/hooks/useFiatAccounts";
import { apiPost, apiGet } from "@/lib/apiClient";
import { getCurrencySymbol } from "@/lib/currencies";

const FIAT_CURRENCIES = ["USD", "EUR", "GBP", "SEK"];
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000, 2500];

function AccountsContent() {
  const { t } = useLanguage();
  const { balances, loading, refetch } = useFiatBalances();
  const { accounts, addAccount, removeAccount } = useLinkedAccounts();
  const [depositCurrency, setDepositCurrency] = useState("USD");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [withdrawCurrency, setWithdrawCurrency] = useState("USD");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAccount, setWithdrawAccount] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [showWithdraw2FA, setShowWithdraw2FA] = useState(false);
  const [withdrawTotpCode, setWithdrawTotpCode] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addType, setAddType] = useState<"bank" | "card">("bank");
  const [addLabel, setAddLabel] = useState("");
  const [addLastFour, setAddLastFour] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [connectLinked, setConnectLinked] = useState<boolean | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    apiGet<{ linked: boolean }>("/api/v1/accounts/connect-status")
      .then((d) => setConnectLinked(d.linked))
      .catch(() => setConnectLinked(false));
  }, [searchParams?.get("connect")]);

  const handleConnectBank = async () => {
    setConnectLoading(true);
    try {
      const data = await apiPost<{ url?: string }>("/api/v1/accounts/connect-onboarding", {});
      if (data.url) window.location.href = data.url;
    } catch {
      setConnectLoading(false);
    }
    setConnectLoading(false);
  };

  const handlePayWithCard = async () => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      setDepositError("Enter a valid amount");
      return;
    }
    setCheckoutLoading(true);
    setDepositError(null);
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const data = await apiPost<{ url?: string; message?: string }>(
        "/api/v1/accounts/create-checkout",
        {
          currency: depositCurrency,
          amount: amt,
          successUrl: `${base}/accounts?deposit=success`,
          cancelUrl: `${base}/accounts?deposit=cancelled`,
        }
      );
      if (data.url) {
        window.location.href = data.url;
      } else {
        setDepositError(data.message || "Checkout not available");
      }
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      setDepositError("Enter a valid amount");
      return;
    }
    setDepositLoading(true);
    setDepositError(null);
    setDepositSuccess(null);
    try {
      await apiPost<{ success: boolean; amount: number; currency: string }>(
        "/api/v1/accounts/deposit",
        { currency: depositCurrency, amount: amt, method: "card" }
      );
      setDepositSuccess(`Added ${amt.toLocaleString()} ${depositCurrency}`);
      setDepositAmount("");
      refetch();
      setTimeout(() => setDepositSuccess(null), 4000);
    } catch (err) {
      setDepositError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) {
      setWithdrawError("Enter a valid amount");
      return;
    }
    const bal = balances.find((b) => b.currency === withdrawCurrency);
    if (!bal || bal.amount < amt) {
      setWithdrawError("Insufficient balance");
      return;
    }
    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);
    try {
      await apiPost<{ success: boolean; amount: number; currency: string }>(
        "/api/v1/accounts/withdraw",
        {
          currency: withdrawCurrency,
          amount: amt,
          linkedAccountId: withdrawAccount || undefined,
        }
      );
      setWithdrawSuccess(`Withdrew ${amt.toLocaleString()} ${withdrawCurrency}`);
      setWithdrawAmount("");
      refetch();
      setTimeout(() => setWithdrawSuccess(null), 4000);
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setWithdrawLoading(false);
    }
  };

  const handleAddAccount = async () => {
    if (!addLabel.trim()) return;
    setAddLoading(true);
    try {
      await addAccount(addType, addLabel.trim(), addLastFour || undefined);
      setAddModalOpen(false);
      setAddLabel("");
      setAddLastFour("");
    } finally {
      setAddLoading(false);
    }
  };

  const handleRemoveAccount = async (acc: LinkedAccount) => {
    if (!confirm(`Remove ${acc.label}?`)) return;
    await removeAccount(acc.id);
  };

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-theme">
        <WalletNav />
        <div className="mx-auto max-w-2xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">Accounts</h1>
          <p className="mt-2 text-slate-400">
            Deposit money to buy crypto, or withdraw to your bank or card.
          </p>

          {/* Fiat balances */}
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-800/40 p-4">
            <h2 className="text-lg font-semibold text-slate-200">Your balance</h2>
            {loading ? (
              <p className="mt-2 text-slate-500">Loading...</p>
            ) : balances.length === 0 ? (
              <p className="mt-2 text-slate-500">No fiat balance yet. Deposit to get started.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {balances
                  .filter((b) => b.amount > 0)
                  .map((b) => (
                    <div
                      key={b.currency}
                      className="flex items-center justify-between rounded-lg bg-slate-700/30 px-4 py-2"
                    >
                      <span className="font-medium text-slate-200">{b.currency}</span>
                      <span className="font-mono text-slate-300">
                        {getCurrencySymbol(b.currency.toLowerCase())}{" "}
                        {b.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Deposit */}
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-800/40 p-4">
            <h2 className="text-lg font-semibold text-green-400">Deposit</h2>
            <p className="mt-1 text-sm text-slate-500">
              Add money to your account to buy crypto. Simulated for testing.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Currency</label>
                <select
                  value={depositCurrency}
                  onChange={(e) => setDepositCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                >
                  {FIAT_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Amount</label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDepositAmount(String(amt))}
                    className="rounded-lg border border-slate-600 bg-slate-700/50 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
                  >
                    +{amt}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePayWithCard}
                  disabled={checkoutLoading || depositLoading || !depositAmount}
                  className="flex-1 rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                >
                  {checkoutLoading ? "Redirecting..." : "Pay with card"}
                </button>
                <button
                  onClick={handleDeposit}
                  disabled={depositLoading || !depositAmount}
                  className="flex-1 rounded-xl border border-slate-600 py-3 font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                >
                  {depositLoading ? "Adding..." : "Add (demo)"}
                </button>
              </div>
            </div>
            {depositSuccess && (
              <div className="mt-3 rounded-lg border border-green-800/50 bg-green-900/20 px-4 py-2 text-sm text-green-400">
                {depositSuccess}
              </div>
            )}
            {depositError && (
              <div className="mt-3 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
                {depositError}
              </div>
            )}
          </div>

          {/* Withdraw */}
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-800/40 p-4">
            <h2 className="text-lg font-semibold text-amber-400">Withdraw</h2>
            <p className="mt-1 text-sm text-slate-500">
              Send money to your bank account or card.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400">Currency</label>
                <select
                  value={withdrawCurrency}
                  onChange={(e) => setWithdrawCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                >
                  {FIAT_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">Amount</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                />
                {balances.find((b) => b.currency === withdrawCurrency) && (
                  <p className="mt-1 text-xs text-slate-500">
                    Available:{" "}
                    {getCurrencySymbol(withdrawCurrency.toLowerCase())}{" "}
                    {balances
                      .find((b) => b.currency === withdrawCurrency)
                      ?.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }) ?? "0"}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400">
                  Withdraw to (optional)
                </label>
                <select
                  value={withdrawAccount}
                  onChange={(e) => setWithdrawAccount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                >
                  <option value="">
                    {connectLinked ? "Connected bank account" : "External account"}
                  </option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} {a.last_four ? `****${a.last_four}` : ""}
                    </option>
                  ))}
                </select>
                {connectLinked === false && (
                  <button
                    type="button"
                    onClick={handleConnectBank}
                    disabled={connectLoading}
                    className="mt-2 text-sm text-sky-400 hover:text-sky-300"
                  >
                    {connectLoading ? "Connecting..." : "Connect bank for real withdrawals"}
                  </button>
                )}
                {connectLinked && (
                  <p className="mt-1 text-xs text-green-500">Bank connected via Stripe</p>
                )}
              </div>
              {showWithdraw2FA && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <label className="block text-sm font-medium text-amber-200">
                    Enter 2FA code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={withdrawTotpCode}
                    onChange={(e) => setWithdrawTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="mt-2 w-32 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 font-mono text-lg tracking-widest text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
              <button
                onClick={handleWithdraw}
                disabled={withdrawLoading || !withdrawAmount}
                className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
              >
                {withdrawLoading ? "Withdrawing..." : "Withdraw"}
              </button>
            </div>
            {withdrawSuccess && (
              <div className="mt-3 rounded-lg border border-green-800/50 bg-green-900/20 px-4 py-2 text-sm text-green-400">
                {withdrawSuccess}
              </div>
            )}
            {withdrawError && (
              <div className="mt-3 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
                {withdrawError}
              </div>
            )}
          </div>

          {/* Linked accounts */}
          <div className="mt-6 rounded-xl border border-slate-600 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-200">Linked accounts & cards</h2>
              <button
                onClick={() => setAddModalOpen(true)}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
              >
                Add
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Add bank accounts or cards for faster withdrawals.
            </p>
            {accounts.length === 0 ? (
              <p className="mt-3 text-slate-500">No linked accounts yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {accounts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg bg-slate-700/30 px-4 py-3"
                  >
                    <div>
                      <span className="font-medium text-slate-200">{a.label}</span>
                      <span className="ml-2 text-sm text-slate-500">
                        {a.type} {a.last_four ? `****${a.last_four}` : ""}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveAccount(a)}
                      className="text-sm text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add account modal */}
          {addModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-800 p-6">
                <h3 className="text-lg font-semibold text-slate-200">Add account</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400">Type</label>
                    <select
                      value={addType}
                      onChange={(e) => setAddType(e.target.value as "bank" | "card")}
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                    >
                      <option value="bank">Bank account</option>
                      <option value="card">Card</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400">Label</label>
                    <input
                      type="text"
                      value={addLabel}
                      onChange={(e) => setAddLabel(e.target.value)}
                      placeholder={addType === "bank" ? "e.g. Main bank" : "e.g. Visa ****1234"}
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400">
                      Last 4 digits (optional)
                    </label>
                    <input
                      type="text"
                      value={addLastFour}
                      onChange={(e) => setAddLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="1234"
                      maxLength={4}
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setAddModalOpen(false)}
                      className="flex-1 rounded-lg border border-slate-600 py-2 text-slate-300 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddAccount}
                      disabled={addLoading || !addLabel.trim()}
                      className="flex-1 rounded-lg bg-sky-600 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      {addLoading ? "Adding..." : "Add"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-4">
            <Link href="/wallet" className="text-sky-400 hover:underline">
              ← KanoWallet
            </Link>
            <Link href="/exchange" className="text-amber-400 hover:underline">
              KanoExchange →
            </Link>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-theme">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    }>
      <AccountsContent />
    </Suspense>
  );
}
