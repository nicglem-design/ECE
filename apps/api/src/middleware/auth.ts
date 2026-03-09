import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { db } from "../db";

export interface JwtPayload {
  sub: string;
  email: string;
  jti?: string;
}

export async function isJwtRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  try {
    const row = await db.prepare("SELECT 1 FROM revoked_jwt WHERE jti = ? AND expires_at > ?").get(jti, Date.now());
    return !!row;
  } catch {
    return false;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  (async () => {
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      const revoked = await isJwtRevoked(decoded.jti);
      if (revoked) {
        res.status(401).json({ message: "Token has been revoked" });
        return;
      }
      (req as Request & { user?: JwtPayload }).user = decoded;
      next();
    } catch {
      res.status(401).json({ message: "Invalid or expired token" });
    }
  })();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    next();
    return;
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    (req as Request & { user?: JwtPayload }).user = decoded;
  } catch {
    // ignore
  }
  next();
}
