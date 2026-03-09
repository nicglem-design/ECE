/**
 * Clean up expired auth tokens (refresh, email_verify, password_reset).
 * Run on startup and optionally via cron.
 */

import { db } from "../db";
import { logger } from "./logger";

export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const now = Date.now();
    const [authResult, revokedResult] = await Promise.all([
      db.prepare("DELETE FROM auth_tokens WHERE expires_at < ?").run(now),
      db.prepare("DELETE FROM revoked_jwt WHERE expires_at < ?").run(now),
    ]);
    return (authResult.changes ?? 0) + (revokedResult.changes ?? 0);
  } catch (err) {
    logger.error({ err }, "Cleanup expired tokens error");
    return 0;
  }
}
