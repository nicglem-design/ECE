import { NextRequest, NextResponse } from "next/server";
import { cancelOrder } from "@/lib/orderbook/engine";

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

/** DELETE: Cancel an open order. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const authHeader = _request.headers.get("authorization");
    const userId = await getUserIdFromAuth(authHeader);
    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const ok = cancelOrder(orderId, userId);
    if (!ok) {
      return NextResponse.json(
        { error: "Order not found or cannot be cancelled" },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cancel failed" },
      { status: 500 }
    );
  }
}
