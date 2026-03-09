"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
import { fetchMarketChartForDetail, generateFallbackChartData, getPriceAndChangeForCoin } from "@/lib/coingecko";
import { useCurrency } from "@/contexts/CurrencyContext";
import { TokenLogo } from "@/components/TokenLogo";

export type ChartRange = "1" | "7" | "30" | "90" | "150" | "365";
export type DrawTool = "trend" | "horizontal" | "rectangle" | "none";

/** Shapes stored in price/time coordinates so they persist correctly when range changes */
type DrawShape =
  | { type: "trend"; time1: number; price1: number; time2: number; price2: number; color: string }
  | { type: "horizontal"; price: number; color: string }
  | { type: "rectangle"; time1: number; price1: number; time2: number; price2: number; color: string };

function toLineData(points: [number, number][]): { time: UTCTimestamp; value: number }[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  return sorted.map(([ts, val]) => ({ time: Math.floor(ts / 1000) as UTCTimestamp, value: val }));
}

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
    const time = Math.floor(ts / 1000) as UTCTimestamp;
    candles.push({ time, open, high, low, close });
  }
  return candles;
}

const RANGES: { value: ChartRange; label: string; days: number }[] = [
  { value: "1", label: "1D", days: 1 },
  { value: "7", label: "1W", days: 7 },
  { value: "30", label: "1M", days: 30 },
  { value: "90", label: "3M", days: 90 },
  { value: "150", label: "5M", days: 150 },
  { value: "365", label: "1Y", days: 365 },
];

const DRAW_COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6"];

interface ChartAnalysisFullScreenProps {
  coinId: string;
  symbol: string;
  name: string;
  onClose: () => void;
}

