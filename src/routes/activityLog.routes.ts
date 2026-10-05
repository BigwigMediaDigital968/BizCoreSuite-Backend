import { Router } from "express";
import { getActivityLogs } from "../controllers/activityLog.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

router.use(authenticate);

// Main route requiring primary Activity View permission
router.get("/", authorize(PERMISSIONS.ACTIVITY_LOG_VIEW), getActivityLogs);

export default router;