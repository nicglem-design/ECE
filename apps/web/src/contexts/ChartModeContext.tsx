"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "kanox_chart_mode";

export type ChartMode = "simple" | "complex";

type ChartModeContextType = {
  chartMode: ChartMode;
  setChartMode: (m: ChartMode) => void;
};

const ChartModeContext = createContext<ChartModeContextType | null>(null);

export function ChartModeProvider({ children }: { children: React.ReactNode }) {
  const [chartMode, setChartModeState] = useState<ChartMode>("complex");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ChartMode | null;
    if (stored === "simple" || stored === "complex") setChartModeState(stored);
  }, []);

  const setChartMode = useCallback((m: ChartMode) => {
    setChartModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  return (
    <ChartModeContext.Provider value={{ chartMode, setChartMode }}>
      {children}
    </ChartModeContext.Provider>
  );
}

export function useChartMode() {
  const ctx = useContext(ChartModeContext);
  return (
    ctx ?? {
      chartMode: "complex" as ChartMode,
      setChartMode: () => {},
    }
  );
}
