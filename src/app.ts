import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { env } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import integrationWebhookRoutes from "./routes/integrationWebhook.routes.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { initSocket } from "./socket/index.js";

const app = express();

const server = http.createServer(app);

// Initialize Socket.io with the HTTP server
initSocket(server);

app.disable("x-powered-by");

app.use(helmet());

const allowedOrigins = ["http://localhost:5173", "http://13.48.48.216"];

app.use(
  cors({
    origin: "http://13.48.48.216",
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204,
  }),
);

app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

app.use(cookieParser());

// Provider webhooks go before the logger and the global limiter: the URL
// carries a secret that must not reach access logs (see the route file).
app.use("/api/v1/integrations/webhooks", integrationWebhookRoutes);

app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

const globalRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use(globalRateLimiter);

app.use("/api/v1", apiRoutes);
app.use(errorHandler);

export default app;
