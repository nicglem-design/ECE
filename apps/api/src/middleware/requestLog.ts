/**
 * Request logging middleware. Logs method, path, status, duration, and requestId.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = logger.child({ requestId: req.requestId });
    log.info(
      {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
      },
      "request"
    );
  });
  next();
}
