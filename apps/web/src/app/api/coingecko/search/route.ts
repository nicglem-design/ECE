/**
 * CoinGecko search - find coins by name or symbol.
 * Used by KanoExchange search bar.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/fetch-external";
import { getCached, setCached } from "@/lib/coingecko-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").trim().toLowerCase();
  if (query.length < 2) {
    return NextResponse.json({ coins: [] });
  }

  const params = `search:${query}`;
  const cached = getCached<unknown>("search", params);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=60", "X-Cache": "HIT" },
    });
  }

  try {
    const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`;
    const res = await fetchExternal(url);
    if (!res.ok) {
      return NextResponse.json({ coins: [] }, { status: res.status });
    }
    const data = (await res.json()) as {
      coins?: Array<{ id?: string; name?: string; symbol?: string; market_cap_rank?: number; thumb?: string; large?: string; item?: { id?: string; name?: string; symbol?: string; market_cap_rank?: number; thumb?: string; large?: string } }>;
    };
    const raw = (data.coins ?? []).slice(0, 10);
    const coins = raw.map((c) => {
      const item = c.item ?? c;
      return {
        id: item.id ?? c.id ?? "",
        name: item.name ?? c.name ?? "",
        symbol: item.symbol ?? c.symbol ?? "",
        market_cap_rank: c.market_cap_rank ?? item.market_cap_rank,
        thumb: item.thumb ?? item.large ?? c.thumb ?? c.large,
      };
    }).filter((x) => x.id);
    setCached("search", params, { coins });
    return NextResponse.json(
      { coins },
      { headers: { "Cache-Control": "public, max-age=60", Pragma: "no-cache" } }
    );
  } catch {
    return NextResponse.json({ coins: [] }, { status: 500 });
  }
}
