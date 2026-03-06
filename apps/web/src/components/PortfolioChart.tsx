"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Brush,
} from "recharts";
import { fetchMarketChartViaAPI, pricePointsToArray, CHAIN_TO_COINGECKO } from "@/lib/coingecko";
import { useCurrency } from "@/contexts/CurrencyContext";
import { getCurrencySymbol } from "@/lib/currencies";
import { useLanguage } from "@/contexts/LanguageContext";

interface Asset {
  chainId: string;
  symbol: string;
  name: string;
  amount: string;
}

const PERIODS = [
  { id: "1D", days: 1, label: "1D" },
  { id: "1W", days: 7, label: "1W" },
  { id: "1M", days: 30, label: "1M" },
  { id: "3M", days: 90, label: "3M" },
  { id: "5M", days: 150, label: "5M" },
  { id: "1Y", days: 365, label: "1Y" },
  { id: "5Y", days: 1825, label: "5Y" },
];

export type ChartMode = "simple" | "complex";

export function PortfolioChart({
  assets,
  onTotalChange,
  useCoinsTerminology = false,
  chartMode: chartModeProp,
}: {
  assets: Asset[];
  onTotalChange?: (total: number, changePct: number | null) => void;
  useCoinsTerminology?: boolean;
  chartMode?: ChartMode;
}) {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const [data, setData] = useState<{ time: string; value: number; ts: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("1M");
  const [zoom, setZoom] = useState<{ start: number; end: number } | null>(null);
  const [internalChartMode, setInternalChartMode] = useState<ChartMode>("complex");
  const chartMode = chartModeProp ?? internalChartMode;
  const containerRef = useRef<HTMLDivElement>(null);

  const periodConfig = PERIODS.find((p) => p.id === period) ?? PERIODS[2];
  const days = periodConfig.days as number;

  useEffect(() => {
    if (assets.length === 0) {
      setData([]);
      setLoading(false);
      onTotalChange?.(0, null);
      return;
    }
    setLoading(true);
    setZoom(null);
    const fiat = (currency || "usd").toLowerCase();
    const fetchAll = assets.map(async (a) => {
      const cgId = CHAIN_TO_COINGECKO[a.chainId];
      if (!cgId) return null;
      const points = await fetchMarketChartViaAPI(cgId, fiat, days);
      const prices = pricePointsToArray(points);
      const amount = parseFloat(a.amount) || 0;
      return { prices, amount, timestamps: points.map(([t]) => t) };
    });
    Promise.all(fetchAll).then((results) => {
      const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
      if (valid.length === 0) {
        setData([]);
        setLoading(false);
        onTotalChange?.(0, null);
        return;
      }
      const base = valid[0];
      const combined = base.prices.map((p, i) => {
        let value = base.amount * p;
        for (let j = 1; j < valid.length; j++) {
          const other = valid[j];
          const ratio = base.prices.length > 1 ? i / (base.prices.length - 1) : 0;
          const idx = Math.floor(ratio * (other.prices.length - 1));
          const otherPrice = other.prices[Math.min(idx, other.prices.length - 1)] ?? 0;
          value += other.amount * otherPrice;
        }
        const ts = base.timestamps[i] ?? Date.now();
        const date = new Date(ts);
        const timeLabel =
          days <= 1
            ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
            : days <= 7
              ? date.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })
              : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: days > 365 ? "numeric" : undefined });
        return {
          time: timeLabel,
          value: Math.round(value * 100) / 100,
          ts,
        };
      });
      setData(combined);
      setLoading(false);
      if (combined.length >= 2) {
        const first = combined[0].value;
        const last = combined[combined.length - 1].value;
        const changePct = first > 0 ? ((last - first) / first) * 100 : null;
        onTotalChange?.(last, changePct);
      } else {
        onTotalChange?.(combined[0]?.value ?? 0, null);
      }
    }).catch(() => {
      setData([]);
      setLoading(false);
      onTotalChange?.(0, null);
    });
  }, [assets, currency, days, onTotalChange]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (data.length < 2 || !zoom) return;
      const delta = e.deltaY > 0 ? 1 : -1;
      const range = zoom.end - zoom.start;
      if (delta > 0 && range >= data.length) return;
      if (delta < 0 && range <= 2) return;
      const newRange = Math.max(2, Math.min(data.length, range + delta * 2));
      const center = (zoom.start + zoom.end) / 2;
      let start = Math.floor(center - newRange / 2);
      let end = Math.floor(center + newRange / 2);
      if (start < 0) { start = 0; end = newRange; }
      if (end > data.length) { end = data.length; start = data.length - newRange; }
      setZoom({ start, end });
    },
    [data.length, zoom]
  );

  const visibleData = zoom ? data.slice(zoom.start, zoom.end) : data;
  const sym = getCurrencySymbol(currency || "usd");

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl">
        <p className="text-slate-500">{t("portfolio.loadingChart")}</p>
      </div>
    );
  }
  if (data.length < 2) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-2 rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-6">
        <p className="text-center text-slate-500">
          {assets.length > 0
            ? (t("portfolio.noChartData") || "No chart data available. Try again later.")
            : (useCoinsTerminology ? t("portfolio.noCoinsToDisplay") : t("portfolio.noAssets")) || (useCoinsTerminology ? "No coins to display." : "No assets to display.")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-400/30 bg-slate-800/40 backdrop-blur-xl p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {chartModeProp == null && (
            <>
              <button
                type="button"
                onClick={() => setInternalChartMode("simple")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  chartMode === "simple"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
              >
                {t("portfolio.chartSimple")}
              </button>
              <button
                type="button"
                onClick={() => setInternalChartMode("complex")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  chartMode === "complex"
                    ? "bg-amber-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                }`}
              >
                {t("portfolio.chartComplex")}
              </button>
            </>
          )}
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                period === p.id ? "bg-sky-500/30 text-sky-400" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => {
              if (!z || data.length < 4) return z;
              const mid = Math.floor((z.start + z.end) / 2);
              const newRange = Math.max(2, Math.floor((z.end - z.start) / 1.5));
              return { start: Math.max(0, mid - newRange), end: Math.min(data.length, mid + newRange) };
            })}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:text-sky-400"
            title={t("portfolio.zoomHint")}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => {
              if (!z) return { start: 0, end: data.length };
              const mid = Math.floor((z.start + z.end) / 2);
              const newRange = Math.min(data.length, Math.floor((z.end - z.start) * 1.5));
              return { start: Math.max(0, mid - newRange), end: Math.min(data.length, mid + newRange) };
            })}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:text-sky-400"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:text-sky-400"
          >
            {t("portfolio.reset")}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="h-96" onWheel={handleWheel}>
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === "simple" ? (
            <LineChart data={visibleData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v) => `${sym} ${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(2)}`}
                domain={["auto", "auto"]}
                tickLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                formatter={(value: number) => [`${sym} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Value"]}
                labelFormatter={(label) => label}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#0ea5e9" }}
              />
            </LineChart>
          ) : (
            <AreaChart data={visibleData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickFormatter={(v) => `${sym} ${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(2)}`}
                domain={["auto", "auto"]}
                tickLine={false}
                width={56}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px" }}
                formatter={(value: number) => [`${sym} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Value"]}
                labelFormatter={(label) => label}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#0ea5e9" }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
      {data.length > 10 && (
        <div className="mt-2 h-12">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === "simple" ? (
              <LineChart data={data}>
                <Brush
                  dataKey="time"
                  height={28}
                  stroke="#334155"
                  fill="#1e293b"
                  travellerWidth={8}
                  onChange={(range) => {
                    if (range?.startIndex != null && range?.endIndex != null) {
                      setZoom({ start: range.startIndex, end: Math.min(range.endIndex + 1, data.length) });
                    }
                  }}
                />
                <Line type="monotone" dataKey="value" stroke="#0ea5e9" strokeWidth={1} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={data}>
                <Brush
                  dataKey="time"
                  height={28}
                  stroke="#334155"
                  fill="#1e293b"
                  travellerWidth={8}
                  onChange={(range) => {
                    if (range?.startIndex != null && range?.endIndex != null) {
                      setZoom({ start: range.startIndex, end: Math.min(range.endIndex + 1, data.length) });
                    }
                  }}
                />
                <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="none" strokeWidth={1} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
