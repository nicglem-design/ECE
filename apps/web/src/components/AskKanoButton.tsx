"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { useAskKano } from "@/contexts/AskKanoContext";

export function AskKanoButton() {
  const { t } = useLanguage();
  const { setOpen } = useAskKano();

  return (
    <button
      onClick={() => setOpen(true)}
      className="rounded-lg bg-sky-500/20 px-3 py-2 text-sm font-medium text-sky-400 transition hover:bg-sky-500/30"
    >
      {t("ai.askKano")}
    </button>
  );
}
