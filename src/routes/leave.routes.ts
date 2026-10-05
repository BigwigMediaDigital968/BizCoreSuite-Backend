import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";

import { PERMISSIONS } from "../constants/permissions.js";

import {
  createLeaveRequestController,
  getLeaveRequestController,
  listLeaveRequestsController,
  updateLeaveRequestController,
  cancelLeaveRequestController,
  approveLeaveRequestController,
  rejectLeaveRequestController,
} from "../controllers/leave.controller.js";

const router = Router();

// 1. CREATE LEAVE REQUEST
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAVE_CREATE),
  trackActivity(
    "LEAVE",
    "CREATED",
    (req) =>
      `Submitted new leave request (${req.body?.leaveType || "Leave"}) from ${req.body?.startDate} to ${req.body?.endDate}`,
  ),
  createLeaveRequestController,
);

// 2. READ / LIST LEAVE REQUESTS
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAVE_VIEW),
  listLeaveRequestsController,
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.LEAVE_VIEW),
  getLeaveRequestController,
);

// 3. UPDATE LEAVE REQUEST
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.LEAVE_UPDATE),
  trackActivity(
    "LEAVE",
    "UPDATED",
    (req) => `Updated details for leave request ID: ${req.params.id}`,
  ),
  updateLeaveRequestController,
);

// 4. CANCEL LEAVE REQUEST
router.post(
  "/:id/cancel",
  authenticate,
  authorize(PERMISSIONS.LEAVE_CANCEL),
  trackActivity(
    "LEAVE",
    "CANCELLED",
    (req) => `Cancelled leave request ID: ${req.params.id}`,
  ),
  cancelLeaveRequestController,
);

// 5. APPROVE LEAVE REQUEST
router.post(
  "/:id/approve",
  authenticate,
  authorize(PERMISSIONS.LEAVE_APPROVE),
  trackActivity(
    "LEAVE",
    "APPROVED",
    (req) => `Approved leave request ID: ${req.params.id}`,
  ),
  approveLeaveRequestController,
);

// 6. REJECT LEAVE REQUEST
router.post(
  "/:id/reject",
  authenticate,
  authorize(PERMISSIONS.LEAVE_REJECT),
  trackActivity(
    "LEAVE",
    "REJECTED",
    (req) => `Rejected leave request ID: ${req.params.id}`,
  ),
  rejectLeaveRequestController,
);

export default router;
