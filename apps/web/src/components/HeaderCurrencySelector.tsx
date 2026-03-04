"use client";

import { FiatCurrencyCombobox } from "./FiatCurrencyCombobox";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useLanguage } from "@/contexts/LanguageContext";

export function HeaderCurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{t("dashboard.livePrices")}</span>
      <div className="w-36">
        <FiatCurrencyCombobox
          value={currency}
          onChange={setCurrency}
          placeholder={t("receive.searchFiat")}
        />
      </div>
    </div>
  );
}
