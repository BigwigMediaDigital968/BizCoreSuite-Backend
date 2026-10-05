import { Router } from "express";
import {
  checkReportWindow,
  submitDailyReport,
  getMyDailyReports,
  getAllDailyReports,
  getDailyReportById,
  reviewDailyReport,
  getMissingDailyReports,
  getDailyReportSummary,
  exportDailyReports,
} from "../controllers/dailyReportController.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

// Deliberately no enforceWorkingHours: reports are due at the end of the day
// and the late window runs past closing time.
const router = Router();

router.use(authenticate);

// ---------- Employee: own reports ----------

// 1. TODAY'S WINDOW + REPORT + SYSTEM METRICS (for prefill)
router.get(
  "/window",
  authorize(PERMISSIONS.DAILY_REPORT_CREATE),
  checkReportWindow,
);

// 2. SUBMIT OR UPDATE TODAY'S REPORT
router.post(
  "/",
  authorize(PERMISSIONS.DAILY_REPORT_CREATE),
  trackActivity(
    "DAILY_REPORT",
    "SUBMITTED",
    () => "Submitted daily activity report",
  ),
  submitDailyReport,
);

// 3. OWN HISTORY
router.get(
  "/my",
  authorize(PERMISSIONS.DAILY_REPORT_CREATE),
  getMyDailyReports,
);

// ---------- Management: Manager, Admin, Head (branch-scoped) ----------
// Static paths must stay above "/:id".

router.get(
  "/missing",
  authorize(PERMISSIONS.DAILY_REPORT_VIEW),
  getMissingDailyReports,
);

router.get(
  "/summary",
  authorize(PERMISSIONS.DAILY_REPORT_VIEW),
  getDailyReportSummary,
);

router.get(
  "/export",
  authorize(PERMISSIONS.DAILY_REPORT_EXPORT),
  trackActivity(
    "DAILY_REPORT",
    "EXPORTED",
    (req) => `Exported daily reports (${req.query.format || "csv"})`,
  ),
  exportDailyReports,
);

router.get(
  "/",
  authorize(PERMISSIONS.DAILY_REPORT_VIEW),
  getAllDailyReports,
);

router.get(
  "/:id",
  authorize(PERMISSIONS.DAILY_REPORT_VIEW),
  getDailyReportById,
);

router.patch(
  "/:id/review",
  authorize(PERMISSIONS.DAILY_REPORT_REVIEW),
  trackActivity(
    "DAILY_REPORT",
    "REVIEWED",
    (req) => `Reviewed daily report ID: ${req.params.id}`,
  ),
  reviewDailyReport,
);

export default router;
