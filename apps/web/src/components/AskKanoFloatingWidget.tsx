"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { useAskKano } from "@/contexts/AskKanoContext";

export function AskKanoFloatingWidget() {
  const { t } = useLanguage();
  const { setOpen } = useAskKano();

  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-400 shadow-lg transition hover:bg-sky-500/30 hover:shadow-sky-500/20"
      aria-label={t("ai.askKano")}
    >
      <span className="text-lg" aria-hidden>💬</span>
      <span>{t("ai.askKano")}</span>
    </button>
  );
}
