"use client";

import { useTerminology } from "@/contexts/TerminologyContext";

export function TerminologyToggle() {
  const { mode, setMode } = useTerminology();

  return (
    <div
      role="group"
      aria-label="Terminology mode: Simple uses plain language, Pro uses crypto terms"
      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1"
    >
      <button
        type="button"
        onClick={() => setMode("simple")}
        aria-pressed={mode === "simple"}
        aria-label="Simple mode – plain language"
        className={`rounded px-2 py-1 text-xs font-medium transition ${
          mode === "simple" ? "bg-sky-500/30 text-sky-400" : "text-slate-500 hover:text-slate-300"
        }`}
      >
        Simple
      </button>
      <button
        type="button"
        onClick={() => setMode("pro")}
        aria-pressed={mode === "pro"}
        aria-label="Pro mode – crypto terms"
        className={`rounded px-2 py-1 text-xs font-medium transition ${
          mode === "pro" ? "bg-sky-500/30 text-sky-400" : "text-slate-500 hover:text-slate-300"
        }`}
      >
        Pro
      </button>
    </div>
  );
}
