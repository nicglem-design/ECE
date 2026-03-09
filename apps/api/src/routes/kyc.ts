import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";
import { logger } from "../lib/logger";

const router = Router();

/** Webhook is handled by handleKycWebhook in main.ts (raw body for HMAC verification) */

router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = (await db.prepare("SELECT status FROM kyc_status WHERE user_id = ?").get(user.sub)) as { status: string } | undefined;
  const kycStatus = row?.status || "pending";
  const kycRequired = !!config.sumsubAppToken; // When KYC is configured, deposits/withdrawals require approval
  const userRow = (await db.prepare("SELECT email_verified FROM users WHERE id = ?").get(user.sub)) as { email_verified: number } | undefined;
  const emailVerified = userRow?.email_verified === 1;
  const emailRequired = !!config.resendApiKey; // When email is configured, deposits/withdrawals require verification
  res.json({ kycStatus, kycRequired, emailVerified, emailRequired });
});

router.post("/access-token", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string; email: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  if (!config.sumsubAppToken || !config.sumsubSecretKey) {
    res.status(503).json({ message: "KYC not configured. Set SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY." });
    return;
  }
  try {
    const crypto = await import("crypto");
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}POST/resources/accessTokens?userId=${user.sub}&levelName=basic-kyc`;
    const signature = crypto.createHmac("sha256", config.sumsubSecretKey).update(payload).digest("hex");
    const res2 = await fetch(
      `${config.sumsubBaseUrl}/resources/accessTokens?userId=${user.sub}&levelName=basic-kyc`,
      {
        method: "POST",
        headers: {
          "X-App-Token": config.sumsubAppToken,
          "X-App-Access-Sig": signature,
          "X-App-Access-Ts": String(timestamp),
          "Content-Type": "application/json",
        },
      }
    );
    const data = (await res2.json()) as { token?: string };
    res.json({ token: data.token });
  } catch (err) {
    logger.error({ err }, "Sumsub access token error");
    res.status(503).json({ message: "KYC service unavailable" });
  }
});

export default router;
