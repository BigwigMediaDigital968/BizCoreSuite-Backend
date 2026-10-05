
import { Router } from "express";
import {
  loginController,
  logoutController,
  getMeController,
  refreshController,
  updateMeController,
  changeMyPasswordController,
  changeEmployeePasswordController,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

// 1. User Login
router.post(
  "/login",
  trackActivity("USER", "LOGIN", (req) => {
    return `User logged into system (${req.body?.email || "Unknown Email"})`;
  }),
  loginController,
);

// 2. Refresh Token (No tracking needed)
router.post("/refresh", refreshController);

// 3. User Logout
router.post(
  "/logout",
  authenticate,
  trackActivity("USER", "LOGOUT", (req) => {
    const user = (req as any).user;
    return `User ${user?.name || user?.email || ""} logged out`;
  }),
  logoutController,
);

// 5. Reset Another User's Password (Head / Admin — gated on USER_UPDATE)
router.patch(
  "/update-password/:id",
  authenticate,
  authorize(PERMISSIONS.USER_UPDATE),
  trackActivity("USER", "PASSWORD_CHANGED", (req) => {
    const user = (req as any).user;
    return `${user?.name || user?.email || "User"} reset the password of user ${req.params.id}`;
  }),
  changeEmployeePasswordController,
);


// Read-only / Test Routes (No tracking needed)
router.get("/me", authenticate, getMeController);

// 4. Update Own Profile (name only — email changes go through admin user management)
router.patch(
  "/me",
  authenticate,
  trackActivity("USER", "UPDATE_OWN_PROFILE", (req) => {
    const user = (req as any).user;
    return `${user?.name || user?.email || "User"} updated their own profile`;
  }),
  updateMeController,
);

// 5. Change Own Password
router.patch(
  "/me/password",
  authenticate,
  trackActivity("USER", "PASSWORD_CHANGED", (req) => {
    const user = (req as any).user;
    return `${user?.name || user?.email || "User"} changed their own password`;
  }),
  changeMyPasswordController,
);

router.get(
  "/test-branch-permission",
  authenticate,
  authorize(PERMISSIONS.BRANCH_CREATE),
  (_req, res) => {
    res.json({
      success: true,
      message: "You have branch creation permission",
    });
  },
);

export default router;
