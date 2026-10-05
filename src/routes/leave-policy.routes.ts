// import { Router } from "express";

// import { authenticate } from "../middleware/auth.middleware.js";
// import { authorize } from "../middleware/authorize.middleware.js";

// import { PERMISSIONS } from "../constants/permissions.js";

// import {
//   createLeavePolicyController,
//   listLeavePoliciesController,
//   getLeavePolicyController,
//   updateLeavePolicyController,
//   deactivateLeavePolicyController,
// } from "../controllers/leave-policy.controller.js";

// const router = Router();

// router.post(
//   "/",
//   authenticate,
//   authorize(PERMISSIONS.LEAVE_POLICY_CREATE),
//   createLeavePolicyController,
// );

// router.get(
//   "/",
//   authenticate,
//   authorize(PERMISSIONS.LEAVE_POLICY_VIEW),
//   listLeavePoliciesController,
// );

// router.get(
//   "/:id",
//   authenticate,
//   authorize(PERMISSIONS.LEAVE_POLICY_VIEW),
//   getLeavePolicyController,
// );

// router.patch(
//   "/:id",
//   authenticate,
//   authorize(PERMISSIONS.LEAVE_POLICY_UPDATE),
//   updateLeavePolicyController,
// );

// router.patch(
//   "/:id/deactivate",
//   authenticate,
//   authorize(PERMISSIONS.LEAVE_POLICY_UPDATE),
//   deactivateLeavePolicyController,
// );

// export default router;

import { Router } from "express";

import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";

import { PERMISSIONS } from "../constants/permissions.js";

import {
  createLeavePolicyController,
  listLeavePoliciesController,
  getLeavePolicyController,
  updateLeavePolicyController,
  deactivateLeavePolicyController,
} from "../controllers/leave-policy.controller.js";

const router = Router();

// 1. CREATE LEAVE POLICY
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAVE_POLICY_CREATE),
  trackActivity(
    "LEAVE",
    "POLICY_CREATED",
    (req) =>
      `Created new leave policy: '${req.body?.name || "Unnamed Policy"}'`,
  ),
  createLeavePolicyController,
);

// 2. READ / LIST LEAVE POLICIES
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.LEAVE_POLICY_VIEW),
  listLeavePoliciesController,
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.LEAVE_POLICY_VIEW),
  getLeavePolicyController,
);

// 3. UPDATE LEAVE POLICY
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.LEAVE_POLICY_UPDATE),
  trackActivity(
    "LEAVE",
    "POLICY_UPDATED",
    (req) => `Updated details for leave policy ID: ${req.params.id}`,
  ),
  updateLeavePolicyController,
);

// 4. DEACTIVATE LEAVE POLICY
router.patch(
  "/:id/deactivate",
  authenticate,
  authorize(PERMISSIONS.LEAVE_POLICY_UPDATE),
  trackActivity(
    "LEAVE",
    "POLICY_DEACTIVATED",
    (req) => `Deactivated leave policy ID: ${req.params.id}`,
  ),
  deactivateLeavePolicyController,
);

export default router;
