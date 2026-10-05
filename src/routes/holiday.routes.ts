// import { Router } from "express";

// import {
//   createHolidayController,
//   getBranchHolidaysController,
//   updateHolidayController,
//   deleteHolidayController,
// } from "../controllers/holiday.controller.js";

// import { authenticate } from "../middleware/auth.middleware.js";

// import { authorize } from "../middleware/authorize.middleware.js";

// import { requireBranchAccess } from "../middleware/branch.middleware.js";

// import { PERMISSIONS } from "../constants/permissions.js";

// const router = Router();

// router.post(
//   "/",
//   authenticate,
//   authorize(PERMISSIONS.HOLIDAY_CREATE),
//   requireBranchAccess((req) =>
//     typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
//   ),
//   createHolidayController,
// );

// router.get(
//   "/branch/:branchId",
//   authenticate,
//   authorize(PERMISSIONS.HOLIDAY_VIEW),
//   requireBranchAccess((req) =>
//     typeof req.params.branchId === "string" ? req.params.branchId : undefined,
//   ),
//   getBranchHolidaysController,
// );

// router.patch(
//   "/:id",
//   authenticate,
//   authorize(PERMISSIONS.HOLIDAY_UPDATE),
//   updateHolidayController,
// );

// router.delete(
//   "/:id",
//   authenticate,
//   authorize(PERMISSIONS.HOLIDAY_DELETE),
//   deleteHolidayController,
// );

// export default router;

import { Router } from "express";
import {
  createHolidayController,
  getBranchHolidaysController,
  updateHolidayController,
  deleteHolidayController,
} from "../controllers/holiday.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { requireBranchAccess } from "../middleware/branch.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

// 1. CREATE HOLIDAY
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.HOLIDAY_CREATE),
  requireBranchAccess((req) =>
    typeof req.body?.branchId === "string" ? req.body.branchId : undefined,
  ),
  trackActivity(
    "HOLIDAY",
    "CREATED",
    (req) =>
      `Created holiday '${req.body?.title || req.body?.name || "Unnamed Holiday"}' for branch ID: ${req.body?.branchId}`,
  ),
  createHolidayController,
);

// 2. READ / LIST BRANCH HOLIDAYS (Read-only)
router.get(
  "/branch/:branchId",
  authenticate,
  authorize(PERMISSIONS.HOLIDAY_VIEW),
  requireBranchAccess((req) =>
    typeof req.params.branchId === "string" ? req.params.branchId : undefined,
  ),
  getBranchHolidaysController,
);

// 3. UPDATE HOLIDAY
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.HOLIDAY_UPDATE),
  trackActivity(
    "HOLIDAY",
    "UPDATED",
    (req) => `Updated details for holiday ID: ${req.params.id}`,
  ),
  updateHolidayController,
);

// 4. DELETE HOLIDAY
router.delete(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.HOLIDAY_DELETE),
  trackActivity(
    "HOLIDAY",
    "DELETED",
    (req) => `Deleted holiday ID: ${req.params.id}`,
  ),
  deleteHolidayController,
);

export default router;
