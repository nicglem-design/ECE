/**
 * Email verification enforcement for fiat deposits and withdrawals.
 * When RESEND_API_KEY is set (production), requires verified email.
 * When not configured, allows (dev mode).
 */

import { db } from "../db";
import { config } from "../config";

export async function requireEmailVerified(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  if (!config.resendApiKey) return { ok: true }; // Email not configured, allow
  const row = (await db.prepare("SELECT email_verified FROM users WHERE id = ?").get(userId)) as
    | { email_verified: number }
    | undefined;
  const verified = row?.email_verified === 1;
  if (verified) return { ok: true };
  return {
    ok: false,
    message: "Verify your email to deposit or withdraw funds. Check your inbox for the verification link.",
    code: "EMAIL_VERIFICATION_REQUIRED",
  };
}
