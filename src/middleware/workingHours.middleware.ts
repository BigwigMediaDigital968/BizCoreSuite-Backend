import type { Request, Response, NextFunction } from "express";
import { checkAccessPermission } from "../services/lateCheckIn.service.js";

export const enforceWorkingHours = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) return next();

    const branchId = req.user.branches?.[0]?.toString();
    const access = await checkAccessPermission(
      req.user.id,
      req.user.role,
      branchId,
    );

    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        code: "AFTER_HOURS_LOCKOUT",
        message: access.message,
        reasonRequired: access.reasonRequired,
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};
