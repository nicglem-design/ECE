/**
 * Sumsub KYC webhook handler. Must receive raw body for HMAC signature verification.
 * Mount with express.raw({ type: "application/json" }) before express.json().
 */

import { Request, Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { config } from "../config";
import { logger } from "../lib/logger";

function verifySumsubSignature(rawBody: Buffer, digestHeader: string | undefined, algHeader: string | undefined): boolean {
  if (!config.sumsubWebhookSecret) return false;
  if (!digestHeader || !algHeader) return false;
  const algoMap: Record<string, string> = {
    HMAC_SHA1_HEX: "sha1",
    HMAC_SHA256_HEX: "sha256",
    HMAC_SHA512_HEX: "sha512",
  };
  const algo = algoMap[algHeader] || "sha256";
  const calculated = crypto.createHmac(algo, config.sumsubWebhookSecret).update(rawBody).digest("hex");
  return calculated === digestHeader;
}

export async function handleKycWebhook(req: Request, res: Response): Promise<void> {
  res.status(200).send("OK");
  const rawBody = (req as Request & { body?: Buffer }).body as Buffer | undefined;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    logger.error("KYC webhook: no raw body");
    return;
  }
  const digestHeader = req.headers["x-payload-digest"] as string | undefined;
  const algHeader = req.headers["x-payload-digest-alg"] as string | undefined;

  if (config.sumsubWebhookSecret) {
    if (!verifySumsubSignature(rawBody, digestHeader, algHeader)) {
      logger.error("KYC webhook: invalid signature");
      return;
    }
  } else if (config.sumsubAppToken) {
    logger.warn("KYC webhook: SUMSUB_WEBHOOK_SECRET not set - signature verification skipped");
  }

  let body: { applicantId?: string; externalUserId?: string; reviewResult?: { reviewAnswer?: string }; type?: string };
  try {
    body = JSON.parse(rawBody.toString("utf8"));
  } catch {
    logger.error("KYC webhook: invalid JSON");
    return;
  }

  const type = body.type;
  if (type !== "applicantReviewed") return;
  const userId = body.externalUserId || body.applicantId;
  if (!userId) return;
  const answer = body.reviewResult?.reviewAnswer;
  const status = answer === "GREEN" ? "approved" : answer === "RED" ? "rejected" : null;
  if (!status) return;

  try {
    const now = Date.now();
    await db.prepare(
      "UPDATE kyc_status SET status = ?, updated_at = ? WHERE user_id = ?"
    ).run(status, now, userId);
  } catch (err) {
    logger.error({ err }, "KYC webhook error");
  }
}
