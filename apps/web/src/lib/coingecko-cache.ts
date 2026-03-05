/**
 * Server-side cache for CoinGecko API responses.
 * Reduces 429 rate limits by caching successful responses and serving stale data when rate-limited.
 */

const TTL_MS = 60_000; // 1 minute - balance freshness vs rate limits
const STALE_TTL_MS = 300_000; // 5 min - serve stale on 429 if within this window

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function key(route: string, params: string): string {
  return `${route}:${params}`;
}

export function getCached<T>(route: string, params: string): T | null {
  const entry = cache.get(key(route, params)) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) return null;
  return entry.data;
}

/** Get cached data with custom TTL (ms) - for routes that need longer/shorter cache */
export function getCachedWithTTL<T>(
  route: string,
  params: string,
  ttlMs: number
): T | null {
  const entry = cache.get(key(route, params)) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttlMs) return null;
  return entry.data;
}

/** Get stale cache (for 429 fallback) - returns data even if expired, within STALE_TTL */
export function getStaleCached<T>(route: string, params: string): T | null {
  const entry = cache.get(key(route, params)) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > STALE_TTL_MS) return null;
  return entry.data;
}

export function setCached<T>(route: string, params: string, data: T): void {
  cache.set(key(route, params), {
    data,
    fetchedAt: Date.now(),
  });
}
