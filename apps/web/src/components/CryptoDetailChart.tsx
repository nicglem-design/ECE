"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
} from "lightweight-charts";

export type ChartRange = "1" | "7" | "30" | "max";

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

type Props = {
  data: [number, number][];
  range: ChartRange;
  onRangeChange?: (r: ChartRange) => void;
  height?: number;
};

export function CryptoDetailChart({ data, range, onRangeChange, height = 400 }: Props) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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
        scaleMargins: { top: 0.1, bottom: 0.2 },
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

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const candles = priceToCandles(data);
    candlestickSeries.setData(candles);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

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
  }, [data, height]);

  const ranges: { value: ChartRange; label: string }[] = [
    { value: "1", label: "1D" },
    { value: "7", label: "1W" },
    { value: "30", label: "1M" },
    { value: "max", label: "All" },
  ];

  return (
    <div className="flex min-w-0 w-full flex-col">
      <div
        ref={chartContainerRef}
        className="min-h-[280px] w-full min-w-[300px]"
        style={{ height: typeof height === "number" ? height : 400 }}
      />
      {onRangeChange && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {ranges.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onRangeChange(r.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
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
