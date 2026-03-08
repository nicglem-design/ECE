import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db";
import { config } from "../config";
import { v4 as uuidv4 } from "uuid";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: "Email and password required" });
      return;
    }
    const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email.toLowerCase()) as { id: string; email: string; password_hash: string } | undefined;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );
    res.json({ token, email: user.email });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed" });
  }
});

router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, birthDate } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: "Email and password required" });
      return;
    }
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();
    try {
      db.prepare(
        "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
      ).run(id, email.toLowerCase(), passwordHash, now);
      db.prepare(
        "INSERT INTO profiles (user_id, display_name, updated_at) VALUES (?, ?, ?)"
      ).run(id, "", now);
      db.prepare(
        "INSERT INTO kyc_status (user_id, status, updated_at) VALUES (?, ?, ?)"
      ).run(id, "pending", now);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
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
