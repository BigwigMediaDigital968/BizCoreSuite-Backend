import dotenv from "dotenv";

dotenv.config();

const requiredEnv = ["MONGO_URI", "JWT_SECRET"] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",

  port: Number(process.env.PORT) || 8000,

  mongoUri: process.env.MONGO_URI as string,

  jwtSecret: process.env.JWT_SECRET as string,

  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1d",

  clientUrl: process.env.CLIENT_URL || "http://13.48.48.216:5173",
  // Public URL of this API; integration webhook URLs are built from it.
  backendUrl: (
    process.env.BACKEND_URL ||
    `http://localhost:${Number(process.env.PORT) || 8000}`
  ).replace(/\/+$/, ""),
};
