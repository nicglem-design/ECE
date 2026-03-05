/**
 * Robust fetch for external APIs - retries, timeout, User-Agent.
 * Some APIs block requests without proper headers.
 */

const DEFAULT_HEADERS: Record<string, string> = {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; KanoX/1.0; +https://kanox.io)",
};

export async function fetchExternal(
  url: string,
  options: RequestInit & { retries?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const { retries = 2, timeoutMs = 10000, ...fetchOptions } = options;
  const headers = { ...DEFAULT_HEADERS, ...(fetchOptions.headers as Record<string, string>) };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      if (res.ok || attempt === retries) return res;
      if (res.status === 429 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error("fetch failed");
}
