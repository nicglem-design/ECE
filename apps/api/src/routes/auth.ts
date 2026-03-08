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
    const token = jwt.sign(
      { sub: id, email: email.toLowerCase() },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );
    res.json({ token, email: email.toLowerCase() });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Registration failed" });
  }
});

export default router;
