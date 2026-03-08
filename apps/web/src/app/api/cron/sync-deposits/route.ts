import { NextRequest, NextResponse } from "next/server";

/**
 * Deposit sync cron – runs every 15 min (Vercel Pro) or as configured.
 * Syncs blockchain deposits for all users. Call with CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiBase = process.env.API_BACKEND_URL || "http://localhost:4000";
  const cronHeaders: Record<string, string> = {
    ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
    ...(process.env.API_INTERNAL_KEY ? { "X-Internal-Key": process.env.API_INTERNAL_KEY! } : {}),
  };

  try {
    const res = await fetch(`${apiBase}/api/v1/cron/sync-deposits`, {
      method: "POST",
      headers: cronHeaders,
    });
    const data = (await res.json().catch(() => ({}))) as { newDeposits?: number; usersProcessed?: number; error?: string };
    if (!res.ok) {
      return NextResponse.json({ error: data.error || "Sync failed" }, { status: res.status });
    }
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
