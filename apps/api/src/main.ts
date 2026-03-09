import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import authRoutes from "./routes/auth";
import profileRoutes from "./routes/profile";
import walletRoutes from "./routes/wallet";
import accountsRoutes from "./routes/accounts";
import kycRoutes from "./routes/kyc";
import aiRoutes from "./routes/ai";
import marketRoutes from "./routes/market";
import twofaRoutes from "./routes/twofa";
import cronRoutes from "./routes/cron";
import supportRoutes from "./routes/support";
import { handleStripeWebhook } from "./routes/stripeWebhook";
import { handleKycWebhook } from "./routes/kycWebhook";
import { config } from "./config";
import { apiLimiter, authLimiter, supportContactLimiter, aiChatLimiter } from "./middleware/rateLimit";
import { requestIdMiddleware } from "./middleware/requestId";
import { requestLogMiddleware } from "./middleware/requestLog";
import { metricsAuthMiddleware } from "./middleware/metricsAuth";
import { getReadyStatus } from "./lib/health";
import { runStartupCheck } from "./lib/startupCheck";
import { cleanupExpiredTokens } from "./lib/cleanupTokens";
import { logger } from "./lib/logger";
import { getMetrics } from "./lib/metrics";

const app = express();

runStartupCheck();

cleanupExpiredTokens()
  .then((n) => n > 0 && logger.info({ deleted: n }, "Cleaned up expired auth tokens"))
  .catch(() => {});

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const corsOrigins = config.corsOrigins
  ? config.corsOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  : true;
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
app.post("/api/v1/accounts/stripe-webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
app.post("/api/v1/kyc/webhook", express.raw({ type: "application/json" }), handleKycWebhook);
app.use(express.json({ limit: "100kb" }));
app.use("/api/v1", apiLimiter);

app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/accounts", accountsRoutes);
app.use("/api/v1/kyc", kycRoutes);
app.use("/api/v1/ai", aiRoutes);
app.use("/api/v1/market", marketRoutes);
app.use("/api/v1/2fa", twofaRoutes);
app.use("/api/v1/cron", cronRoutes);
app.use("/api/v1/support", supportContactLimiter, supportRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/ready", async (req, res) => {
  try {
    const deep = req.query.deep === "true" || req.query.deep === "1";
    const status = await getReadyStatus(deep);
    res.status(status.ok ? 200 : 503).json(status);
  } catch (err) {
    res.status(503).json({
      ok: false,
      database: "error",
      error: err instanceof Error ? err.message : "Health check failed",
      timestamp: Date.now(),
    });
  }
});

app.get("/metrics", metricsAuthMiddleware, (_req, res) => {
  res.json(getMetrics());
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, "API running");
  if (process.env.SEED_MARKET_MAKER_ON_START === "true" || process.env.SEED_MARKET_MAKER_ON_START === "1") {
    import("./lib/marketMaker").then(({ seedMarketMaker }) => {
      seedMarketMaker()
        .then((r) => logger.info({ ordersPlaced: r.ordersPlaced, pairs: r.pairs }, "Market maker seeded"))
        .catch((e) => logger.error({ err: e }, "Market maker seed failed"));
    });
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    logger.error({ port: config.port }, "Port already in use");
    process.exit(1);
  }
  throw err;
});
