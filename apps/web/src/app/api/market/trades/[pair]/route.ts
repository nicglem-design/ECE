import { NextRequest, NextResponse } from "next/server";
import { getTrades } from "@/lib/orderbook/engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ pair: string }> }
) {
  const { pair } = await params;
  const normalized = (pair || "").toUpperCase().replace(/-/g, "");
  if (!normalized) {
    return NextResponse.json({ error: "Pair required" }, { status: 400 });
  }
  const trades = getTrades(normalized, 50);
  return NextResponse.json({ trades });
}
