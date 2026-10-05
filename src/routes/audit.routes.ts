import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";

import { authorize } from "../middleware/authorize.middleware.js";

import { PERMISSIONS } from "../constants/permissions.js";

import { getAuditLogsController } from "../controllers/audit.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.AUDIT_READ),
  getAuditLogsController,
);

export default router;
