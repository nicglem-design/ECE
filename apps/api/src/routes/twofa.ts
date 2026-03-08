/**
 * 2FA (TOTP) for send/withdraw.
 */

import { Router, Request, Response } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import { toDataURL } from "qrcode";
import { db } from "../db";
import { authMiddleware } from "../middleware/auth";

const router = Router();

/** GET /status - Check if user has 2FA enabled */
router.get("/status", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = db.prepare(
    "SELECT enabled FROM user_2fa WHERE user_id = ?"
  ).get(user.sub) as { enabled: number } | undefined;
  res.json({ enabled: !!(row?.enabled) });
});

/** POST /setup - Generate secret and return QR URL (does not enable yet) */
router.post("/setup", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const emailRow = db.prepare(
    "SELECT email FROM users WHERE id = ?"
  ).get(user.sub) as { email: string } | undefined;
  const userEmail = emailRow?.email ?? user.sub;
  const issuer = "ECE";
  const secret = generateSecret();
  const otpauth = generateURI({ issuer, label: userEmail, secret });
  const qrDataUrl = await toDataURL(otpauth);

  const now = Date.now();
  db.prepare(
    "INSERT OR REPLACE INTO user_2fa (user_id, totp_secret, enabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?)"
  ).run(user.sub, secret, now, now);

  res.json({ secret, qrDataUrl, otpauth });
});

/** POST /verify - Verify code and enable 2FA */
router.post("/verify", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { code } = req.body;
  if (!code || typeof code !== "string") {
    res.status(400).json({ message: "Code required" });
    return;
  }
  const row = db.prepare(
    "SELECT totp_secret FROM user_2fa WHERE user_id = ?"
  ).get(user.sub) as { totp_secret: string } | undefined;
  if (!row) {
    res.status(400).json({ message: "Run setup first" });
    return;
  }
  const result = verifySync({ token: code.trim(), secret: row.totp_secret });
  if (!result.valid) {
    res.status(400).json({ message: "Invalid code" });
    return;
  }
  const now = Date.now();
  db.prepare(
    "UPDATE user_2fa SET enabled = 1, updated_at = ? WHERE user_id = ?"
  ).run(now, user.sub);
  res.json({ success: true, enabled: true });
});

/** POST /disable - Disable 2FA (requires current valid code) */
router.post("/disable", authMiddleware, (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { code } = req.body;
  const row = db.prepare(
    "SELECT totp_secret, enabled FROM user_2fa WHERE user_id = ?"
  ).get(user.sub) as { totp_secret: string; enabled: number } | undefined;
  if (!row || !row.enabled) {
    res.status(400).json({ message: "2FA not enabled" });
    return;
  }
  if (!code || typeof code !== "string") {
    res.status(400).json({ message: "Code required to disable" });
    return;
  }
  const result = verifySync({ token: code.trim(), secret: row.totp_secret });
  if (!result.valid) {
    res.status(400).json({ message: "Invalid code" });
    return;
  }
  db.prepare("DELETE FROM user_2fa WHERE user_id = ?").run(user.sub);
  res.json({ success: true, enabled: false });
});

export default router;
export { router as twofaRouter };
