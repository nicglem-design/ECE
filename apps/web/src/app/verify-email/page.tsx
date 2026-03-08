"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";

function VerifyEmailContent() {
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(t("auth.verifyEmailInvalid") || "Invalid verification link.");
      return;
    }
    const base = typeof window !== "undefined" ? "" : "";
    fetch(`${base}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
          setMessage(t("auth.verifyEmailSuccess") || "Email verified! You can now log in.");
        } else {
          setStatus("error");
          setMessage(data.message || t("auth.verifyEmailFailed") || "Verification failed.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage(t("auth.verifyEmailFailed") || "Verification failed.");
      });
  }, [token, t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-theme">
      <div className="w-full max-w-md rounded-2xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-8">
        <h1 className="text-2xl font-bold text-slate-200">
          {t("auth.verifyEmail") || "Verify your email"}
        </h1>
        {status === "loading" && (
          <p className="mt-4 text-slate-400">
            {t("common.loading")}...
          </p>
        )}
        {status === "success" && (
          <>
            <p className="mt-4 text-green-400">{message}</p>
            <Link
              href="/login"
              className="mt-6 block w-full rounded-lg bg-sky-500 py-3 text-center font-medium text-white hover:bg-sky-600"
            >
              {t("auth.login")}
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mt-4 text-red-400">{message}</p>
            <Link
              href="/login"
              className="mt-6 block w-full rounded-lg border border-slate-600 py-3 text-center font-medium text-slate-300 hover:bg-slate-700"
            >
              {t("auth.login")}
            </Link>
          </>
        )}
        <Link href="/" className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-400">
          {t("nav.backTo")}
        </Link>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-theme">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
