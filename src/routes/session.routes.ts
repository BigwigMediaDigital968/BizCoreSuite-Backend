import { Router } from "express";

import {
  authenticate,
} from "../middleware/auth.middleware.js";

import {
  getSessionsController,
  revokeSessionController,
  revokeAllSessionsController,
} from "../controllers/session.controller.js";

const router =
  Router();

router.get(
  "/",
  authenticate,
  getSessionsController,
);

router.delete(
  "/:id",
  authenticate,
  revokeSessionController,
);

router.delete(
  "/",
  authenticate,
  revokeAllSessionsController,
);

export default router;