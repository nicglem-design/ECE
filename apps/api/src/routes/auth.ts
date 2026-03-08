import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";
import { validateBody } from "../middleware/validate";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email";

const router = Router();

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(500),
});

const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(500),
  birthDate: z.string().optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(500),
  password: z.string().min(8, "Password must be at least 8 characters").max(500),
});

router.post("/login", validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = (await db.prepare("SELECT id, email, password_hash, email_verified FROM users WHERE email = ?").get(email.toLowerCase())) as { id: string; email: string; password_hash: string; email_verified?: number } | undefined;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );
    res.json({ token, email: user.email, emailVerified: !!(user.email_verified) });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/signup", validateBody(signupSchema), async (req: Request, res: Response) => {
  try {
    const { email, password, birthDate } = req.body;
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    try {
      await db.prepare(
        "INSERT INTO users (id, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 0, ?)"
      ).run(id, email.toLowerCase(), passwordHash, now);
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
    const verifyToken = uuidv4();
    const verifyExpires = now + 24 * 60 * 60 * 1000;
    await db.prepare(
      "INSERT INTO auth_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, 'email_verify', ?, ?)"
    ).run(uuidv4(), id, verifyToken, verifyExpires, now);
    sendVerificationEmail(email.toLowerCase(), verifyToken).catch((e) =>
      console.error("Verification email send error:", e)
    );

    const token = jwt.sign(
      { sub: id, email: email.toLowerCase() },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );
    res.json({ token, email: email.toLowerCase(), emailVerified: false });
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
    res.json({ success: true });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Reset failed" });
  }
});

export default router;
