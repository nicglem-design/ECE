"use client";

import { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const base = typeof window !== "undefined" ? "" : "";
    try {
      const res = await fetch(`${base}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSent(true);
      } else {
        setError(data.message || "Request failed");
      }
    } catch {
      setError(t("auth.connectError") || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-theme">
      <div className="w-full max-w-md rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
        <h1 className="text-2xl font-bold text-slate-200">
          {t("auth.forgotPassword") || "Forgot password"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {t("auth.forgotPasswordDesc") || "Enter your email and we'll send you a link to reset your password."}
        </p>
        {!sent ? (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-sky-500 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? t("common.loading") : (t("auth.sendResetLink") || "Send reset link")}
            </button>
          </form>
        ) : (
          <p className="mt-6 text-green-400">
            {t("auth.resetEmailSent") || "If an account exists with that email, you will receive a password reset link."}
          </p>
        )}
        <p className="mt-4 text-center text-sm text-slate-400">
          <Link href="/login" className="text-sky-400 hover:underline">
            {t("auth.backToLogin") || "Back to login"}
          </Link>
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-400">
          {t("nav.backTo")}
        </Link>
      </div>
    </main>
  );
}
