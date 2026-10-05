import { Router } from "express";

import {
  cancelSalaryPayout,
  createSalaryDeduction,
  deleteSalaryDeduction,
  exportSalaryPayout,
  generateSalaryPayout,
  getEligiblePayoutEmployees,
  getMySalaryPayout,
  getSalaryPayout,
  getSalarySettings,
  listSalaryDeductions,
  listMySalaryPayouts,
  listSalaryPayouts,
  markSalaryPayoutPaid,
  previewSalaryPayout,
  resetSalarySettings,
  reviewSalaryDeduction,
  updateSalarySettings,
} from "../controllers/salary.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

// Payouts span every branch and expose everyone's salary, so the management
// endpoints are gated on SALARY_MANAGE (Head only). Admin's SALARY_VIEW is
// deliberately not enough to read payouts. The only exception is "/my": any
// signed-in user can read their own line, and nothing else.
const router = Router();

router.use(authenticate);

// ---------- Self-service: own payslips ----------

router.get("/my/payouts", listMySalaryPayouts);

router.get("/my/payouts/:id", getMySalaryPayout);

// ---------- Settings (optional; defaults apply when none are saved) ----------

router.get("/settings", authorize(PERMISSIONS.SALARY_MANAGE), getSalarySettings);

router.put(
  "/settings",
  authorize(PERMISSIONS.SALARY_MANAGE),
  trackActivity("SALARY", "SETTINGS_UPDATED", () => "Updated salary rules"),
  updateSalarySettings,
);

router.delete(
  "/settings",
  authorize(PERMISSIONS.SALARY_MANAGE),
  trackActivity("SALARY", "SETTINGS_RESET", () => "Reset salary rules to defaults"),
  resetSalarySettings,
);

// ---------- Payouts ----------
// Static paths must stay above "/payouts/:id".

router.get(
  "/payouts/eligible",
  authorize(PERMISSIONS.SALARY_MANAGE),
  getEligiblePayoutEmployees,
);

router.post(
  "/payouts/preview",
  authorize(PERMISSIONS.SALARY_MANAGE),
  previewSalaryPayout,
);

router.post(
  "/payouts",
  authorize(PERMISSIONS.SALARY_MANAGE),
  trackActivity(
    "SALARY",
    "PAYOUT_GENERATED",
    (req) =>
      `Generated salary payout for ${req.body?.from} to ${req.body?.to} (${req.body?.employeeIds?.length ?? 0} employees, ${
        Object.values(req.body?.overrides ?? {}).filter(
          (list) => Array.isArray(list) && list.length > 0,
        ).length
      } with manual edits)`,
  ),
  generateSalaryPayout,
);

router.get("/payouts", authorize(PERMISSIONS.SALARY_MANAGE), listSalaryPayouts);

router.get("/payouts/:id", authorize(PERMISSIONS.SALARY_MANAGE), getSalaryPayout);

router.get(
  "/payouts/:id/export",
  authorize(PERMISSIONS.SALARY_MANAGE),
  trackActivity(
    "SALARY",
    "PAYOUT_EXPORTED",
    (req) => `Exported salary payout ID: ${req.params.id}`,
  ),
  exportSalaryPayout,
);

router.patch(
  "/payouts/:id/paid",
  authorize(PERMISSIONS.SALARY_MANAGE),
  trackActivity(
    "SALARY",
    "PAYOUT_PAID",
    (req) => `Marked salary payout ID: ${req.params.id} as paid`,
  ),
  markSalaryPayoutPaid,
);

router.patch(
  "/payouts/:id/cancel",
  authorize(PERMISSIONS.SALARY_MANAGE),
  trackActivity(
    "SALARY",
    "PAYOUT_CANCELLED",
    (req) => `Cancelled salary payout ID: ${req.params.id}`,
  ),
  cancelSalaryPayout,
);

// ---------- Deductions ----------

router.get(
  "/deductions",
  authorize(PERMISSIONS.SALARY_MANAGE),
  listSalaryDeductions,
);

router.post(
  "/deductions",
  authorize(PERMISSIONS.SALARY_CREATE),
  trackActivity("SALARY", "DEDUCTION_CREATED", () => "Recorded a salary deduction"),
  createSalaryDeduction,
);

router.patch(
  "/deductions/:id/review",
  authorize(PERMISSIONS.SALARY_UPDATE),
  trackActivity(
    "SALARY",
    "DEDUCTION_REVIEWED",
    (req) => `Reviewed salary deduction ID: ${req.params.id} (${req.body?.status})`,
  ),
  reviewSalaryDeduction,
);

router.delete(
  "/deductions/:id",
  authorize(PERMISSIONS.SALARY_DELETE),
  trackActivity(
    "SALARY",
    "DEDUCTION_DELETED",
    (req) => `Deleted salary deduction ID: ${req.params.id}`,
  ),
  deleteSalaryDeduction,
);

export default router;
