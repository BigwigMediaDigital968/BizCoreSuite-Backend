import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { uploadMedia } from "../config/cloudinary.js";
import {
  launchContestHandler,
  getMyBranchContestsHandler,
  getContestByIdHandler,
  updateContestHandler,
  toggleContestStatusHandler,
  getAllContestsHandler
} from "../controllers/contest.controller.js";

const router = Router();

router.use(authenticate);

// Head launches contest with optional PDF/Image/Video file. authorize() runs
// before the multer upload so a non-Head caller is rejected before any file
// is sent to Cloudinary, not after (the service-layer role check alone let
// any authenticated user trigger a real upload that was then discarded).
router.post(
  "/",
  authorize(PERMISSIONS.CONTEST_CREATE),
  uploadMedia.single("media"),
  launchContestHandler,
);

router.get("/all", authorize(PERMISSIONS.CONTEST_VIEW_ALL), getAllContestsHandler);

// Employees/Branch Users fetch active contests for their assigned branch
router.get("/my-branch", getMyBranchContestsHandler);

// Fetch a single contest (Head/Admin: any; everyone else: own-branch only)
router.get("/:id", getContestByIdHandler);

// Update Contest Details or Media File (Head Only)
router.patch(
  "/:id",
  authorize(PERMISSIONS.CONTEST_UPDATE),
  uploadMedia.single("media"),
  updateContestHandler,
);

// Toggle Active / Inactive Status (Head Only)
router.patch(
  "/:id/status",
  authorize(PERMISSIONS.CONTEST_UPDATE),
  toggleContestStatusHandler,
);

export default router;
