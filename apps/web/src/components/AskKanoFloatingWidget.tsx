"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useAskKano } from "@/contexts/AskKanoContext";

export function AskKanoFloatingWidget() {
  const { t } = useLanguage();
  const { isPro } = useTerminology();
  const { setOpen } = useAskKano();
  const label = isPro ? t("ai.askKano") : t("ai.askKanoForHelp");

  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/20 px-4 py-3 text-sm font-medium text-sky-400 shadow-lg backdrop-blur-xl transition hover:bg-sky-500/30 hover:border-sky-500/40"
      aria-label={label}
    >
      <span className="text-lg" aria-hidden>💬</span>
      <span>{label}</span>
    </button>
  );
}
