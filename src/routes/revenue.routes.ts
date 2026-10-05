// // src/routes/revenue.routes.ts
// import { Router } from "express";
// import { authenticate } from "../middleware/auth.middleware.js";
// import { authorize } from "../middleware/authorize.middleware.js";
// import { PERMISSIONS } from "../constants/permissions.js";
// import {
//   createRevenueHandler,
//   getRevenueReportHandler,
//   updateRevenueStatusHandler,
//   getTotalRevenueHandler,
// } from "../controllers/revenue.controller.js";

// const router = Router();

// router.use(authenticate);

// // Create Revenue Entry
// router.post("/", authorize(PERMISSIONS.REVENUE_CREATE), createRevenueHandler);

// router.get(
//   "/total",
//   authorize(PERMISSIONS.REVENUE_VIEW),
//   getTotalRevenueHandler,
// );

// // View Flexible Revenue Reports (Supports viewMode = INDIVIDUAL | TEAM | BRANCH | LEAD)
// router.get(
//   "/report",
//   authorize(PERMISSIONS.REVENUE_VIEW),
//   getRevenueReportHandler,
// );

// // Admin / Head Verification API
// router.patch(
//   "/:id/status",
//   authorize(PERMISSIONS.REVENUE_MANAGE),
//   updateRevenueStatusHandler,
// );

// export default router;

import { Router } from "express";
import { Types } from "mongoose";
import { Revenue } from "../models/Revenue.js";
import { User } from "../models/User.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  createRevenueHandler,
  getRevenueReportHandler,
  updateRevenueStatusHandler,
  updateRevenueEntryHandler,
  getTotalRevenueHandler,
} from "../controllers/revenue.controller.js";

const router = Router();

router.use(authenticate);

const formatInr = (amount: unknown) =>
  `₹${Number(amount || 0).toLocaleString("en-IN")}`;

// Human-readable summary of a revenue entry for activity logs, e.g.
// `₹10,000 for "Acme" (logged by anshu <anshu@bigwig.com>)`
const describeRevenue = async (id: string) => {
  const revenue = Types.ObjectId.isValid(id)
    ? await Revenue.findById(id)
        .select("amount clientName employee")
        .populate<{ employee: { name: string; email: string } | null }>(
          "employee",
          "name email",
        )
        .lean()
    : null;
  if (!revenue) return `revenue entry ID ${id}`;

  const owner = revenue.employee
    ? ` (logged by ${revenue.employee.name} <${revenue.employee.email}>)`
    : "";
  return `${formatInr(revenue.amount)} for "${revenue.clientName}"${owner}`;
};

// 1. CREATE REVENUE ENTRY
router.post(
  "/",
  authorize(PERMISSIONS.REVENUE_CREATE),
  trackActivity("REVENUE", "CREATED", async (req) => {
    const employeeId = req.body?.employeeId || req.user?.id;
    const employee =
      employeeId && Types.ObjectId.isValid(employeeId)
        ? await User.findById(employeeId).select("name email").lean()
        : null;
    const owner = employee ? ` for ${employee.name} <${employee.email}>` : "";
    const client = req.body?.clientName ? ` — client "${req.body.clientName}"` : "";
    return `Created revenue entry of ${formatInr(req.body?.amount)}${owner}${client}`;
  }),
  createRevenueHandler,
);

// 2. READ / REPORT ENDPOINTS (Read-only)
router.get(
  "/total",
  authorize(PERMISSIONS.REVENUE_VIEW),
  getTotalRevenueHandler,
);

router.get(
  "/report",
  authorize(PERMISSIONS.REVENUE_VIEW),
  getRevenueReportHandler,
);

// 3. VERIFY / UPDATE REVENUE STATUS
router.patch(
  "/:id/status",
  authorize(PERMISSIONS.REVENUE_MANAGE),
  trackActivity(
    "REVENUE",
    "VERIFIED",
    async (req) =>
      `Marked ${await describeRevenue(String(req.params.id))} as '${req.body?.status}'`,
  ),
  updateRevenueStatusHandler,
);

// 4. EDIT REVENUE ENTRY (owner while PENDING, seniors any time — enforced in service)
router.patch(
  "/:id",
  authorize(PERMISSIONS.REVENUE_UPDATE),
  trackActivity(
    "REVENUE",
    "UPDATED",
    async (req) =>
      `Edited revenue entry ${await describeRevenue(String(req.params.id))}`,
  ),
  updateRevenueEntryHandler,
);

export default router;
