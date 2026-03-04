"use client";

import { useState, useRef, useEffect } from "react";

export interface CurrencyOption {
  id: string;
  name: string;
  symbol: string;
}

export function CurrencyCombobox({
  options,
  value,
  onChange,
  placeholder = "Search currency...",
  className = "",
}: {
  options: CurrencyOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);
  const filtered = search.trim()
    ? options.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.symbol.toLowerCase().includes(search.toLowerCase()) ||
          o.id.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-left text-slate-200 focus:border-sky-500 focus:outline-none"
      >
        <span>{selected ? `${selected.symbol} – ${selected.name}` : placeholder}</span>
        <span className="text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-700 bg-slate-800 shadow-lg">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full border-b border-slate-700 bg-slate-800 px-4 py-2 text-slate-200 placeholder-slate-500 focus:outline-none"
            autoFocus
          />
          <div className="max-h-48 overflow-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No results</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-700 ${
                    value === opt.id ? "bg-sky-500/20 text-sky-400" : "text-slate-300"
                  }`}
                >
                  {opt.symbol} – {opt.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
