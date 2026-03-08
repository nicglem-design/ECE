import "dotenv/config"; // load env before config

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-in-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  sumsubAppToken: process.env.SUMSUB_APP_TOKEN || "",
  sumsubSecretKey: process.env.SUMSUB_SECRET_KEY || "",
  sumsubBaseUrl: process.env.SUMSUB_BASE_URL || "https://api.sumsub.com",
};
