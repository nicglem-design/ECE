"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "kanox_currency";

type CurrencyContextType = {
  currency: string;
  setCurrency: (c: string) => void;
};

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState("usd");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 2 && stored.length <= 20) {
      setCurrencyState(stored.toLowerCase());
    }
  }, []);

  const setCurrency = useCallback((c: string) => {
    const normalized = c.toLowerCase().trim();
    setCurrencyState(normalized);
    localStorage.setItem(STORAGE_KEY, normalized);
  }, []);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  return (
    ctx ?? {
      currency: "usd",
      setCurrency: () => {},
    }
  );
}
