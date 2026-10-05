import { Router } from "express";
import {
  createBranchController,
  getBranchAttendanceConfigController,
  getBranchesController,
  updateBranchAttendanceConfigController,
  updateBranchController,
  updateBranchStatusController,
} from "../controllers/branch.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { requireBranchAccess } from "../middleware/branch.middleware.js";
import { getRequiredParam } from "../utils/requestParams.js";

const router = Router();

// 1. CREATE BRANCH
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.BRANCH_CREATE),
  trackActivity(
    "BRANCH",
    "CREATED",
    (req) => `Created new branch: ${req.body?.name || "Unnamed Branch"}`,
  ),
  createBranchController,
);

// 2. READ / LIST BRANCHES
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.BRANCH_VIEW),
  getBranchesController,
);

// 3. UPDATE BRANCH
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.BRANCH_UPDATE),
  requireBranchAccess((req) => getRequiredParam(req, "id")),
  trackActivity(
    "BRANCH",
    "UPDATED",
    (req) => `Updated details for branch ID: ${req.params.id}`,
  ),
  updateBranchController,
);

// 4. ACTIVATE / DEACTIVATE BRANCH
router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.BRANCH_UPDATE),
  requireBranchAccess((req) => getRequiredParam(req, "id")),
  trackActivity(
    "BRANCH",
    "STATUS_UPDATED",
    (req) =>
      `Updated status for branch ID: ${req.params.id} to '${req.body?.isActive ?? req.body?.status}'`,
  ),
  updateBranchStatusController,
);

// 5. READ BRANCH ATTENDANCE CONFIG
router.get(
  "/:id/attendance-config",
  authenticate,
  authorize(PERMISSIONS.BRANCH_ATTENDANCE_VIEW),
  requireBranchAccess((req) =>
    typeof req.params.id === "string" ? req.params.id : undefined,
  ),
  getBranchAttendanceConfigController,
);

// 6. UPDATE BRANCH ATTENDANCE CONFIG
router.patch(
  "/:id/attendance-config",
  authenticate,
  authorize(PERMISSIONS.BRANCH_ATTENDANCE_UPDATE),
  requireBranchAccess((req) =>
    typeof req.params.id === "string" ? req.params.id : undefined,
  ),
  trackActivity(
    "BRANCH",
    "UPDATED",
    (req) => `Updated attendance configuration for branch ID: ${req.params.id}`,
  ),
  updateBranchAttendanceConfigController,
);

export default router;
