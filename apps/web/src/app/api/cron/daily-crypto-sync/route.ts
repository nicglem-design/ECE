import { NextRequest, NextResponse } from "next/server";

/**
 * Daily cron job - warms the crypto consensus cache by fetching from all sources.
 * Called by Vercel Cron at midnight UTC daily. Also ensures data stays fresh.
 * Set CRON_SECRET in env to protect this endpoint.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const [usd, eur] = await Promise.all([
      fetch(`${base}/api/crypto/consensus?currency=usd`, { cache: "no-store" }),
      fetch(`${base}/api/crypto/consensus?currency=eur`, { cache: "no-store" }),
    ]);
    const usdOk = usd.ok;
    const eurOk = eur.ok;
    return NextResponse.json({
      success: true,
      usd: usdOk,
      eur: eurOk,
      message: "Daily crypto sync completed",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
