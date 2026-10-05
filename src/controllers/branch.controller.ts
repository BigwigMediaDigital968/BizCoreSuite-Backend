import type { Request, Response } from "express";

import {
  createBranch,
  getBranches,
  updateBranch,
  updateBranchStatus,
} from "../services/branch.service.js";

import { createAuditLog } from "../services/audit.service.js";

import { getRequiredParam } from "../utils/requestParams.js";

import { auditRequest } from "../utils/audit.js";

import { AUDIT_ACTIONS } from "../constants/auditActions.js";

import { AUDIT_ENTITIES } from "../constants/auditEntities.js";
import {
  getBranchAttendanceConfig,
  updateBranchAttendanceConfig,
} from "../services/branchAttendance.service.js";
import { updateBranchAttendanceConfigSchema } from "../validators/branchAttendance.validator.js";

export const createBranchController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const branch = await createBranch(req.body, req.user.id);

  await auditRequest({
    req,

    action: AUDIT_ACTIONS.BRANCH_CREATED,

    entity: AUDIT_ENTITIES.BRANCH,

    entityId: branch._id.toString(),

    branch: branch._id.toString(),

    metadata: {
      name: branch.name,
      code: branch.code,
    },
  });

  return res.status(201).json({
    success: true,
    message: "Branch created successfully",
    data: branch,
  });
};

export const getBranchesController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const branches = await getBranches(req.user);

  return res.status(200).json({
    success: true,
    data: branches,
  });
};

export const updateBranchController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const branchId = getRequiredParam(req, "id");

  const branch = await updateBranch(branchId, req.body);

  await createAuditLog({
    actor: req.user.id,
    action: "BRANCH_UPDATED",
    entity: "Branch",
    entityId: branch._id.toString(),
    branch: branch._id.toString(),
    metadata: {
      updatedFields: Object.keys(req.body),
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: "Branch updated successfully",
    data: branch,
  });
};

export const updateBranchStatusController = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const branchId = getRequiredParam(req, "id");

  const { isActive } = req.body;

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "isActive must be a boolean",
      code: "INVALID_BRANCH_STATUS",
    });
  }

  const branch = await updateBranchStatus(branchId, isActive);

  await createAuditLog({
    actor: req.user.id,
    action: isActive ? "BRANCH_ACTIVATED" : "BRANCH_DEACTIVATED",
    entity: "Branch",
    entityId: branch._id.toString(),
    branch: branch._id.toString(),
    metadata: {
      isActive,
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: isActive
      ? "Branch activated successfully"
      : "Branch deactivated successfully",
    data: branch,
  });
};

export const getBranchAttendanceConfigController = async (
  req: Request,
  res: Response,
) => {
  const branchId = req.params.id;

  if (typeof branchId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Invalid branch ID",
      code: "INVALID_BRANCH_ID",
    });
  }

  const result = await getBranchAttendanceConfig(branchId);

  return res.status(200).json({
    success: true,
    message: "Branch attendance configuration fetched successfully",
    data: result,
  });
};

export const updateBranchAttendanceConfigController = async (
  req: Request,
  res: Response,
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const branchId = req.params.id;

  if (typeof branchId !== "string") {
    return res.status(400).json({
      success: false,
      message: "Invalid branch ID",
      code: "INVALID_BRANCH_ID",
    });
  }

  const data = updateBranchAttendanceConfigSchema.parse(req.body);

  const branch = await updateBranchAttendanceConfig(
    branchId,
    data,
    req.user.id,
  );

  await createAuditLog({
    actor: req.user.id,
    action: "BRANCH_UPDATED",
    entity: "Branch",
    entityId: branch._id.toString(),
    branch: branch._id.toString(),
    metadata: {
      type: "ATTENDANCE_CONFIGURATION_UPDATED",
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: "Branch attendance configuration updated successfully",
    data: branch.attendanceConfig,
  });
};
