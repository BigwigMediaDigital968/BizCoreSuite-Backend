import type {
  NextFunction,
  Request,
  Response
} from "express";

import {
  ROLE_PERMISSIONS
} from "../permissions/rolePermissions.js";

import type {
  Permission
} from "../constants/permissions.js";

import { AppError } from "../utils/AppError.js";

export const authorize = (
  requiredPermission: Permission
) => {
  return (
    req: Request,
    _res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return next(
        new AppError(
          "Authentication required",
          401,
          "AUTHENTICATION_REQUIRED"
        )
      );
    }

    const permissions =
      ROLE_PERMISSIONS[req.user.role];

    const hasPermission =
      permissions.includes(
        requiredPermission
      );

    if (!hasPermission) {
      return next(
        new AppError(
          "You do not have permission to perform this action",
          403,
          "FORBIDDEN"
        )
      );
    }

    next();
  };
};