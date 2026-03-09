/**
 * Request correlation ID middleware.
 * Reads X-Request-ID from request or generates one, attaches to req and response.
 */

import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers["x-request-id"] as string) || uuidv4();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}
