import { Router } from "express";

import {
  getIntegrationById,
  getIntegrationEvents,
  getIntegrations,
  getProviders,
  importIntegrationContacts,
  patchIntegration,
  pauseIntegration,
  postIntegration,
  removeIntegration,
  resumeIntegration,
  retryIntegrationEvent,
  rotateIntegrationWebhook,
  testIntegrationCredentials,
} from "../controllers/integration.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

// Settings → Integrations. Head only (INTEGRATION_* are granted to no other role).
// The public webhook lives in integrationWebhook.routes.ts.
const router = Router();

router.use(authenticate);

router.get("/providers", authorize(PERMISSIONS.INTEGRATION_VIEW), getProviders);

router.post("/test", authorize(PERMISSIONS.INTEGRATION_MANAGE), testIntegrationCredentials);

router.get("/", authorize(PERMISSIONS.INTEGRATION_VIEW), getIntegrations);

router.post(
  "/",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "CONNECTED", (req) => `Connected ${req.body?.provider} integration "${req.body?.name}"`),
  postIntegration,
);

router.get("/:id", authorize(PERMISSIONS.INTEGRATION_VIEW), getIntegrationById);

router.patch(
  "/:id",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "UPDATED", (req) => `Updated integration ID: ${req.params.id}`),
  patchIntegration,
);

router.delete(
  "/:id",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "DELETED", (req) => `Deleted integration ID: ${req.params.id}`),
  removeIntegration,
);

router.post(
  "/:id/pause",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "PAUSED", (req) => `Paused integration ID: ${req.params.id}`),
  pauseIntegration,
);

router.post(
  "/:id/resume",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "RESUMED", (req) => `Resumed integration ID: ${req.params.id}`),
  resumeIntegration,
);

router.post(
  "/:id/rotate-webhook",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "WEBHOOK_ROTATED", (req) => `Regenerated webhook URL for integration ID: ${req.params.id}`),
  rotateIntegrationWebhook,
);

router.post(
  "/:id/import-contacts",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  trackActivity("INTEGRATION", "IMPORT_STARTED", (req) => `Started contact import for integration ID: ${req.params.id}`),
  importIntegrationContacts,
);

router.get("/:id/events", authorize(PERMISSIONS.INTEGRATION_VIEW), getIntegrationEvents);

router.post(
  "/:id/events/:eventId/retry",
  authorize(PERMISSIONS.INTEGRATION_MANAGE),
  retryIntegrationEvent,
);

export default router;
