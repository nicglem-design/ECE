/**
 * 2FA verification for sensitive operations (send, withdraw).
 */

import { db } from "../db";
import { verifySync } from "otplib";

export async function require2FAIfEnabled(userId: string, totpCode?: string): Promise<{ ok: boolean; error?: string }> {
  const row = (await db.prepare(
    "SELECT totp_secret, enabled FROM user_2fa WHERE user_id = ?"
  ).get(userId)) as { totp_secret: string; enabled: number } | undefined;
  if (!row || !row.enabled) return { ok: true };
  if (!totpCode || typeof totpCode !== "string") {
    return { ok: false, error: "2FA code required for send" };
  }
  const result = verifySync({ token: totpCode.trim(), secret: row.totp_secret });
  if (!result.valid) return { ok: false, error: "Invalid 2FA code" };
  return { ok: true };
}
