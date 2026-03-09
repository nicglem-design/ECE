/**
 * Protect /metrics in production. Allow when:
 * - Bearer token matches CRON_SECRET or API_INTERNAL_KEY
 * - Request from internal IP (127.0.0.1, 10.x, 172.16-31.x, 192.168.x)
 * - NODE_ENV !== production
 */

import { Request, Response, NextFunction } from "express";
import { config } from "../config";

function isInternalIp(ip: string | undefined): boolean {
  if (!ip) return false;
  const trimmed = ip.replace(/^::ffff:/, "");
  if (trimmed === "127.0.0.1" || trimmed === "::1") return true;
  if (trimmed.startsWith("10.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(trimmed)) return true;
  if (trimmed.startsWith("192.168.")) return true;
  return false;
}

export function metricsAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.isProduction) {
    next();
    return;
  }
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const cronSecret = process.env.CRON_SECRET;
  const internalKey = process.env.API_INTERNAL_KEY;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;

  if (token && (token === cronSecret || token === internalKey)) {
    next();
    return;
  }
  if (isInternalIp(ip)) {
    next();
    return;
  }
  res.status(401).json({ message: "Unauthorized" });
}
