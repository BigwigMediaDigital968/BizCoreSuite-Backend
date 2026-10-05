import express, { Router } from "express";
import rateLimit from "express-rate-limit";

import { receiveWebhook } from "../controllers/integration.controller.js";

/**
 * Public endpoint providers call: POST /api/v1/integrations/webhooks/:provider/:integrationId/:secret
 *
 * Mounted in app.ts BEFORE the request logger and the global rate limiter:
 * the URL carries the webhook secret (WATI doesn't sign requests), so it must
 * not be written to access logs, and bursts of provider traffic shouldn't
 * eat into the per-IP budget meant for users.
 */
const router = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1200,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post(
  "/:provider/:integrationId/:secret",
  webhookLimiter,
  express.json({ limit: "256kb" }),
  receiveWebhook,
);

export default router;
