/**
 * Production startup validation. Fails on critical missing config, logs warnings for optional.
 */

import { config } from "../config";
import { logger } from "./logger";

export function runStartupCheck(): void {
  if (!config.isProduction) return;

  if (!config.corsOrigins || config.corsOrigins.trim() === "") {
    logger.error("FATAL: CORS_ORIGINS must be set in production (comma-separated allowed origins)");
    process.exit(1);
  }

  const warnings: string[] = [];
  if (!config.braintreeMerchantId || !config.braintreePrivateKey) warnings.push("BRAINTREE_MERCHANT_ID / BRAINTREE_PRIVATE_KEY not set - card deposits disabled");
  if (!config.sumsubAppToken) warnings.push("SUMSUB_APP_TOKEN not set - KYC in stub mode");
  if (config.sumsubAppToken && !config.sumsubWebhookSecret) {
    logger.error("FATAL: SUMSUB_WEBHOOK_SECRET must be set when SUMSUB_APP_TOKEN is configured (KYC webhook)");
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY) warnings.push("RESEND_API_KEY not set - email verification/reset disabled");
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) warnings.push("Using SQLite - set DATABASE_URL for production");
  if (!process.env.ETH_RPC_URL && !process.env.ETHEREUM_RPC_URL) warnings.push("Using public RPC - set ETH_RPC_URL for production custody");

  if (warnings.length > 0) {
    logger.warn({ warnings }, "[Production] Config warnings");
  }
}
