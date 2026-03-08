/**
 * Simple in-memory metrics for monitoring.
 * GET /metrics returns counts (suitable for Prometheus or custom dashboards).
 */

const counters: Record<string, number> = {};

export function increment(name: string, value = 1): void {
  counters[name] = (counters[name] ?? 0) + value;
}

export function getMetrics(): Record<string, number> {
  return { ...counters };
}

export function getMetricsText(): string {
  const lines = Object.entries(counters).map(([k, v]) => `# HELP ${k} Counter\n# TYPE ${k} counter\n${k} ${v}`);
  return lines.join("\n") || "# No metrics yet\n";
}
