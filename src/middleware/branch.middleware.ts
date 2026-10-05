import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { ROLES } from "../constants/roles.js";

export const requireBranchAccess = (
  branchIdResolver: (
    req: Request,
  ) => string | undefined,
) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message:
            "Authentication required",
          code:
            "AUTHENTICATION_REQUIRED",
        });
      }

      const branchId =
        branchIdResolver(req);

      if (!branchId) {
        return res.status(400).json({
          success: false,
          message:
            "Branch ID is required",
          code:
            "BRANCH_ID_REQUIRED",
        });
      }

      /*
       * HEAD has global branch access.
       */
      if (
        req.user.role ===
        ROLES.HEAD
      ) {
        return next();
      }

      /*
       * Other roles must have
       * the branch assigned to them.
       */
      const hasAccess =
        req.user.branches.some(
          (branch) =>
            branch.toString() ===
            branchId.toString(),
        );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have access to this branch",
          code:
            "BRANCH_ACCESS_DENIED",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};