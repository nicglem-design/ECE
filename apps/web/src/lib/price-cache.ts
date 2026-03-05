/**
 * Short-lived in-memory cache for price data.
 * Reduces redundant API calls when multiple components request the same data within TTL.
 * Does not alter data - only returns cached result if still valid.
 */

const CACHE_TTL_MS = 5000; // 5 seconds - balances freshness with load reduction

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const pricesBatchCache = new Map<string, CacheEntry<Record<string, number>>>();
const top5Cache = new Map<string, CacheEntry<{ prices: Record<string, number>; priceChange24h: Record<string, number> }>>();

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() > entry.expires;
}

export function getCachedPricesBatch(
  chainIds: string[],
  fiatId: string
): Record<string, number> | null {
  const key = `${fiatId}:${[...new Set(chainIds)].sort().join(",")}`;
  const entry = pricesBatchCache.get(key);
  if (!entry || isExpired(entry)) return null;
  return entry.data;
}

export function setCachedPricesBatch(
  chainIds: string[],
  fiatId: string,
  data: Record<string, number>
): void {
  const key = `${fiatId}:${[...new Set(chainIds)].sort().join(",")}`;
  pricesBatchCache.set(key, {
    data,
    expires: Date.now() + CACHE_TTL_MS,
  });
}

export function getCachedTop5(fiatId: string): { prices: Record<string, number>; priceChange24h: Record<string, number> } | null {
  const key = fiatId.toLowerCase();
  const entry = top5Cache.get(key);
  if (!entry || isExpired(entry)) return null;
  return entry.data;
}

export function setCachedTop5(
  fiatId: string,
  data: { prices: Record<string, number>; priceChange24h: Record<string, number> }
): void {
  const key = fiatId.toLowerCase();
  top5Cache.set(key, {
    data,
    expires: Date.now() + CACHE_TTL_MS,
  });
}
