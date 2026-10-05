import type { Request, Response } from "express";

import {
  createLeaveRequest,
  getLeaveRequestById,
  listLeaveRequests,
  updateLeaveRequest,
  cancelLeaveRequest,
} from "../services/leave.service.js";

import {
  createLeaveRequestSchema,
  leaveRequestListQuerySchema,
  updateLeaveRequestSchema,
} from "../validators/leave-request.validator.js";

import {
  approveLeaveRequest,
  rejectLeaveRequest,
} from "../services/leave-approval.service.js";

import { rejectLeaveSchema } from "../validators/leave-approval.validator.js";

export const createLeaveRequestController = async (
  req: Request,
  res: Response,
) => {
  const parsed = createLeaveRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten(),
    });
  }

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const request = await createLeaveRequest(
    {
      employeeId: userId,
      leavePolicyId: parsed.data.leavePolicyId,
      leaveType: parsed.data.leaveType,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      durationType: parsed.data.durationType,
      reason: parsed.data.reason,
    },
    userId,
  );

  return res.status(201).json({
    success: true,
    message: "Leave request created successfully",
    data: request,
  });
};

export const getLeaveRequestController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid leave request ID",
    });
  }

  const request = await getLeaveRequestById(id);

  return res.status(200).json({
    success: true,
    data: request,
  });
};

export const listLeaveRequestsController = async (
  req: Request,
  res: Response,
) => {
  const parsed = leaveRequestListQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid query parameters",
      errors: parsed.error.flatten(),
    });
  }

  const user = req.user;

  if (!user?.id || !user?.role) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  // ✅ Extract single branch ID string safely
  const branchId =
    user.branchId ??
    (Array.isArray(user.branches) ? user.branches[0] : user.branches);

  const result = await listLeaveRequests({
    filters: parsed.data,
    userContext: {
      id: user.id,
      role: user.role.toUpperCase(),
      branchId,
    },
  });

  return res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const updateLeaveRequestController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid leave request ID",
    });
  }

  // ✅ Parse with updateLeaveRequestSchema directly
  const parsed = updateLeaveRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten(),
    });
  }

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const request = await updateLeaveRequest(id, parsed.data, userId);

  return res.status(200).json({
    success: true,
    message: "Leave request updated successfully",
    data: request,
  });
};

export const cancelLeaveRequestController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid leave request ID",
    });
  }

  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const request = await cancelLeaveRequest(id, userId);

  return res.status(200).json({
    success: true,
    message: "Leave request cancelled successfully",
    data: request,
  });
};

export const approveLeaveRequestController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid leave request ID",
    });
  }

  const approverId = req.user?.id;

  if (!approverId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const request = await approveLeaveRequest({
    leaveRequestId: id,
    approverId,
  });

  return res.status(200).json({
    success: true,
    message: "Leave request approved successfully",
    data: request,
  });
};

export const rejectLeaveRequestController = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid leave request ID",
    });
  }

  const parsed = rejectLeaveSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten(),
    });
  }

  const approverId = req.user?.id;

  if (!approverId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const request = await rejectLeaveRequest({
    leaveRequestId: id,
    approverId,
    rejectionReason: parsed.data.rejectionReason,
  });

  return res.status(200).json({
    success: true,
    message: "Leave request rejected successfully",
    data: request,
  });
};
