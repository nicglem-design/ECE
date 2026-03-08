/**
 * Health checks for production readiness.
 * GET /health - basic liveness
 * GET /health/ready - readiness (DB, optional Stripe)
 */

import { db } from "../db";
import { config } from "../config";

export interface HealthStatus {
  ok: boolean;
  database: "ok" | "error";
  stripe?: "configured" | "not_configured";
  timestamp: number;
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

export async function getReadyStatus(): Promise<HealthStatus> {
  const dbOk = await checkDatabase();
  return {
    ok: dbOk,
    database: dbOk ? "ok" : "error",
    stripe: config.stripeSecretKey ? "configured" : "not_configured",
    timestamp: Date.now(),
  };
}
