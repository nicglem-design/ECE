import "dotenv/config"; // load env before config

const isProd = process.env.NODE_ENV === "production";
const defaultJwtSecret = isProd ? "" : "dev-secret-change-in-production";

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || defaultJwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  sumsubAppToken: process.env.SUMSUB_APP_TOKEN || "",
  sumsubSecretKey: process.env.SUMSUB_SECRET_KEY || "",
  sumsubBaseUrl: process.env.SUMSUB_BASE_URL || "https://api.sumsub.com",
  isProduction: isProd,
};

if (isProd && !config.jwtSecret) {
  console.error("FATAL: JWT_SECRET must be set in production");
  process.exit(1);
}
