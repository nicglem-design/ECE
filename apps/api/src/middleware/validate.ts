import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const msg = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
        res.status(400).json({ message: msg });
        return;
      }
      next(err);
    }
  };
}
