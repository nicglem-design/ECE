"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useProfile } from "@/hooks/useProfile";

const STORAGE_KEY = "kanox_terminology";

export type TerminologyMode = "simple" | "pro";

type TerminologyContextType = {
  mode: TerminologyMode;
  setMode: (m: TerminologyMode) => void;
  isPro: boolean;
};

const TerminologyContext = createContext<TerminologyContextType | null>(null);

export function TerminologyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { profile, updateProfile } = useProfile();
  const [mode, setModeState] = useState<TerminologyMode>("simple");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as TerminologyMode | null;
    if (stored === "simple" || stored === "pro") setModeState(stored);
  }, []);

  useEffect(() => {
    if (isAuthenticated && profile?.preferredTerminology) {
      const p = profile.preferredTerminology === "pro" ? "pro" : "simple";
      setModeState(p);
      localStorage.setItem(STORAGE_KEY, p);
    }
  }, [isAuthenticated, profile?.preferredTerminology]);

  const setMode = useCallback(
    (m: TerminologyMode) => {
      setModeState(m);
      localStorage.setItem(STORAGE_KEY, m);
      if (isAuthenticated) {
        updateProfile({ preferredTerminology: m });
      }
    },
    [isAuthenticated, updateProfile]
  );

  return (
    <TerminologyContext.Provider value={{ mode, setMode, isPro: mode === "pro" }}>
      {children}
    </TerminologyContext.Provider>
  );
}

export function useTerminology() {
  const ctx = useContext(TerminologyContext);
  return (
    ctx ?? {
      mode: "simple" as TerminologyMode,
      setMode: () => {},
      isPro: false,
    }
  );
}
