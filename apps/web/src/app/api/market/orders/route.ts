import { NextRequest, NextResponse } from "next/server";
import { placeOrder } from "@/lib/orderbook/engine";

export const dynamic = "force-dynamic";

const API_BACKEND = process.env.API_BACKEND_URL || "http://localhost:4000";

async function getUserIdFromAuth(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${API_BACKEND}/api/v1/profile`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId: bodyUserId, pair, side, price, amount } = body;
    const authHeader = request.headers.get("authorization");

    let userId = await getUserIdFromAuth(authHeader);
    if (!userId) userId = bodyUserId;

    if (!userId || !pair || !side || !price || !amount) {
      return NextResponse.json(
        { error: "Authentication required. Sign in to place limit orders." },
        { status: 401 }
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
