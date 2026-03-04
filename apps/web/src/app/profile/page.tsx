"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useProfile } from "@/hooks/useProfile";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { applyTheme } from "@/components/ThemeInit";
import { ALL_LOCALES, type LocaleCode } from "@/lib/translations";
import { FiatCurrencyCombobox } from "@/components/FiatCurrencyCombobox";
import { useTerminology } from "@/contexts/TerminologyContext";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "blue", label: "Blue" },
  { value: "amber", label: "Amber" },
];

export default function ProfilePage() {
  const { t, locale, setLocale } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const { profile, loading, updateProfile } = useProfile();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const { mode: terminology, setMode: setTerminology } = useTerminology();
  const [theme, setTheme] = useState("dark");
  const [preferredCurrency, setPreferredCurrency] = useState("usd");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [langSearch, setLangSearch] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || "");
      setAvatarUrl(profile.avatarUrl || "");
      setTheme(profile.theme || "dark");
      setPreferredCurrency(profile.preferredCurrency || "usd");
      setCurrency(profile.preferredCurrency || "usd");
    }
  }, [profile, setCurrency]);

  const filteredLocales = langSearch
    ? ALL_LOCALES.filter(
        (l) =>
          l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
          l.code.toLowerCase().includes(langSearch.toLowerCase())
      )
    : ALL_LOCALES;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const result = await updateProfile({
      displayName,
      avatarUrl: avatarUrl || undefined,
      theme,
      preferredCurrency: preferredCurrency || "usd",
    });
    setSaving(false);
    if (result.ok) {
      setCurrency(preferredCurrency || "usd");
      applyTheme(theme);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

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
              <Link href="/dashboard" className="text-sm text-slate-400 hover:text-sky-400">
                {t("nav.dashboard")}
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
        <div className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="text-2xl font-bold text-slate-200">{t("profile.title")}</h1>
          <p className="mt-2 text-slate-400">{t("profile.subtitle")}</p>
          {loading ? (
            <p className="mt-6 text-slate-500">{t("common.loading")}</p>
          ) : profile ? (
            <form onSubmit={handleSave} className="mt-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("profile.picture")}</label>
                <p className="mt-1 text-sm text-slate-500">{t("profile.pictureDesc")}</p>
                <div className="mt-2 flex items-center gap-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profile"
                      className="h-16 w-16 rounded-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-2xl text-slate-400">
                      {displayName?.[0]?.toUpperCase() || profile.email[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("profile.displayName")}</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("profile.displayNamePlaceholder")}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("auth.email")}</label>
                <p className="mt-2 text-slate-400">{profile.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">Terminology mode</label>
                <p className="mt-1 text-sm text-slate-500">Simple = plain-language explanations. Pro = standard crypto terms.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTerminology("simple")}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      terminology === "simple" ? "bg-sky-500 text-white" : "border border-slate-600 text-slate-400"
                    }`}
                  >
                    Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => setTerminology("pro")}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      terminology === "pro" ? "bg-sky-500 text-white" : "border border-slate-600 text-slate-400"
                    }`}
                  >
                    Pro
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("profile.theme")}</label>
                <p className="mt-1 text-sm text-slate-500">{t("profile.themeDesc")}</p>
                <div className="mt-2 flex gap-2">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTheme(opt.value)}
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        theme === opt.value
                          ? "bg-sky-500 text-white"
                          : "border border-slate-600 text-slate-400 hover:border-sky-500/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("profile.currency")}</label>
                <p className="mt-1 text-sm text-slate-500">{t("profile.currencyDesc")}</p>
                <div className="mt-2">
                  <FiatCurrencyCombobox
                    value={preferredCurrency}
                    onChange={setPreferredCurrency}
                    placeholder={t("receive.searchFiat")}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300">{t("profile.language")}</label>
                <p className="mt-1 text-sm text-slate-500">{t("profile.languageDesc")}</p>
                <input
                  type="text"
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  placeholder={t("profile.searchLanguage")}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as LocaleCode)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-slate-200 focus:border-sky-500 focus:outline-none"
                >
                  {filteredLocales.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-sky-500 px-6 py-3 font-medium text-white hover:bg-sky-600 disabled:opacity-50"
              >
                {saving ? t("profile.saving") : saved ? t("profile.saved") : t("profile.saveChanges")}
              </button>
            </form>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-4">
            <Link href="/kyc" className="text-sky-400 hover:underline">
              {t("kyc.verifyIdentity")}
            </Link>
            <Link href="/" className="text-sky-400 hover:underline">
              {t("nav.backTo")}
            </Link>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
