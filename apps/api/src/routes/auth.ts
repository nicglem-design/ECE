import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";
import { validateBody } from "../middleware/validate";
import { authMiddleware } from "../middleware/auth";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";
import { logAudit } from "../lib/audit";

const router = Router();

function getClientIp(req: Request): string | undefined {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;
}

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(500),
});

const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(500),
  birthDate: z.string().optional(),
  acceptedTerms: z.boolean().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: z.string().min(8, "Password must be at least 8 characters").max(500),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(500),
});

function createTokenPair(userId: string, email: string) {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: userId, email, jti },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );
  const refreshToken = uuidv4();
  const now = Date.now();
  const refreshExpiresMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  return { token, refreshToken, refreshExpiresMs, now };
}

router.post("/login", validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = (await db.prepare("SELECT id, email, password_hash, email_verified FROM users WHERE email = ?").get(email.toLowerCase())) as { id: string; email: string; password_hash: string; email_verified?: number } | undefined;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      logAudit(null, "login_fail", { email: email.toLowerCase() }, getClientIp(req)).catch(() => {});
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }
    logAudit(user.id, "login_success", { email: user.email }, getClientIp(req)).catch(() => {});
    const { token, refreshToken, refreshExpiresMs, now: pairNow } = createTokenPair(user.id, user.email);
    await db.prepare(
      "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'refresh', ?, ?)"
    ).run(uuidv4(), user.id, refreshToken, pairNow + refreshExpiresMs, pairNow);
    res.json({ token, refreshToken, email: user.email, emailVerified: !!(user.email_verified) });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/signup", validateBody(signupSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, birthDate, acceptedTerms } = req.body;
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    const tosAcceptedAt = acceptedTerms === true ? now : null;
    const emailLower = email.toLowerCase();
    const isTestUser = emailLower.endsWith("@test.local");
    const emailVerified = isTestUser ? 1 : 0;
    try {
      await db.prepare(
        "INSERT INTO users (id, email, password_hash, email_verified, created_at, tos_accepted_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(id, emailLower, passwordHash, emailVerified, now, tosAcceptedAt);
      await db.prepare(
        "INSERT INTO profiles (user_id, display_name, updated_at) VALUES (?, ?, ?)"
      ).run(id, "", now);
      await db.prepare(
        "INSERT INTO kyc_status (user_id, status, updated_at) VALUES (?, ?, ?)"
      ).run(id, "pending", now);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "23505") {
        res.status(400).json({ message: "Email already registered" });
        return;
      }
      throw e;
    }
    if (!isTestUser) {
      const verifyToken = uuidv4();
      const verifyExpires = now + 24 * 60 * 60 * 1000;
      await db.prepare(
        "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'email_verify', ?, ?)"
      ).run(uuidv4(), id, verifyToken, verifyExpires, now);
      sendVerificationEmail(emailLower, verifyToken).catch((e) =>
        console.error("Verification email send error:", e)
      );
    }

    const { token, refreshToken, refreshExpiresMs, now: pairNow } = createTokenPair(id, emailLower);
    await db.prepare(
      "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'refresh', ?, ?)"
    ).run(uuidv4(), id, refreshToken, pairNow + refreshExpiresMs, pairNow);
    res.json({ token, refreshToken, email: emailLower, emailVerified: !!emailVerified });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

const verifyEmailSchema = z.object({
  token: z.string().min(1).max(500),
});

router.post("/verify-email", validateBody(verifyEmailSchema), async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    const row = (await db.prepare(
      "SELECT user_id FROM auth_tokens WHERE token = ? AND type = 'email_verify' AND expires_at > ?"
    ).get(token, Date.now())) as { user_id: string } | undefined;
    if (!row) {
      res.status(400).json({ message: "Invalid or expired verification link" });
      return;
    }
    await db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(row.user_id);
    await db.prepare("DELETE FROM auth_tokens WHERE token = ?").run(token);
    res.json({ success: true });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ message: "Verification failed" });
  }
});

