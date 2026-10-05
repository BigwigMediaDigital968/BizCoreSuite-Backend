import { Router } from "express";
import {
  createUserController,
  getUsersController,
  updateUserBranchesController,
  updateUserController,
  updateUserStatusController,
  getUserByIdController,
} from "../controllers/user.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { User } from "../models/User.js";

const router = Router();

// Read Routes (No activity logging needed)
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.USER_VIEW),
  getUsersController,
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.USER_VIEW),
  getUserByIdController,
);

// Mutation Routes (Tracked via trackActivity middleware)

// 1. Create User
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.USER_CREATE),
  trackActivity(
    "USER",
    "CREATE_USER",
    (req) => `Created new user account for ${req.body.name || req.body.email}`,
  ),
  createUserController,
);

// 2. Assign/Update User Branches
router.patch(
  "/:id/branches",
  authenticate,
  authorize(PERMISSIONS.USER_ASSIGN_BRANCH),
  trackActivity(
    "USER",
    "ASSIGN_BRANCH",
    async (req) => {
      const target = await User.findById(req.params.id).select("name email");
      return target
        ? `Updated assigned branches for ${target.name} (${target.email})`
        : `Updated assigned branches for user ID: ${req.params.id}`;
    },
  ),
  updateUserBranchesController,
);

// 3. Update User Profile
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.USER_UPDATE),
  trackActivity(
    "USER",
    "UPDATE_USER",
    (req) => `Updated profile details for user ID: ${req.params.id}`,
  ),
  updateUserController,
);

// 4. Update User Active Status
router.patch(
  "/:id/status",
  authenticate,
  authorize(PERMISSIONS.USER_STATUS_UPDATE),
  trackActivity(
    "USER",
    "UPDATE_STATUS",
    (req) =>
      `Changed active status to '${req.body.isActive}' for user ID: ${req.params.id}`,
  ),
  updateUserStatusController,
);

export default router;
