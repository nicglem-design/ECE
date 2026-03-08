import { Router, Request, Response } from "express";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";
import { config } from "../config";

const router = Router();

router.get("/status", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = db.prepare("SELECT status FROM kyc_status WHERE user_id = ?").get(user.sub) as { status: string } | undefined;
  res.json({ kycStatus: row?.status || "pending" });
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
