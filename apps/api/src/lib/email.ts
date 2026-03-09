/**
 * Email service. Uses Resend when RESEND_API_KEY is set, else logs to logger (dev).
 */

import { Resend } from "resend";
import { logger } from "./logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "ECE <onboarding@resend.dev>";
const APP_NAME = process.env.APP_NAME || "ECE";

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
      });
      if (error) {
        logger.error({ error }, "Resend error");
        return false;
      }
      return true;
    } catch (err) {
      logger.error({ err }, "Email send error");
      return false;
    }
  }
  logger.debug({ to, subject, bodyPreview: html.slice(0, 200) + "..." }, "[DEV] Email would send");
  return true;
}

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const html = `
    <h2>Verify your email</h2>
    <p>Thanks for signing up for ${APP_NAME}. Click the link below to verify your email:</p>
    <p><a href="${verifyUrl}">Verify email</a></p>
    <p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
  `;
  return sendEmail(email, `Verify your ${APP_NAME} email`, html);
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `
    <h2>Reset your password</h2>
    <p>You requested a password reset for ${APP_NAME}. Click the link below to set a new password:</p>
    <p><a href="${resetUrl}">Reset password</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
  `;
  return sendEmail(email, `Reset your ${APP_NAME} password`, html);
}

export async function sendWithdrawalConfirmationEmail(
  email: string,
  amount: number,
  currency: string,
  destination: string
): Promise<boolean> {
  const html = `
    <h2>Withdrawal confirmation</h2>
    <p>Your withdrawal of ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency} has been initiated.</p>
    <p><strong>Destination:</strong> ${destination.replace(/</g, "&lt;")}</p>
    <p>Funds typically arrive within 1–3 business days. If you did not request this withdrawal, please contact support immediately.</p>
  `;
  return sendEmail(email, `[${APP_NAME}] Withdrawal confirmation`, html);
}
