"use client";

import { SPARKLINE_WIDTH, SPARKLINE_HEIGHT } from "@/lib/chart-config";

export type ChartMode = "simple" | "complex";

/**
 * Price movement sparkline chart for cryptocurrencies.
 * Green when movement is positive, red when negative, gray when flat.
 * Uses shared dimensions for consistent detailed charts across the app.
 * chartMode: "simple" = line only, "complex" = line + area fill.
 */
export function PriceSparklineChart({
  prices,
  change24h,
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT,
  chartMode = "complex",
}: {
  prices: number[];
  change24h?: number | null;
  width?: number;
  height?: number;
  chartMode?: ChartMode;
}) {
  const trend =
    change24h != null
      ? change24h > 0
        ? "up"
        : change24h < 0
          ? "down"
          : "flat"
      : prices.length >= 2
        ? prices[prices.length - 1] > prices[0]
          ? "up"
          : prices[prices.length - 1] < prices[0]
            ? "down"
            : "flat"
        : "flat";

  const stroke = trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#94a3b8";

  if (prices.length < 2) {
    // Flat line - color by 24h movement when available
    return (
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width, height }}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <line
            x1="4"
            y1={height / 2}
            x2={width - 4}
            y2={height / 2}
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const rawRange = max - min;
  const minRange = ((min + max) / 2) * 0.002;
  const range = Math.max(rawRange, minRange) || 1;
  const pad = 6;
  const chartH = height - pad * 2;
  const chartW = width - pad * 2;
  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1 || 1)) * chartW;
    const y = height - pad - ((p - min) / range) * chartH;
    return { x, y };
  });
  const linePath =
    points.length < 2
      ? ""
      : points
          .map((pt, i) => (i === 0 ? `M ${pt.x},${pt.y}` : `L ${pt.x},${pt.y}`))
          .join(" ");
  const lastPt = points[points.length - 1];
  const fillPath =
    linePath && lastPt
      ? `${linePath} L ${pad + chartW},${height - pad} L ${pad},${height - pad} Z`
      : "";
  const fillOpacity = trend === "up" ? 0.2 : trend === "down" ? 0.25 : 0.15;

  return (
    <svg
      width={width}
      height={height}
      className="shrink-0"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Price movement chart"
    >
      <title>Last 24 hours{change24h != null ? `: ${change24h > 0 ? "+" : ""}${change24h.toFixed(2)}%` : ""}</title>
      {chartMode === "complex" && <path d={fillPath} fill={stroke} fillOpacity={fillOpacity} />}
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={width >= SPARKLINE_WIDTH ? 2.5 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
