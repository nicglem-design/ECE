"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { PasswordStrengthIndicator } from "@/components/PasswordStrengthIndicator";

function ResetPasswordContent() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError(t("auth.resetInvalid") || "Invalid reset link.");
  }, [token, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch") || "Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const base = typeof window !== "undefined" ? "" : "";
    try {
      const res = await fetch(`${base}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2000);
      } else {
        setError(data.message || "Reset failed");
      }
    } catch {
      setError(t("auth.connectError") || "Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-theme">
        <div className="w-full max-w-md rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("auth.resetPassword") || "Reset password"}</h1>
          <p className="mt-4 text-red-400">{error}</p>
          <Link href="/forgot-password" className="mt-6 block text-center text-sky-400 hover:underline">
            {t("auth.requestNewLink") || "Request a new link"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-theme">
      <div className="w-full max-w-md rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
        <h1 className="text-2xl font-bold text-slate-200">
          {t("auth.resetPassword") || "Reset password"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {t("auth.resetPasswordDesc") || "Enter your new password below."}
        </p>
        {success ? (
          <p className="mt-6 text-green-400">
            {t("auth.resetSuccess") || "Password reset successfully! Redirecting to login..."}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.newPassword") || "New password"}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
            <PasswordStrengthIndicator password={password} />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("auth.confirmPassword") || "Confirm password"}
              required
              minLength={8}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-sky-500 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? t("common.loading") : (t("auth.resetPassword") || "Reset password")}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-slate-400">
          <Link href="/login" className="text-sky-400 hover:underline">
            {t("auth.backToLogin") || "Back to login"}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-theme">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
