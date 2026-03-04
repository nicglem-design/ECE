"use client";

import { useAskKano } from "@/contexts/AskKanoContext";
import { AskKanoPanel } from "./AskKanoPanel";
import { AskKanoFloatingWidget } from "./AskKanoFloatingWidget";

/** Renders the global Ask Kano panel + floating widget. Used in root layout. */
export function AskKanoShell() {
  const { open, setOpen } = useAskKano();

  return (
    <>
      <AskKanoFloatingWidget />
      <AskKanoPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
