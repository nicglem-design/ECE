"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { apiGet, apiPost } from "@/lib/apiClient";

const SumsubWebSdk = dynamic(
  () => import("@sumsub/websdk-react").then((mod) => mod.default),
  { ssr: false }
);

export default function KycPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    const res = await apiPost<{ token: string }>("/api/v1/kyc/access-token", {});
    return res.token;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const statusRes = await apiGet<{ kycStatus: string }>("/api/v1/kyc/status");
        if (cancelled) return;
        setKycStatus(statusRes.kycStatus);
        if (statusRes.kycStatus === "approved") {
          router.replace("/dashboard");
          return;
        }
        try {
          const token = await fetchToken();
          if (cancelled) return;
          setAccessToken(token);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("503") || msg.includes("not configured")) {
            setNotConfigured(true);
          } else {
            setError(msg);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [fetchToken, router]);

  const expirationHandler = useCallback(() => fetchToken(), [fetchToken]);

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-theme">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-bold text-slate-200">{t("kyc.title")}</h1>
          <p className="mt-2 text-slate-400">{t("kyc.instructions")}</p>
          {loading ? (
            <p className="mt-8 text-slate-500">{t("kyc.loading")}</p>
          ) : notConfigured ? (
            <div className="mt-8 rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
              <p className="text-slate-400">{t("kyc.notConfigured")}</p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
              >
                {t("kyc.continueToDashboard")}
              </Link>
            </div>
          ) : error ? (
            <div className="mt-8 rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
              <p className="text-red-400">{error}</p>
              <Link
                href="/dashboard"
                className="mt-4 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
              >
                {t("kyc.continueToDashboard")}
              </Link>
            </div>
          ) : accessToken ? (
            <div className="mt-8 min-h-[500px] overflow-hidden rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl">
              <SumsubWebSdk
                accessToken={accessToken}
                expirationHandler={expirationHandler}
                config={{
                  lang: "en",
                  theme: "dark",
                }}
                options={{
                  addViewportTag: false,
                  adaptIframeHeight: true,
                }}
                className="w-full"
              />
            </div>
          ) : null}
          <Link href="/" className="mt-6 inline-block text-sky-400 hover:underline">
            {t("kyc.backToKanoXchange")}
          </Link>
        </div>
      </main>
    </ProtectedRoute>
  );
}
