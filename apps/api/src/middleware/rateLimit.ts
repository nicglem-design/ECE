import rateLimit from "express-rate-limit";

const isProd = process.env.NODE_ENV === "production";

/** General API rate limit: 100 req/min per IP */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProd ? 100 : 1000,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Auth routes: 10 attempts per 15 min */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 50,
  message: { message: "Too many login attempts, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
