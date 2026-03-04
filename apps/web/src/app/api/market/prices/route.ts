/**
 * Unified price API: uses our order book when we have trades/depth,
 * otherwise falls back to external consensus.
 * No frontend change needed - just point price fetchers here when ready.
 */

import { NextRequest, NextResponse } from "next/server";
import { getOurPrices } from "@/lib/orderbook/engine";
import { getConsensusPrices } from "@/lib/crypto-consensus";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const currency = (searchParams.get("currency") || "usd").toLowerCase();

  const ourPrices = getOurPrices(currency);

  if (ourPrices && Object.keys(ourPrices.prices).length > 1) {
    return NextResponse.json(
      {
        prices: ourPrices.prices,
        priceChange24h: ourPrices.priceChange24h,
        source: "orderbook",
        sourcesUsed: {},
        totalSources: 1,
      },
      { headers: CACHE_HEADERS }
    );
  }

  const result = await getConsensusPrices(currency);
  return NextResponse.json(
    {
      prices: result.prices,
      priceChange24h: result.priceChange24h,
      source: "consensus",
      sourcesUsed: result.sourcesUsed,
      totalSources: result.totalSources,
    },
    { headers: CACHE_HEADERS }
  );
}
