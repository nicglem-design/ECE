"use client";

import { createContext, useContext, useState, useEffect } from "react";

type AskKanoContextType = {
  open: boolean;
  setOpen: (v: boolean) => void;
};

const AskKanoContext = createContext<AskKanoContextType | null>(null);

export function AskKanoProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("kano-open", handler);
    return () => window.removeEventListener("kano-open", handler);
  }, []);

  return (
    <AskKanoContext.Provider value={{ open, setOpen }}>
      {children}
    </AskKanoContext.Provider>
  );
}

export function useAskKano() {
  const ctx = useContext(AskKanoContext);
  return ctx ?? { open: false, setOpen: () => {} };
}
