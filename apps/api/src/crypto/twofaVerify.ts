/**
 * 2FA verification for sensitive operations (send, withdraw).
 * Accepts TOTP code or one-time backup code.
 */

import crypto from "crypto";
import { db } from "../db";
import { verifySync } from "otplib";

function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

export async function require2FAIfEnabled(userId: string, totpCode?: string): Promise<{ ok: boolean; error?: string }> {
  const row = (await db.prepare(
    "SELECT totp_secret, enabled FROM user_2fa WHERE user_id = ?"
  ).get(userId)) as { totp_secret: string; enabled: number } | undefined;
  if (!row || !row.enabled) return { ok: true };
  if (!totpCode || typeof totpCode !== "string") {
    return { ok: false, error: "2FA code required" };
  }
  const trimmed = totpCode.trim();
  const totpResult = verifySync({ token: trimmed, secret: row.totp_secret });
  if (totpResult.valid) return { ok: true };

  const codeHash = hashBackupCode(trimmed);
  const backupRow = (await db.prepare(
    "SELECT code_hash FROM user_2fa_backup_codes WHERE user_id = ? AND code_hash = ?"
  ).get(userId, codeHash)) as { code_hash: string } | undefined;
  if (backupRow) {
    await db.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id = ? AND code_hash = ?").run(userId, codeHash);
    return { ok: true };
  }
  return { ok: false, error: "Invalid 2FA code" };
}
