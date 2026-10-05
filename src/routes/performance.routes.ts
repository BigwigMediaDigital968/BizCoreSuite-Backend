// src/routes/performance.routes.ts
import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { getPerformanceReportHandler } from "../controllers/performance.controller.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

router.get(
  "/report",
  authenticate,
  authorize(PERMISSIONS.PERFORMANCE_VIEW),
  getPerformanceReportHandler
);

export default router;