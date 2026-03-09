/**
 * Production startup validation. Logs warnings for missing config.
 */

import { config } from "../config";

export function runStartupCheck(): void {
  if (!config.isProduction) return;

  const warnings: string[] = [];
  if (!config.stripeSecretKey) warnings.push("STRIPE_SECRET_KEY not set - deposits disabled");
  if (!config.stripeWebhookSecret && config.stripeSecretKey) warnings.push("STRIPE_WEBHOOK_SECRET not set - webhook verification disabled");
  if (!config.sumsubAppToken) warnings.push("SUMSUB_APP_TOKEN not set - KYC in stub mode");
  if (config.sumsubAppToken && !config.sumsubWebhookSecret) warnings.push("SUMSUB_WEBHOOK_SECRET not set - KYC webhook signature verification disabled");
  if (!process.env.RESEND_API_KEY) warnings.push("RESEND_API_KEY not set - email verification/reset disabled");
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) warnings.push("Using SQLite - set DATABASE_URL for production");
  if (!process.env.ETH_RPC_URL && !process.env.ETHEREUM_RPC_URL) warnings.push("Using public RPC - set ETH_RPC_URL for production custody");

  if (warnings.length > 0) {
    console.warn("[Production] Config warnings:");
    warnings.forEach((w) => console.warn("  -", w));
  }
}
