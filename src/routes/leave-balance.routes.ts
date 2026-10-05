import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";

import { PERMISSIONS } from "../constants/permissions.js";

import {
  getLeaveBalancesController,
  getEmployeeLeaveBalancesController,
  getLeaveBalanceTransactionsController,
  adjustLeaveBalanceController,
  allocateLeaveBalanceController,
} from "../controllers/leave-balance.controller.js";

const router = Router();

// 1. ALLOCATE LEAVE BALANCES
router.post(
  "/allocate",
  authenticate,
  authorize(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  trackActivity(
    "LEAVE",
    "BALANCE_ALLOCATED",
    (req) =>
      `Allocated leave balance for employee: ${req.body?.employeeId || "Bulk/All Users"}`,
  ),
  allocateLeaveBalanceController,
);

// 2. READ / LIST LEAVE BALANCES
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAVE_BALANCE_VIEW),
  getLeaveBalancesController,
);

router.get(
  "/:employeeId/transactions",
  authenticate,
  authorize(PERMISSIONS.LEAVE_BALANCE_TRANSACTION_VIEW),
  getLeaveBalanceTransactionsController,
);

// 3. ADJUST LEAVE BALANCE
router.post(
  "/:id/adjust",
  authenticate,
  authorize(PERMISSIONS.LEAVE_BALANCE_MANAGE),
  trackActivity(
    "LEAVE",
    "BALANCE_ADJUSTED",
    (req) =>
      `Adjusted leave balance (ID: ${req.params.id}) by ${req.body?.amount || 0} days`,
  ),
  adjustLeaveBalanceController,
);

// 4. READ EMPLOYEE LEAVE BALANCE DETAILS
router.get(
  "/:employeeId",
  authenticate,
  authorize(PERMISSIONS.LEAVE_BALANCE_VIEW),
  getEmployeeLeaveBalancesController,
);

export default router;
