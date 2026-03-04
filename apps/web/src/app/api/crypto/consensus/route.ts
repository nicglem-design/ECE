import { NextRequest, NextResponse } from "next/server";
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

  const result = await getConsensusPrices(currency);

  return NextResponse.json(
    {
      prices: result.prices,
      priceChange24h: result.priceChange24h,
      sourcesUsed: result.sourcesUsed,
      totalSources: result.totalSources,
    },
    { headers: CACHE_HEADERS }
  );
}
