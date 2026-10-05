import type { Request, Response } from "express";

import { createAuditLog } from "../services/audit.service.js";

import {
  createUser,
  updateUserBranches,
  getUsers,
  updateUser,
  updateUserStatus,
  getUserById,
} from "../services/user.service.js";

import type { UserListQuery } from "../types/user.js";
import {
  updateUserSchema,
  updateUserStatusSchema,
} from "../validators/user.validator.js";
import { AUDIT_ACTIONS } from "../constants/auditActions.js";
import { auditRequest } from "../utils/audit.js";
import { AUDIT_ENTITIES } from "../constants/auditEntities.js";

export const createUserController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const user = await createUser(req.body, req.user.id, req.user.role);

  await auditRequest({
    req,

    action: AUDIT_ACTIONS.USER_CREATED,

    entity: AUDIT_ENTITIES.USER,

    entityId: user._id.toString(),

    metadata: {
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });

  return res.status(201).json({
    success: true,
    message: "User created successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      branches: user.branches,
      isActive: user.isActive,
    },
  });
};

export const updateUserBranchesController = async (
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

  const { branches } = req.body;

  if (!Array.isArray(branches)) {
    return res.status(400).json({
      success: false,
      message: "branches must be an array",
      code: "INVALID_BRANCHES",
    });
  }

  const user = await updateUserBranches(
    req.params.id as string,
    branches,
    req.user.id,
    req.user.role,
  );

  await auditRequest({
    req,

    action: AUDIT_ACTIONS.USER_CREATED,

    entity: AUDIT_ENTITIES.USER,

    entityId: user._id.toString(),

    metadata: {
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });

  return res.status(200).json({
    success: true,
    message: "User branches updated successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      branches: user.branches,
      isActive: user.isActive,
    },
  });
};

export const getUsersController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const result = await getUsers(
    req.query as unknown as UserListQuery,
    req.user.id,
    req.user.role,
  );

  return res.status(200).json({
    success: true,
    message: "Users fetched successfully",
    data: result.users,
    pagination: result.pagination,
  });
};

export const getUserByIdController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const userId = req.params.id as string;

  const user = await getUserById(userId, req.user.id, req.user.role);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
      code: "USER_NOT_FOUND",
    });
  }

  return res.status(200).json({
    success: true,
    message: "User fetched successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      branches: user.branches,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
};

export const updateUserController = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "AUTHENTICATION_REQUIRED",
    });
  }

  const parsed = updateUserSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
      code: "VALIDATION_ERROR",
      errors: parsed.error.flatten(),
    });
  }

  const user = await updateUser(
    req.params.id as string,
    parsed.data,
    req.user.id,
    req.user.role,
  );

  await createAuditLog({
    actor: req.user.id,
    action: "USER_UPDATED",
    entity: "User",
    entityId: user.id.toString(),
    metadata: {
      updatedFields: Object.keys(parsed.data),
      role: user.role,
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: "User updated successfully",
    data: user,
  });
};

export const updateUserStatusController = async (
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

  const parsed = updateUserStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
      code: "VALIDATION_ERROR",
      errors: parsed.error.flatten(),
    });
  }

  const user = await updateUserStatus(
    req.params.id as string,
    parsed.data.isActive,
    req.user.id,
    req.user.role,
  );

  await createAuditLog({
    actor: req.user.id,
    action: user.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entity: "User",
    entityId: user._id.toString(),
    metadata: {
      isActive: user.isActive,
    },
    ipAddress: req.ip,
    userAgent: req.get("user-agent"),
  });

  return res.status(200).json({
    success: true,
    message: user.isActive
      ? "User activated successfully"
      : "User deactivated successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      branches: user.branches,
      isActive: user.isActive,
    },
  });
};
