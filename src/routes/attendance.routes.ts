import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import {
  checkInController,
  checkOutController,
  getAttendanceController,
  getAttendanceReportController,
} from "../controllers/attendance.controller.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

// Mutation Routes (Tracked via trackActivity middleware)

// 1. Employee Check-In
router.post(
  "/check-in",
  authenticate,
  authorize(PERMISSIONS.ATTENDANCE_CHECK_IN),
  trackActivity("ATTENDANCE", "CHECK_IN", (req) => {
    const user = (req as any).user;
    return `Employee ${user?.name || user?.email || ""} checked in successfully`;
  }),
  checkInController,
);

// 2. Employee Check-Out
router.post(
  "/check-out",
  authenticate,
  authorize(PERMISSIONS.ATTENDANCE_CHECK_OUT),
  trackActivity("ATTENDANCE", "CHECK_OUT", (req) => {
    const user = (req as any).user;
    return `Employee ${user?.name || user?.email || ""} checked out successfully`;
  }),
  checkOutController,
);

// Read-Only Routes (No tracking needed)

// 3. View Attendance Records
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.ATTENDANCE_VIEW),
  getAttendanceController,
);

// 4. View Attendance Summary Report
router.get(
  "/reports/summary",
  authenticate,
  authorize(PERMISSIONS.ATTENDANCE_REPORT),
  getAttendanceReportController,
);

export default router;