export function ChartAnalysisFullScreen({ coinId, symbol, name, onClose }: ChartAnalysisFullScreenProps) {
  const { currency } = useCurrency();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Area"> | null>(null);

  const [chartData, setChartData] = useState<[number, number][]>([]);
  const [chartCandles, setChartCandles] = useState<CandlestickData[] | null>(null);
  const [range, setRange] = useState<ChartRange>("7");
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<"simple" | "complex">("complex");
  const [drawTool, setDrawTool] = useState<DrawTool>("none");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [shapes, setShapes] = useState<DrawShape[]>([]);
  /** In-progress drawing in pixels for live preview */
  const [drawingPx, setDrawingPx] = useState<{
    type: "trend" | "horizontal" | "rectangle";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
  } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const fetchChart = useCallback(
    async (r: ChartRange) => {
      if (!coinId) return;
      setLoading(true);
      const days = parseInt(r, 10);
      const { prices, candles } = await fetchMarketChartForDetail(coinId, currency || "usd", days);
      if (prices.length > 0) {
        setChartData(prices);
        const c = candles && candles.length > 0 ? candles : null;
        setChartCandles(c ? c.map((x) => ({ ...x, time: x.time as UTCTimestamp })) : priceToCandles(prices));
      } else {
        const { price, priceChange24h } = await getPriceAndChangeForCoin(coinId, currency || "usd");
        const fallback = generateFallbackChartData(price, days, priceChange24h);
        setChartData(fallback);
        setChartCandles(priceToCandles(fallback));
      }
      setLoading(false);
    },
    [coinId, currency]
  );

  useEffect(() => {
    fetchChart(range);
  }, [range, fetchChart]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || chartData.length === 0) return;
    const w = container.clientWidth || 800;
    const h = Math.min(window.innerHeight - 180, 520);
    const chart = createChart(container, {
      width: w,
      height: h,
      layout: {
        background: { type: ColorType.Solid, color: "#0f172a" },
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
      const lineData = toLineData(chartData);
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
      candlestickSeries.setData((chartCandles ?? priceToCandles(chartData)) as CandlestickData[]);
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
  }, [chartData, chartCandles, chartMode]);

  const redrawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const container = chartContainerRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !container || !chart || !series) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const timeScale = chart.timeScale();

    const toPixel = (time: number, price: number): { x: number; y: number } | null => {
      const x = timeScale.timeToCoordinate(time as UTCTimestamp);
      const y = series.priceToCoordinate(price);
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    };

    for (const s of shapes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      if (s.type === "trend") {
        const p1 = toPixel(s.time1, s.price1);
        const p2 = toPixel(s.time2, s.price2);
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } else if (s.type === "horizontal") {
        const y = series.priceToCoordinate(s.price);
        if (y != null && Number.isFinite(y)) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(rect.width, y);
          ctx.setLineDash([4, 4]);
          ctx.stroke();
        }
      } else if (s.type === "rectangle") {
        const p1 = toPixel(s.time1, s.price1);
        const p2 = toPixel(s.time2, s.price2);
        if (p1 && p2) {
          const x = Math.min(p1.x, p2.x);
          const y = Math.min(p1.y, p2.y);
          const w = Math.abs(p2.x - p1.x);
          const h = Math.abs(p2.y - p1.y);
          ctx.strokeRect(x, y, w, h);
        }
      }
    }

    if (drawingPx) {
      ctx.strokeStyle = drawingPx.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      if (drawingPx.type === "trend" || drawingPx.type === "rectangle") {
        const x = Math.min(drawingPx.x1, drawingPx.x2);
        const y = Math.min(drawingPx.y1, drawingPx.y2);
        const w = Math.abs(drawingPx.x2 - drawingPx.x1);
        const h = Math.abs(drawingPx.y2 - drawingPx.y1);
        if (drawingPx.type === "trend") {
          ctx.beginPath();
          ctx.moveTo(drawingPx.x1, drawingPx.y1);
          ctx.lineTo(drawingPx.x2, drawingPx.y2);
          ctx.stroke();
        } else {
          ctx.strokeRect(x, y, w, h);
        }
      } else {
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(drawingPx.x1, drawingPx.y1);
        ctx.lineTo(drawingPx.x2, drawingPx.y2);
        ctx.stroke();
      }
    }
  }, [shapes, drawingPx]);

  useEffect(() => {
    redrawOverlay();
  }, [redrawOverlay, shapes, drawingPx]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || loading || chartData.length === 0) return;
    const ro = new ResizeObserver(() => redrawOverlay());
    ro.observe(container);
    return () => ro.disconnect();
  }, [loading, chartData.length, redrawOverlay]);

  const getCoord = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = chartContainerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return { x, y };
    },
    []
  );

  const pixelToTimePrice = useCallback((x: number, y: number): { time: number; price: number } | null => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return null;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    if (time == null || price == null || !Number.isFinite(price)) return null;
    return { time: typeof time === "number" ? time : 0, price };
  }, []);

  const handleOverlayMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (drawTool === "none") return;
      const coord = getCoord(e.clientX, e.clientY);
      if (!coord) return;
      drawStartRef.current = { x: coord.x, y: coord.y };
      const rect = chartContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x1 = coord.x;
      const y1 = coord.y;
      if (drawTool === "horizontal") {
        setDrawingPx({
          type: "horizontal",
          x1: 0,
          y1: y1,
          x2: rect.width,
          y2: y1,
          color: drawColor,
        });
      } else if (drawTool === "trend" || drawTool === "rectangle") {
        setDrawingPx({
          type: drawTool,
          x1,
          y1,
          x2: x1,
          y2: y1,
          color: drawColor,
        });
      }
    },
    [drawTool, drawColor, getCoord]
  );

  const handleOverlayMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawStartRef.current || !drawingPx) return;
      const coord = getCoord(e.clientX, e.clientY);
      if (!coord) return;
      if (drawingPx.type === "trend" || drawingPx.type === "rectangle") {
        setDrawingPx((d) => (d ? { ...d, x2: coord.x, y2: coord.y } : d));
      }
    },
    [drawingPx, getCoord]
  );

  const finalizeDrawing = useCallback(() => {
    if (!drawingPx || !drawStartRef.current) return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) {
      setDrawingPx(null);
      drawStartRef.current = null;
      return;
    }
    if (drawingPx.type === "horizontal") {
      const tp = pixelToTimePrice(drawingPx.x1, drawingPx.y1);
      if (tp) setShapes((prev) => [...prev, { type: "horizontal", price: tp.price, color: drawingPx.color }]);
    } else if (
      (drawingPx.type === "trend" || drawingPx.type === "rectangle") &&
      (Math.abs(drawingPx.x2 - drawingPx.x1) > 5 || Math.abs(drawingPx.y2 - drawingPx.y1) > 5)
    ) {
      const tp1 = pixelToTimePrice(drawingPx.x1, drawingPx.y1);
      const tp2 = pixelToTimePrice(drawingPx.x2, drawingPx.y2);
      if (tp1 && tp2) {
        const newShape: DrawShape =
          drawingPx.type === "trend"
            ? { type: "trend", time1: tp1.time, price1: tp1.price, time2: tp2.time, price2: tp2.price, color: drawingPx.color }
            : { type: "rectangle", time1: tp1.time, price1: tp1.price, time2: tp2.time, price2: tp2.price, color: drawingPx.color };
        setShapes((prev) => [...prev, newShape]);
      }
    }
    setDrawingPx(null);
    drawStartRef.current = null;
  }, [drawingPx, pixelToTimePrice]);

  const handleOverlayMouseUp = useCallback(() => {
    finalizeDrawing();
  }, [finalizeDrawing]);

  const handleOverlayMouseLeave = useCallback(() => {
    finalizeDrawing();
  }, [finalizeDrawing]);

  const clearDrawings = useCallback(() => {
    setShapes([]);
    setDrawingPx(null);
    drawStartRef.current = null;
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-900">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700 px-6 py-4">
        <div className="flex items-center gap-4">
          <TokenLogo chainId={coinId} size={32} />
          <div>
            <h1 className="text-xl font-bold text-slate-200">
              {symbol} – {name}
            </h1>
            <p className="text-sm text-slate-500">Chart analysis</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-600"
        >
          Close
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  range === r.value ? "bg-amber-500 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChartMode(chartMode === "simple" ? "complex" : "simple")}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-600"
            >
              {chartMode === "simple" ? "Candles" : "Line"}
            </button>
          </div>
          <div className="h-px w-px bg-slate-600" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">Drawing:</span>
            {(["none", "trend", "horizontal", "rectangle"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDrawTool(t)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  drawTool === t ? "bg-amber-500/30 text-amber-400" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                }`}
              >
                {t === "none" ? "Off" : t === "trend" ? "Trend" : t === "horizontal" ? "H-line" : "Rect"}
              </button>
            ))}
            {DRAW_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDrawColor(c)}
                className={`h-6 w-6 rounded-full border-2 ${
                  drawColor === c ? "border-white" : "border-slate-600"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <button
              type="button"
              onClick={clearDrawings}
              className="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-red-500/20 hover:text-red-400"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-[400px] rounded-xl border border-slate-700 bg-slate-900/50">
          {loading ? (
            <div className="flex h-[400px] items-center justify-center text-slate-500">Loading chart…</div>
          ) : (
            <>
              <div
                ref={chartContainerRef}
                className="h-full min-h-[400px] w-full"
                style={{ height: Math.min(window.innerHeight - 220, 520) }}
              />
              <canvas
                ref={overlayRef}
                className="absolute inset-0 cursor-crosshair"
                style={{ pointerEvents: drawTool !== "none" ? "auto" : "none" }}
                onMouseDown={handleOverlayMouseDown}
                onMouseMove={handleOverlayMouseMove}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={handleOverlayMouseLeave}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
