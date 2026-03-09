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

/** Support contact: 5 per hour per IP (auth or guest) */
export const supportContactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 5 : 20,
  message: { message: "Too many support requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** AI chat: 20 per hour per IP */
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 20 : 100,
  message: { message: "Too many AI requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
