/**
 * Dashboard widget registry. IDs used for layout persistence.
 */

export const DEFAULT_DASHBOARD_LAYOUT = [
  "need-help",
  "balance",
  "swap",
  "receive",
  "top-crypto",
  "popular-crypto",
] as const;

export const ALL_WIDGET_IDS = [
  "need-help",
  "balance",
  "swap",
  "receive",
  "top-crypto",
  "popular-crypto",
] as const;

export type WidgetId = (typeof ALL_WIDGET_IDS)[number];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  "need-help": "Need help?",
  balance: "Balance",
  swap: "Swap",
  receive: "Receive crypto",
  "top-crypto": "Top crypto prices",
  "popular-crypto": "Popular crypto",
};
