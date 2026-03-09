/**
 * Health checks for production readiness.
 * GET /health - basic liveness
 * GET /health/ready - readiness (DB, Stripe, Sumsub, Resend, RPC)
 * GET /health/ready?deep=true - also probe external service connectivity
 */

import { db } from "../db";
import { config } from "../config";

export interface HealthStatus {
  ok: boolean;
  database: "ok" | "error";
  stripe: "configured" | "not_configured" | "error";
  sumsub: "configured" | "not_configured" | "error";
  resend: "configured" | "not_configured" | "error";
  rpc: "configured" | "not_configured" | "error";
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

async function checkStripeConnectivity(): Promise<boolean> {
  if (!config.stripeSecretKey) return false;
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(config.stripeSecretKey);
    await stripe.balance.retrieve();
    return true;
  } catch {
    return false;
  }
}

async function checkSumsubConnectivity(): Promise<boolean> {
  if (!config.sumsubAppToken) return false;
  try {
    const res = await fetch(`${config.sumsubBaseUrl}/resources/sdkIntegrations/conf`, {
      headers: { "X-App-Token": config.sumsubAppToken },
    });
    return res.ok || res.status === 401;
  } catch {
    return false;
  }
}

async function checkResendConnectivity(): Promise<boolean> {
  if (!config.resendApiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${config.resendApiKey}` },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

async function checkRpcConnectivity(): Promise<boolean> {
  const rpcUrl = process.env.ETH_RPC_URL || process.env.ETHEREUM_RPC_URL;
  if (!rpcUrl) return false;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { result?: string };
    return typeof data?.result === "string";
  } catch {
    return false;
  }
}

export async function getReadyStatus(deep = false): Promise<HealthStatus> {
  const dbOk = await checkDatabase();

  let stripe: HealthStatus["stripe"] = config.stripeSecretKey ? "configured" : "not_configured";
  let sumsub: HealthStatus["sumsub"] = config.sumsubAppToken ? "configured" : "not_configured";
  let resend: HealthStatus["resend"] = config.resendApiKey ? "configured" : "not_configured";
  const rpcUrl = process.env.ETH_RPC_URL || process.env.ETHEREUM_RPC_URL;
  let rpc: HealthStatus["rpc"] = rpcUrl ? "configured" : "not_configured";

  if (deep) {
    const [stripeOk, sumsubOk, resendOk, rpcOk] = await Promise.all([
      stripe === "configured" ? checkStripeConnectivity() : Promise.resolve(false),
      sumsub === "configured" ? checkSumsubConnectivity() : Promise.resolve(false),
      resend === "configured" ? checkResendConnectivity() : Promise.resolve(false),
      rpc === "configured" ? checkRpcConnectivity() : Promise.resolve(false),
    ]);
    if (stripe === "configured") stripe = stripeOk ? "configured" : "error";
    if (sumsub === "configured") sumsub = sumsubOk ? "configured" : "error";
    if (resend === "configured") resend = resendOk ? "configured" : "error";
    if (rpc === "configured") rpc = rpcOk ? "configured" : "error";
  }

  const ok = dbOk;

  return {
    ok,
    database: dbOk ? "ok" : "error",
    stripe,
    sumsub,
    resend,
    rpc,
    timestamp: Date.now(),
  };
}
