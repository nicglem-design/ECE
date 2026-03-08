/**
 * KYC enforcement for fiat deposits and withdrawals.
 * When Sumsub is configured, requires "approved" status.
 * When not configured, allows (stub mode).
 */

import { db } from "../db";
import { config } from "../config";

export async function requireKycApproved(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  if (!config.sumsubAppToken) return { ok: true }; // KYC not configured, allow
  const row = (await db.prepare("SELECT status FROM kyc_status WHERE user_id = ?").get(userId)) as
    | { status: string }
    | undefined;
  const status = row?.status || "pending";
  if (status === "approved") return { ok: true };
  return {
    ok: false,
    message: "Complete identity verification to deposit or withdraw funds. Go to Profile → Verify identity.",
    code: "KYC_REQUIRED",
  };
}
