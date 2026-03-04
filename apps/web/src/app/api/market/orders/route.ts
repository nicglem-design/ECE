import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/orderbook/engine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, pair, side, price, amount } = body;
    if (!userId || !pair || !side || !price || !amount) {
      return NextResponse.json(
        { error: "userId, pair, side, price, amount required" },
        { status: 400 }
      );
    }
    if (side !== "buy" && side !== "sell") {
      return NextResponse.json({ error: "side must be buy or sell" }, { status: 400 });
    }
    const normalizedPair = String(pair).toUpperCase().replace(/-/g, "");
    const numPrice = parseFloat(String(price));
    const numAmount = parseFloat(String(amount));
    if (isNaN(numPrice) || numPrice <= 0 || isNaN(numAmount) || numAmount <= 0) {
      return NextResponse.json({ error: "price and amount must be positive numbers" }, { status: 400 });
    }

    const { order, trades } = placeOrder(
      String(userId),
      normalizedPair,
      side,
      numPrice,
      numAmount
    );

    return NextResponse.json({ order, trades });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Place order failed" },
      { status: 500 }
    );
  }
}
