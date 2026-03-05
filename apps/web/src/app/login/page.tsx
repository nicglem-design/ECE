"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
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
      <div className="w-full max-w-md rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
        <h1 className="text-2xl font-bold text-slate-200">{t("auth.login")}</h1>
        <p className="mt-2 text-sm text-slate-400">{t("auth.loginDesc")}</p>
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
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-sky-500 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("auth.login")}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-400">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="text-sky-400 hover:underline">
            {t("auth.register")}
          </Link>
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-400">
          {t("nav.backTo")}
        </Link>
      </div>
    </main>
  );
}
