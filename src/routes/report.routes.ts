import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  getDashboardAnalyticsController,
  exportReportController,
} from "../controllers/report.controller.js";

const router = Router();

router.use(authenticate);

// 1. Dashboard Overview Analytics (Super Admin, Branch Head, Managers)
router.get(
  "/dashboard",
  authorize(PERMISSIONS.REPORT_VIEW),
  getDashboardAnalyticsController,
);

// 2. Export Multi-module Analytics (CSV / Excel)
router.get(
  "/export",
  authorize(PERMISSIONS.REPORT_EXPORT),
  trackActivity(
    "REPORT",
    "EXPORTED",
    (req) =>
      `Exported report for module: ${req.query.module || "ALL"} in ${req.query.format || "csv"} format`,
  ),
  exportReportController,
);

export default router;
