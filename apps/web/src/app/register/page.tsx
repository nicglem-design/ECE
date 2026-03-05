"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterPage() {
  const { t } = useLanguage();
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const birth = new Date(birthDate);
    const today = new Date();
    const age = Math.floor((today.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) {
      setError(t("auth.ageError"));
      return;
    }
    if (!acceptedTerms) {
      setError(t("auth.acceptTermsError") || "You must accept the Terms of Service and Privacy Policy.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const result = await signup(email, password, birthDate);
    setLoading(false);
    if (result.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(result.error || t("auth.connectError"));
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/50 p-8">
        <h1 className="text-2xl font-bold text-slate-200">{t("auth.registerTitle")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("auth.registerDesc")}</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            required
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            required
            minLength={8}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          <div>
            <label className="mb-1 block text-sm text-slate-400">{t("auth.birthDate")}</label>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 focus:border-sky-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">{t("auth.birthDateHint")}</p>
          </div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
            />
            <span className="text-sm text-slate-400">
              {t("auth.acceptTerms")}{" "}
              <Link href="/terms" className="text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer">
                {t("legal.terms")}
              </Link>
              {" "}&{" "}
              <Link href="/privacy" className="text-sky-400 hover:underline" target="_blank" rel="noopener noreferrer">
                {t("legal.privacy")}
              </Link>
            </span>
          </label>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-500 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("auth.createAccount")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          {t("auth.hasAccount")}{" "}
          <Link href="/login" className="text-sky-400 hover:underline">
            {t("auth.login")}
          </Link>
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-400">
          {t("nav.backTo")}
        </Link>
      </div>
    </main>
  );
}
