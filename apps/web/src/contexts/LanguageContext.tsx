"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  ALL_LOCALES,
  getTranslations,
  localeFromNavigator,
  type LocaleCode,
} from "@/lib/translations";

const STORAGE_KEY = "kanox_language";

type LanguageContextType = {
  locale: LocaleCode;
  setLocale: (l: LocaleCode) => void;
  t: (key: string) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LocaleCode | null;
    if (stored && ALL_LOCALES.some((l) => l.code === stored)) {
      setLocaleState(stored);
    } else {
      setLocaleState(localeFromNavigator());
    }
  }, []);

  const setLocale = useCallback((l: LocaleCode) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useMemo(() => {
    const trans = getTranslations(locale);
    return (key: string) => trans[key] ?? key;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    const trans = getTranslations("en");
    return {
      locale: "en" as LocaleCode,
      setLocale: () => {},
      t: (key: string) => trans[key] ?? key,
    };
  }
  return ctx;
}
