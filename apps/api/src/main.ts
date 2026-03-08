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

const app = express();

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

const server = app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
  if (process.env.SEED_MARKET_MAKER_ON_START === "true" || process.env.SEED_MARKET_MAKER_ON_START === "1") {
    import("./lib/marketMaker").then(({ seedMarketMaker }) => {
      seedMarketMaker()
        .then((r) => console.log(`Market maker seeded: ${r.ordersPlaced} orders across ${r.pairs} pairs`))
        .catch((e) => console.error("Market maker seed failed:", e));
    });
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Stop the other process or set PORT=4001`);
    process.exit(1);
  }
  throw err;
});