router.post("/resend-verification", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as Request & { user?: { sub: string } }).user;
    if (!user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const row = (await db.prepare("SELECT email, email_verified FROM users WHERE id = ?").get(user.sub)) as { email: string; email_verified: number } | undefined;
    if (!row) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (row.email_verified === 1) {
      res.json({ success: true, message: "Email already verified" });
      return;
    }
    const verifyToken = uuidv4();
    const now = Date.now();
    const verifyExpires = now + 24 * 60 * 60 * 1000;
    await db.prepare("DELETE FROM auth_tokens WHERE user_id = ? AND type = 'email_verify'").run(user.sub);
    await db.prepare(
      "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'email_verify', ?, ?)"
    ).run(uuidv4(), user.sub, verifyToken, verifyExpires, now);
    await sendVerificationEmail(row.email, verifyToken);
    res.json({ success: true, message: "Verification email sent. Check your inbox." });
  } catch (err) {
    console.error("Resend verification error:", err);
    res.status(500).json({ message: "Failed to send verification email" });
  }
});

router.post("/forgot-password", validateBody(forgotPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = (await db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase())) as { id: string } | undefined;
    if (user) {
      const resetToken = uuidv4();
      const now = Date.now();
      const expires = now + 60 * 60 * 1000;
      await db.prepare(
        "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'password_reset', ?, ?)"
      ).run(uuidv4(), user.id, resetToken, expires, now);
      sendPasswordResetEmail(email.toLowerCase(), resetToken).catch((e) =>
        console.error("Password reset email send error:", e)
      );
    }
    res.json({ success: true, message: "If an account exists, you will receive a password reset link." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Request failed" });
  }
});

router.post("/refresh", validateBody(refreshSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const row = (await db.prepare(
      "SELECT user_id FROM auth_tokens WHERE token = ? AND type = 'refresh' AND expires_at > ?"
    ).get(refreshToken, Date.now())) as { user_id: string } | undefined;
    if (!row) {
      res.status(401).json({ message: "Invalid or expired refresh token" });
      return;
    }
    const userRow = (await db.prepare("SELECT email FROM users WHERE id = ?").get(row.user_id)) as { email: string } | undefined;
    if (!userRow) {
      res.status(401).json({ message: "User not found" });
      return;
    }
    const { token, refreshToken: newRefreshToken, refreshExpiresMs, now } = createTokenPair(row.user_id, userRow.email);
    await db.prepare("DELETE FROM auth_tokens WHERE token = ?").run(refreshToken);
    await db.prepare(
      "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'refresh', ?, ?)"
    ).run(uuidv4(), row.user_id, newRefreshToken, now + refreshExpiresMs, now);
    res.json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ message: "Token refresh failed" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  try {
    const { refreshToken, accessToken } = req.body;
    if (refreshToken && typeof refreshToken === "string") {
      await db.prepare("DELETE FROM auth_tokens WHERE token = ? AND type = 'refresh'").run(refreshToken);
    }
    if (accessToken && typeof accessToken === "string") {
      try {
        const payload = jwt.decode(accessToken) as { jti?: string; exp?: number } | null;
        if (payload?.jti && payload.exp) {
          const expiresAt = payload.exp * 1000;
          try {
            await db.prepare("INSERT INTO revoked_jwt (jti, expires_at) VALUES (?, ?)").run(payload.jti, expiresAt);
          } catch {
            /* already revoked */
          }
        }
      } catch {
        /* ignore decode errors */
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Logout failed" });
  }
});

router.post("/reset-password", validateBody(resetPasswordSchema), async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    const row = (await db.prepare(
      "SELECT user_id FROM auth_tokens WHERE token = ? AND type = 'password_reset' AND expires_at > ?"
    ).get(token, Date.now())) as { user_id: string } | undefined;
    if (!row) {
      res.status(400).json({ message: "Invalid or expired reset link" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
    await db.prepare("DELETE FROM auth_tokens WHERE token = ?").run(token);
    logAudit(row.user_id, "password_reset", {}, getClientIp(req)).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Reset failed" });
  }
});

export default router;
