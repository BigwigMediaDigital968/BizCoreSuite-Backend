import type { NextFunction, Request, Response } from "express";

import { auditLogQuerySchema } from "../validators/audit.validator.js";

import { getAuditLogs } from "../services/audit.service.js";

import { ROLES } from "../constants/roles.js";

import { AppError } from "../utils/AppError.js";

export const getAuditLogsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    const query = auditLogQuerySchema.parse(req.query);

    const allowedBranchIds =
      req.user.role === ROLES.HEAD ? undefined : req.user.branches;

    const result = await getAuditLogs(query, allowedBranchIds);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
