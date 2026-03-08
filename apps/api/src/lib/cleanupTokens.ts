/**
 * Clean up expired auth tokens (refresh, email_verify, password_reset).
 * Run on startup and optionally via cron.
 */

import { db } from "../db";

export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const now = Date.now();
    const result = await db.prepare(
      "DELETE FROM auth_tokens WHERE expires_at < ?"
    ).run(now);
    return result.changes ?? 0;
  } catch (err) {
    console.error("Cleanup expired tokens error:", err);
    return 0;
  }
}
