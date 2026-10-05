// import { Router } from "express";

// import { authenticate } from "../middleware/auth.middleware.js";

// import { authorize } from "../middleware/authorize.middleware.js";

// import { PERMISSIONS } from "../constants/permissions.js";

// import {
//   createEmployeeController,
//   getEmployeeController,
//   listEmployeesController,
//   updateEmployeeController,
//   getBranchEmployeeCountController,
// } from "../controllers/employee.controller.js";

// const router = Router();

// router.post(
//   "/",
//   authenticate,
//   authorize(PERMISSIONS.EMPLOYEE_CREATE),
//   createEmployeeController,
// );

// router.get(
//   "/branch/:branchId/count",
//   authenticate,
//   authorize(PERMISSIONS.EMPLOYEE_VIEW),
//   getBranchEmployeeCountController,
// );

// router.patch(
//   "/:id",
//   authenticate,
//   authorize(PERMISSIONS.EMPLOYEE_UPDATE),
//   updateEmployeeController,
// );

// router.get(
//   "/",
//   authenticate,
//   authorize(PERMISSIONS.EMPLOYEE_VIEW),
//   listEmployeesController,
// );

// router.get(
//   "/:id",
//   authenticate,
//   authorize(PERMISSIONS.EMPLOYEE_VIEW),
//   getEmployeeController,
// );

// export default router;

import { Router } from "express";
import { Types } from "mongoose";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { trackActivity } from "../middleware/auditLogger.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import {
  createEmployeeController,
  getEmployeeController,
  listEmployeesController,
  updateEmployeeController,
  getBranchEmployeeCountController,
} from "../controllers/employee.controller.js";

const router = Router();

// Mutation Routes (Tracked via trackActivity middleware)

// 1. Create Employee Profile
router.post(
  "/",
  authenticate,
  authorize(PERMISSIONS.EMPLOYEE_CREATE),
  trackActivity(
    "EMPLOYEE",
    "CREATED",
    (req) =>
      `Created employee profile for ${req.body?.name || req.body?.email || "New Employee"}`,
  ),
  createEmployeeController,
);

// 2. Update Employee Details
router.patch(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.EMPLOYEE_UPDATE),
  trackActivity("EMPLOYEE", "UPDATED", async (req) => {
    // :id may be a profile ID or a user ID (the service accepts both)
    const id = String(req.params.id);
    const profile = Types.ObjectId.isValid(id)
      ? await EmployeeProfile.findOne({
          $or: [{ _id: new Types.ObjectId(id) }, { user: new Types.ObjectId(id) }],
        })
          .select("user")
          .populate<{ user: { name: string; email: string } | null }>(
            "user",
            "name email",
          )
          .lean()
      : null;
    return profile?.user
      ? `Updated employee profile for ${profile.user.name} (${profile.user.email})`
      : `Updated employee profile for ID: ${id}`;
  }),
  updateEmployeeController,
);

// Read-Only Routes (No activity logging needed)

// 3. Get Branch Employee Count
router.get(
  "/branch/:branchId/count",
  authenticate,
  authorize(PERMISSIONS.EMPLOYEE_VIEW),
  getBranchEmployeeCountController,
);

// 4. List All Employees
router.get(
  "/",
  authenticate,
  authorize(PERMISSIONS.EMPLOYEE_VIEW),
  listEmployeesController,
);

// 5. Get Employee By ID
router.get(
  "/:id",
  authenticate,
  authorize(PERMISSIONS.EMPLOYEE_VIEW),
  getEmployeeController,
);

export default router;
