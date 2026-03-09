import { NextRequest, NextResponse } from "next/server";

/**
 * Daily cron job - warms the crypto consensus cache and syncs deposits for all users.
 * Called by Vercel Cron at midnight UTC daily.
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
  const apiBase = process.env.API_BACKEND_URL || "http://localhost:4000";

  const cronHeaders: Record<string, string> = {
    ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
    ...(process.env.API_INTERNAL_KEY
      ? { "X-Internal-Key": process.env.API_INTERNAL_KEY }
      : {}),
  };

  try {
    const [usd, eur, depositSync, mmSeed, tokenCleanup] = await Promise.all([
      fetch(`${base}/api/crypto/consensus?currency=usd`, { cache: "no-store" }),
      fetch(`${base}/api/crypto/consensus?currency=eur`, { cache: "no-store" }),
      fetch(`${apiBase}/api/v1/cron/sync-deposits`, {
        method: "POST",
        headers: cronHeaders,
      }),
      fetch(`${apiBase}/api/v1/cron/seed-market-maker`, {
        method: "POST",
        headers: cronHeaders,
      }),
      fetch(`${apiBase}/api/v1/cron/cleanup-expired-tokens`, {
        method: "POST",
        headers: cronHeaders,
      }),
    ]);
    const usdOk = usd.ok;
    const eurOk = eur.ok;
    const depositSyncData = depositSync.ok
      ? ((await depositSync.json()) as { newDeposits?: number; usersProcessed?: number })
      : null;
    const mmSeedData = mmSeed.ok
      ? ((await mmSeed.json()) as { ordersPlaced?: number; pairs?: number })
      : null;
    const tokenCleanupData = tokenCleanup.ok
      ? ((await tokenCleanup.json()) as { deleted?: number })
      : null;
    return NextResponse.json({
      success: true,
      usd: usdOk,
      eur: eurOk,
      depositSync: depositSyncData ?? { error: "API not reachable" },
      marketMakerSeed: mmSeedData ?? { error: "API not reachable" },
      tokenCleanup: tokenCleanupData ?? { error: "API not reachable" },
      message: "Daily crypto sync completed",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
