import "dotenv/config"; // load env before config
import { logger } from "./lib/logger";

const isProd = process.env.NODE_ENV === "production";
const defaultJwtSecret = isProd ? "" : "dev-secret-change-in-production";

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || defaultJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  sumsubAppToken: process.env.SUMSUB_APP_TOKEN || "",
  sumsubSecretKey: process.env.SUMSUB_SECRET_KEY || "",
  sumsubWebhookSecret: process.env.SUMSUB_WEBHOOK_SECRET || "",
  sumsubBaseUrl: process.env.SUMSUB_BASE_URL || "https://api.sumsub.com",
  braintreeMerchantId: process.env.BRAINTREE_MERCHANT_ID || "",
  braintreePublicKey: process.env.BRAINTREE_PUBLIC_KEY || "",
  braintreePrivateKey: process.env.BRAINTREE_PRIVATE_KEY || "",
  braintreeEnvironment: process.env.BRAINTREE_ENVIRONMENT || "sandbox",
  resendApiKey: process.env.RESEND_API_KEY || "",
  isProduction: isProd,
  /** Max fiat withdrawal (USD equivalent) per user per 24h. 0 = no limit. */
  withdrawalLimitDaily: parseFloat(process.env.WITHDRAWAL_LIMIT_DAILY || "0") || 0,
  /** Max crypto send count per user per 24h. 0 = no limit. */
  sendLimitDaily: parseInt(process.env.SEND_LIMIT_DAILY || "0", 10) || 0,
  /** Allow manual fiat deposit (demo/test). In production, set explicitly to allow. */
  allowManualDeposit: process.env.ALLOW_MANUAL_DEPOSIT === "true" || process.env.ALLOW_MANUAL_DEPOSIT === "1" || !isProd,
  /** CORS allowed origins. Comma-separated. Empty = allow all (dev). */
  corsOrigins: process.env.CORS_ORIGINS || "",
};

if (isProd && !config.jwtSecret) {
  logger.error("FATAL: JWT_SECRET must be set in production");
  process.exit(1);
}
