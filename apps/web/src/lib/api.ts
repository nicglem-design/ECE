/**
 * API base URL - empty in browser (same-origin), set for standalone API
 */
export const API_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) || "";
