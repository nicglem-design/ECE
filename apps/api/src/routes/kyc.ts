import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";

const router = Router();

/** Sumsub webhook: applicantReviewed. Updates KYC status when verification completes. */
router.post("/webhook", async (req: Request, res: Response) => {
  res.status(200).send("OK"); // Ack immediately
  const body = req.body as {
    applicantId?: string;
    externalUserId?: string;
    reviewResult?: { reviewAnswer?: string };
    type?: string;
  };
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
    console.error("KYC webhook error:", err);
  }
});

router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = (await db.prepare("SELECT status FROM kyc_status WHERE user_id = ?").get(user.sub)) as { status: string } | undefined;
  const kycStatus = row?.status || "pending";
  const kycRequired = !!config.sumsubAppToken; // When KYC is configured, deposits/withdrawals require approval
  res.json({ kycStatus, kycRequired });
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
    console.error("Sumsub access token error:", err);
    res.status(503).json({ message: "KYC service unavailable" });
  }
});

export default router;
