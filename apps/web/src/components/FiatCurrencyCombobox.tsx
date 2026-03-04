"use client";

import { useState, useEffect, useRef } from "react";
import { getFallbackCurrencies, fetchSupportedCurrencies } from "@/lib/currencies";
import { CurrencyCombobox, type CurrencyOption } from "./CurrencyCombobox";

export function FiatCurrencyCombobox({
  value,
  onChange,
  placeholder = "Search currency (USD, EUR, SEK...)",
  className = "",
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [options, setOptions] = useState<CurrencyOption[]>(() =>
    getFallbackCurrencies().map((c) => ({ id: c.id, name: c.name, symbol: c.symbol }))
  );

  useEffect(() => {
    fetchSupportedCurrencies().then((list) => {
      setOptions(list.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol })));
    });
  }, []);

  return (
    <CurrencyCombobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
    />
  );
}
