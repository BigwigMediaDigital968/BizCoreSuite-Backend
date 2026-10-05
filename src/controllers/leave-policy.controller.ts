import type { NextFunction, Request, Response } from "express";

import {
  createLeavePolicySchema,
  updateLeavePolicySchema,
  leavePolicyListQuerySchema,
} from "../validators/leave-policy.validator.js";

import {
  createLeavePolicy,
  getLeavePolicyById,
  listLeavePolicies,
  updateLeavePolicy,
  deactivateLeavePolicy,
} from "../services/leave-policy.service.js";
import { AppError } from "../utils/AppError.js";

export const createLeavePolicyController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const data = createLeavePolicySchema.parse(req.body);

    const policy = await createLeavePolicy(data, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Leave policy created successfully",
      data: {
        policy,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listLeavePoliciesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = leavePolicyListQuerySchema.parse(req.query);

    const result = await listLeavePolicies({
      ...query,
      isActive:
        query.isActive === "true"
          ? true
          : query.isActive === "false"
            ? false
            : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getLeavePolicyController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const policy = await getLeavePolicyById(req.params.id as string);

    return res.status(200).json({
      success: true,
      data: {
        policy,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateLeavePolicyController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const data = updateLeavePolicySchema.parse(req.body);

    const policy = await updateLeavePolicy(
      req.params.id as string,
      data,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      message: "Leave policy updated successfully",
      data: {
        policy,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deactivateLeavePolicyController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const policy = await deactivateLeavePolicy(
      req.params.id as string,
      req.user.id,
    );

    return res.status(200).json({
      success: true,
      message: "Leave policy deactivated successfully",
      data: {
        policy,
      },
    });
  } catch (error) {
    next(error);
  }
};
