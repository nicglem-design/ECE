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
import { config } from "./config";
import { apiLimiter, authLimiter } from "./middleware/rateLimit";

const app = express();

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors({ origin: true, credentials: true }));
app.use("/api/v1/accounts/stripe-webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "100kb" }));
app.use("/api/v1", apiLimiter);

app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/accounts", accountsRoutes);
app.use("/api/v1/kyc", kycRoutes);
app.use("/api/v1/ai", aiRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(config.port, () => {
  console.log(`API running on http://localhost:${config.port}`);
});
