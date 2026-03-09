/**
 * 2FA (TOTP) for send/withdraw. Includes backup codes for account recovery.
 */

import crypto from "crypto";
import { Router, Request, Response } from "express";
import { generateSecret, generateURI, verifySync } from "otplib";
import { toDataURL } from "qrcode";
import { db, isAsync } from "../db";
import { authMiddleware } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router = Router();

const BACKUP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;

function generateBackupCode(): string {
  const bytes = crypto.randomBytes(BACKUP_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    code += BACKUP_CODE_CHARS[bytes[i]! % BACKUP_CODE_CHARS.length];
  }
  return code;
}

function hashBackupCode(code: string): string {
  return crypto.createHash("sha256").update(code.toUpperCase().trim()).digest("hex");
}

const INSERT_2FA = isAsync
  ? "INSERT INTO user_2fa (user_id, totp_secret, enabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT (user_id) DO UPDATE SET totp_secret = EXCLUDED.totp_secret, enabled = 0, updated_at = EXCLUDED.updated_at"
  : "INSERT OR REPLACE INTO user_2fa (user_id, totp_secret, enabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?)";

/** GET /status - Check if user has 2FA enabled */
router.get("/status", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const row = (await db.prepare(
    "SELECT enabled FROM user_2fa WHERE user_id = ?"
  ).get(user.sub)) as { enabled: number } | undefined;
  res.json({ enabled: !!(row?.enabled) });
});

/** POST /setup - Generate secret and return QR URL (does not enable yet) */
router.post("/setup", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const emailRow = (await db.prepare(
    "SELECT email FROM users WHERE id = ?"
  ).get(user.sub)) as { email: string } | undefined;
  const userEmail = emailRow?.email ?? user.sub;
  const issuer = "ECE";
  const secret = generateSecret();
  const otpauth = generateURI({ issuer, label: userEmail, secret });
  const qrDataUrl = await toDataURL(otpauth);

  const now = Date.now();
  await db.prepare(INSERT_2FA).run(user.sub, secret, now, now);

  res.json({ secret, qrDataUrl, otpauth });
});

/** POST /verify - Verify code and enable 2FA */
router.post("/verify", authMiddleware, async (req: Request, res: Response) => {
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
  const row = (await db.prepare(
    "SELECT totp_secret FROM user_2fa WHERE user_id = ?"
  ).get(user.sub)) as { totp_secret: string } | undefined;
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
  await db.prepare(
    "UPDATE user_2fa SET enabled = 1, updated_at = ? WHERE user_id = ?"
  ).run(now, user.sub);

  const backupCodes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const plain = generateBackupCode();
    backupCodes.push(plain);
    const hashed = hashBackupCode(plain);
    await db.prepare(
      "INSERT INTO user_2fa_backup_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)"
    ).run(user.sub, hashed, now);
  }

  logAudit(user.sub, "2fa_enabled", {}).catch(() => {});
  res.json({ success: true, enabled: true, backupCodes });
});

/** POST /disable - Disable 2FA (requires current valid code) */
router.post("/disable", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { code } = req.body;
  const row = (await db.prepare(
    "SELECT totp_secret, enabled FROM user_2fa WHERE user_id = ?"
  ).get(user.sub)) as { totp_secret: string; enabled: number } | undefined;
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
  await db.prepare("DELETE FROM user_2fa WHERE user_id = ?").run(user.sub);
  await db.prepare("DELETE FROM user_2fa_backup_codes WHERE user_id = ?").run(user.sub);
  logAudit(user.sub, "2fa_disabled", {}).catch(() => {});
  res.json({ success: true, enabled: false });
});

export default router;
export { router as twofaRouter };
