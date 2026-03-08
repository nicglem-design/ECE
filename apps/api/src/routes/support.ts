/**
 * Support contact. Sends user messages to support email via Resend.
 */

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth";
import { sendEmail } from "../lib/email";
import { db } from "../db";
import { config } from "../config";

const router = Router();
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || (process.env.EMAIL_FROM?.match(/<([^>]+)>/) ?? [])[1] || "support@example.com";

/** POST /api/v1/support/contact - Send support message */
router.post("/contact", authMiddleware, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string; email?: string } }).user;
  if (!user) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const { subject, message } = req.body;
  if (!subject || typeof subject !== "string" || subject.trim().length === 0) {
    res.status(400).json({ message: "Subject is required" });
    return;
  }
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ message: "Message is required" });
    return;
  }
  if (message.length > 5000) {
    res.status(400).json({ message: "Message too long" });
    return;
  }
  const userRow = (await db.prepare("SELECT email FROM users WHERE id = ?").get(user.sub)) as { email: string } | undefined;
  const userEmail = userRow?.email || "unknown@user";
  const html = `
    <h2>Support request from ${userEmail}</h2>
    <p><strong>Subject:</strong> ${subject.replace(/</g, "&lt;")}</p>
    <p><strong>User ID:</strong> ${user.sub}</p>
    <p><strong>Message:</strong></p>
    <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 1em; border-radius: 4px;">${message.replace(/</g, "&lt;")}</pre>
  `;
  const ok = await sendEmail(SUPPORT_EMAIL, `[ECE Support] ${subject.slice(0, 80)}`, html);
  if (!ok && config.resendApiKey) {
    res.status(500).json({ message: "Failed to send message. Please try again later." });
    return;
  }
  res.json({ success: true, message: "Your message has been sent. We'll get back to you soon." });
});

export default router;
