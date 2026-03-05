"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

export type ChartRange = "1" | "7" | "30" | "90" | "150" | "365" | "1825";
export type ChartMode = "simple" | "complex";

/** Convert [timestamp_ms, price][] to line/area data { time, value } */
function toLineData(points: [number, number][]): { time: UTCTimestamp; value: number }[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  return sorted.map(([ts, val]) => ({ time: Math.floor(ts / 1000) as UTCTimestamp, value: val }));
}

/** Convert [timestamp_ms, price][] to OHLC candles. Each point becomes a candle (open=prev, close=current). */
function priceToCandles(points: [number, number][]): CandlestickData[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  const candles: CandlestickData[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const [ts, close] = sorted[i];
    const prevClose = i > 0 ? sorted[i - 1][1] : close;
    const open = prevClose;
    const high = Math.max(open, close);
    const low = Math.min(open, close);
    const time = Math.floor(ts / 1000) as any;
    candles.push({ time, open, high, low, close });
  }
  return candles;
}

/** OHLC candle shape (compatible with lightweight-charts CandlestickData) */
export type CandlestickDataPoint = { time: number; open: number; high: number; low: number; close: number };

type Props = {
  data: [number, number][];
  candles?: CandlestickDataPoint[] | null;
  range: ChartRange;
  onRangeChange?: (r: ChartRange) => void;
  chartMode?: ChartMode;
  height?: number;
  /** Max days for chart (e.g. 365 for stablecoins). Hides longer ranges like 5Y. */
  maxDays?: number;
};

const ALL_RANGES: { value: ChartRange; label: string; days: number }[] = [
  { value: "1", label: "1D", days: 1 },
  { value: "7", label: "1W", days: 7 },
  { value: "30", label: "1M", days: 30 },
  { value: "90", label: "3M", days: 90 },
  { value: "150", label: "5M", days: 150 },
  { value: "365", label: "1Y", days: 365 },
  { value: "1825", label: "5Y", days: 1825 },
];

export function CryptoDetailChart({ data, candles: candlesProp, range, onRangeChange, chartMode = "complex", height = 480, maxDays }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !data.length) return;
    const w = container.clientWidth || 400;
    const h = typeof height === "number" ? height : 400;
    const chart = createChart(container, {
      width: w,
      height: h,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
        fontFamily: "system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(148,163,184,0.1)" },
        horzLines: { color: "rgba(148,163,184,0.1)" },
      },
      rightPriceScale: {
        borderColor: "rgba(148,163,184,0.2)",
        scaleMargins: { top: 0.05, bottom: 0.08 },
      },
      timeScale: {
        borderColor: "rgba(148,163,184,0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(34,197,94,0.5)" },
        horzLine: { color: "rgba(34,197,94,0.5)" },
      },
      handleScroll: { vertTouchDrag: true, horzTouchDrag: true },
    });

    if (chartMode === "simple") {
      const lineData = toLineData(data);
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: "#22c55e",
        topColor: "rgba(34, 197, 94, 0.4)",
        bottomColor: "rgba(34, 197, 94, 0)",
        lineWidth: 2,
      });
      areaSeries.setData(lineData);
      chartRef.current = chart;
      seriesRef.current = areaSeries;
    } else {
      const candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });
      const candles = candlesProp?.length ? candlesProp : priceToCandles(data);
      candlestickSeries.setData(candles as CandlestickData[]);
      chartRef.current = chart;
      seriesRef.current = candlestickSeries;
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const cw = container.clientWidth;
      if (cw > 0) chart.applyOptions({ width: cw });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [data, candlesProp, height, chartMode]);

  const ranges = maxDays != null
    ? ALL_RANGES.filter((r) => r.days <= maxDays)
    : ALL_RANGES;

  const chartHeight = typeof height === "number" ? height : 480;

  return (
    <div className="flex min-w-0 w-full flex-col">
      <div
        ref={chartContainerRef}
        className="min-h-[320px] w-full min-w-[300px] shrink-0"
        style={{ height: chartHeight }}
      />
      {onRangeChange && (
        <div className="mt-6 flex shrink-0 flex-wrap justify-center gap-2">
          {ranges.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onRangeChange(r.value)}
              className={`min-h-[40px] min-w-[48px] rounded-lg px-4 py-2 text-sm font-medium transition touch-manipulation ${
                range === r.value
                  ? "bg-amber-500 text-white"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
