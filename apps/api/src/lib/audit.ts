/**
 * Audit logging for sensitive actions.
 * Used for compliance and incident response.
 */

import { db } from "../db";
import { v4 as uuidv4 } from "uuid";

export type AuditAction =
  | "login_success"
  | "login_fail"
  | "send_crypto"
  | "withdraw_fiat"
  | "2fa_enabled"
  | "2fa_disabled"
  | "password_reset";

export async function logAudit(
  userId: string | null,
  action: AuditAction,
  details: Record<string, unknown> = {},
  ip?: string
): Promise<void> {
  try {
    const id = uuidv4();
    const now = Date.now();
    const detailsJson = JSON.stringify(details);
    await db.prepare(
      "INSERT INTO audit_log (id, user_id, action, details, ip, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, userId ?? null, action, detailsJson, ip ?? null, now);
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}
