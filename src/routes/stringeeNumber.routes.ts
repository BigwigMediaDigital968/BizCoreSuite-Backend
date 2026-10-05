import { Router } from "express";
import {
  createNumber,
  getNumbers,
  getMyAssignment,
  assignNumber,
  updateNumber,
} from "../controllers/stringeeNumber.controller.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";

const router = Router();

router.use(authenticate);

// 1. GET LOGGED-IN USER ASSIGNMENT (Any authenticated user can fetch their own assignment)
router.get("/my-assignment", getMyAssignment);

// 1. CREATE STRINGEE NUMBER
router.post(
  "/add",
  authorize(PERMISSIONS.STRINGEE_NUMBER_CREATE),
  trackActivity(
    "STRINGEE",
    "NUMBER_CREATED",
    (req) =>
      `Added new Stringee number: ${req.body?.number || req.body?.phone || "Unknown Number"}`,
  ),
  createNumber,
);

// 2. UPDATE STRINGEE NUMBER
router.put(
  "/:numberId",
  authorize(PERMISSIONS.STRINGEE_NUMBER_UPDATE),
  trackActivity(
    "STRINGEE",
    "NUMBER_UPDATED",
    (req) => `Updated Stringee number ID: ${req.params.numberId}`,
  ),
  updateNumber,
);

// 3. READ / LIST STRINGEE NUMBERS (Read-only)
router.get("/list", authorize(PERMISSIONS.STRINGEE_NUMBER_VIEW), getNumbers);

// 4. ASSIGN STRINGEE NUMBER
router.patch(
  "/:numberId/assign",
  authorize(PERMISSIONS.STRINGEE_NUMBER_ASSIGN),
  trackActivity(
    "STRINGEE",
    "NUMBER_ASSIGNED",
    (req) =>
      `Assigned Stringee number ID ${req.params.numberId} to user/branch: ${req.body?.assignedTo || req.body?.userId || req.body?.branchId}`,
  ),
  assignNumber,
);

export default router;
