"use client";

import { useEffect } from "react";

const THEME_KEY = "kanox_theme";

const VALID_THEMES = ["light", "dark", "blue", "amber", "green", "purple", "rose", "emerald", "cyan"];

function getEffectiveTheme(stored: string | null): string {
  if (!stored || stored === "system") {
    return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return VALID_THEMES.includes(stored) ? stored : "dark";
}

export function applyTheme(theme: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.setAttribute("data-theme", getEffectiveTheme(theme));
  window.dispatchEvent(new CustomEvent("kanox-theme-change", { detail: { theme } }));
}

export function ThemeInit() {
  useEffect(() => {
    const apply = () => {
      const theme = localStorage.getItem(THEME_KEY) ?? "dark";
      document.documentElement.setAttribute("data-theme", getEffectiveTheme(theme));
    };
    apply();
    window.addEventListener("storage", apply);
    window.addEventListener("kanox-theme-change", apply);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => {
      window.removeEventListener("storage", apply);
      window.removeEventListener("kanox-theme-change", apply);
      mq.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
