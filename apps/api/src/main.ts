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
import { handleStripeWebhook } from "./routes/stripeWebhook";
import { config } from "./config";
import { apiLimiter, authLimiter } from "./middleware/rateLimit";
import { getReadyStatus } from "./lib/health";
import { runStartupCheck } from "./lib/startupCheck";
import { logger } from "./lib/logger";
import { getMetrics } from "./lib/metrics";

const app = express();

runStartupCheck();

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors({ origin: true, credentials: true }));
app.post("/api/v1/accounts/stripe-webhook", express.raw({ type: "application/json" }), handleStripeWebhook);
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

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/health/ready", async (_req, res) => {
  try {
    const status = await getReadyStatus();
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

app.get("/metrics", (_req, res) => {
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
