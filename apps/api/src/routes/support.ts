/**
 * Support contact. Sends user messages to support email via Resend.
 * Authenticated: uses user email. Guest: requires email in body.
 */

import { Router, Request, Response } from "express";
import { authMiddleware, optionalAuth } from "../middleware/auth";
import { sendEmail } from "../lib/email";
import { db } from "../db";
import { config } from "../config";

const router = Router();
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || (process.env.EMAIL_FROM?.match(/<([^>]+)>/) ?? [])[1] || "support@example.com";

function escapeHtml(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** POST /api/v1/support/contact - Send support message (auth or guest with email) */
router.post("/contact", optionalAuth, async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { sub: string; email?: string } }).user;
  const { subject, message, email: guestEmail } = req.body;
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
  let userEmail: string;
  let userId: string | null = null;
  if (user) {
    const userRow = (await db.prepare("SELECT email FROM users WHERE id = ?").get(user.sub)) as { email: string } | undefined;
    userEmail = userRow?.email || "unknown@user";
    userId = user.sub;
  } else {
    const emailStr = typeof guestEmail === "string" ? guestEmail.trim() : "";
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      res.status(400).json({ message: "Valid email is required for guest submissions" });
      return;
    }
    userEmail = emailStr;
  }
  const html = `
    <h2>Support request from ${escapeHtml(userEmail)}</h2>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    ${userId ? `<p><strong>User ID:</strong> ${escapeHtml(userId)}</p>` : "<p><strong>Guest</strong> (not logged in)</p>"}
    <p><strong>Message:</strong></p>
    <pre style="white-space: pre-wrap; background: #f5f5f5; padding: 1em; border-radius: 4px;">${escapeHtml(message)}</pre>
  `;
  const ok = await sendEmail(SUPPORT_EMAIL, `[ECE Support] ${subject.slice(0, 80)}`, html);
  if (!ok && config.resendApiKey) {
    res.status(500).json({ message: "Failed to send message. Please try again later." });
    return;
  }
  res.json({ success: true, message: "Your message has been sent. We'll get back to you soon." });
});

export default router;
