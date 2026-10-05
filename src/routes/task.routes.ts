import { Router } from "express";
import {
  createTaskController,
  getTasksController,
  getTaskByIdController,
  updateTaskController,
  getTaskActivitiesController,
} from "../controllers/task.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

// 1. CREATE TASK
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.TASK_CREATE),
  trackActivity(
    "TASK",
    "CREATED",
    (req) =>
      `Created new task: '${req.body?.title || req.body?.name || "Unnamed Task"}'`,
  ),
  createTaskController,
);

// 2. READ / LIST TASKS & ACTIVITIES
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.TASK_VIEW),
  getTasksController,
);

router.get(
  "/:id/activities",
  authenticate,
  authorize(PERMISSIONS.TASK_VIEW),
  getTaskActivitiesController,
);

router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.TASK_VIEW),
  getTaskByIdController,
);

// 3. UPDATE TASK
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.TASK_UPDATE),
  trackActivity(
    "TASK",
    "UPDATED",
    (req) => `Updated task ID: ${req.params.id}`,
  ),
  updateTaskController,
);

export default router;
