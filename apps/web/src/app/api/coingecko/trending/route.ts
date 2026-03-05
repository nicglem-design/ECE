/**
 * CoinGecko trending coins - top 5 most popular (by search activity).
 * Fetches trending, then full market data for those 5 coins.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCached, getStaleCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();
  const params = `trending:${currency}`;

  const cached = getCached<unknown>("trending", params);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "HIT" },
    });
  }

  try {
    const trendingRes = await fetchExternal(`${COINGECKO_BASE}/search/trending`);
    if (!trendingRes.ok) {
      const stale = getStaleCached<unknown>("trending", params);
      if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
      return NextResponse.json({ error: "Trending request failed" }, { status: trendingRes.status });
    }
    const trendingData = (await trendingRes.json()) as {
      coins?: Array<{
        item?: {
          id?: string;
          symbol?: string;
          name?: string;
          data?: {
            price?: number;
            price_change_percentage_24h?: { usd?: number; [k: string]: number | undefined };
          };
        };
      }>;
    };
    const items = (trendingData.coins ?? []).slice(0, 5);
    const ids = items.map((c) => c.item?.id).filter(Boolean) as string[];
    if (ids.length === 0) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" },
      });
    }

    const marketsUrl = `${COINGECKO_BASE}/coins/markets?vs_currency=${currency}&ids=${ids.join(",")}&order=market_cap_desc&per_page=5&sparkline=true&price_change_percentage=24h`;
    const marketsRes = await fetchExternal(marketsUrl);
    if (marketsRes.ok) {
      const markets = (await marketsRes.json()) as Array<{
        id: string;
        symbol: string;
        name: string;
        current_price: number | null;
        price_change_percentage_24h_in_currency?: number | null;
        sparkline_in_7d?: { price?: number[] };
      }>;
      const byId = new Map(markets.map((m) => [m.id, m]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean);
      const data = ordered.length > 0 ? ordered : markets;
      setCached("trending", params, data);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" },
      });
    }

    // Markets API failed (e.g. rate limit) - use raw trending data so we still show popular coins
    const data = items
      .filter((c) => c.item?.id)
      .map((c) => {
        const item = c.item!;
        const price = item.data?.price ?? 0;
        const change24h = item.data?.price_change_percentage_24h?.usd ?? null;
        return {
          id: item.id,
          symbol: (item.symbol ?? "").toLowerCase(),
          name: item.name ?? "",
          current_price: price,
          price_change_percentage_24h_in_currency: change24h,
          price_change_percentage_24h: change24h,
          sparkline_in_7d: undefined,
        };
      });

    setCached("trending", params, data);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" },
    });
  } catch (err) {
    const stale = getStaleCached<unknown>("trending", params);
    if (stale) return NextResponse.json(stale, { headers: { "X-Cache": "STALE" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch" },
      { status: 500 }
    );
  }
}
