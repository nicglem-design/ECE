"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950">
      <h2 className="text-xl font-bold text-slate-200">{t("error.title")}</h2>
      <p className="mt-2 text-slate-400">{t("error.app")}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
      >
        {t("error.tryAgain")}
      </button>
      <Link href="/" className="mt-4 text-sm text-sky-400 hover:underline">
        {t("error.goHome")}
      </Link>
    </div>
  );
}
