import mongoose from "mongoose";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { LeavePolicy } from "../models/LeavePolicy.js";
import { LeaveBalance } from "../models/LeaveBalance.js";
import { EMPLOYMENT_STATUS } from "../constants/employee.js";
import {
  LEAVE_REQUEST_STATUS,
  LEAVE_DURATION_TYPE,
  type LeaveRequestStatus,
  type LeaveDurationType,
} from "../constants/leaveRequest.js";
import { calculateLeaveDays } from "./leave-calculation.service.js";
import { AppError } from "../utils/AppError.js";
import {
  reserveLeaveBalance,
  releaseLeaveBalance,
} from "./leave-balance.service.js";

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveType: string;
  leavePolicyId: string;
  startDate: Date;
  endDate: Date;
  durationType?: LeaveDurationType;
  reason?: string;
}

export interface ListLeaveRequestsInput {
  filters: Partial<CreateLeaveRequestInput> & {
    branchId?: string;
    status?: LeaveRequestStatus;
    page?: number;
    limit?: number;
  };
  userContext: UserContext;
}

export interface UserContext {
  id: string;
  role: string;
  branchId?: string | string[];
}

// Transaction wrapper helper for local standalone fallback
const runTransaction = async <T>(
  action: (session?: mongoose.ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await action(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    await session.abortTransaction();
    if (error?.code === 20 || error?.message?.includes("replica set")) {
      return await action();
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const createLeaveRequest = async (
  data: CreateLeaveRequestInput,
  actorId: string,
) => {
  return runTransaction(async (session) => {
    const userObjectId = new mongoose.Types.ObjectId(data.employeeId);

    // 1. Check EmployeeProfile by user field OR by profile _id
    let employee = await EmployeeProfile.findOne({
      $or: [{ user: userObjectId }, { _id: userObjectId }],
    })
      .session(session ?? null)
      .lean();

    // 2. If no EmployeeProfile found or status is not active, throw explicit error
    if (!employee) {
      throw new AppError(
        "Employee profile missing. Please create an HR employee record for this user.",
        404,
        "EMPLOYEE_NOT_FOUND",
      );
    }

    if (employee.employmentStatus !== EMPLOYMENT_STATUS.ACTIVE) {
      throw new AppError(
        `Employee status is '${employee.employmentStatus}'. Must be 'active' to apply for leave.`,
        400,
        "EMPLOYEE_INACTIVE",
      );
    }

    if (!mongoose.isValidObjectId(data.leavePolicyId)) {
      throw new AppError(
        "Invalid leave policy ID",
        400,
        "INVALID_LEAVE_POLICY_ID",
      );
    }

    const policy = await LeavePolicy.findById(data.leavePolicyId)
      .session(session ?? null)
      .lean();

    if (!policy) {
      throw new AppError(
        "Leave policy not found",
        404,
        "LEAVE_POLICY_NOT_FOUND",
      );
    }

    if (data.startDate > data.endDate) {
      throw new AppError(
        "Start date cannot be after end date",
        400,
        "INVALID_DATE_RANGE",
      );
    }

    const existingRequest = await LeaveRequest.findOne({
      employee: data.employeeId,
      status: {
        $in: [LEAVE_REQUEST_STATUS.PENDING, LEAVE_REQUEST_STATUS.APPROVED],
      },
      startDate: { $lte: data.endDate },
      endDate: { $gte: data.startDate },
    }).session(session ?? null);

    if (existingRequest) {
      throw new AppError(
        "Leave already exists for selected date range",
        409,
        "LEAVE_DATE_CONFLICT",
      );
    }

    const calculation = await calculateLeaveDays({
      branchId: employee.branch.toString(),
      startDate: data.startDate,
      endDate: data.endDate,
      durationType: data.durationType,
    });

    if (calculation.totalDays <= 0) {
      throw new AppError(
        "Selected dates contain no working days",
        400,
        "NO_WORKING_DAYS",
      );
    }

    const year = new Date(data.startDate).getFullYear();
    const balance = await LeaveBalance.findOne({
      employee: new mongoose.Types.ObjectId(data.employeeId),
      policy: new mongoose.Types.ObjectId(data.leavePolicyId),
      year,
    }).session(session ?? null);

    if (!balance) {
      throw new AppError(
        "Leave balance not found",
        404,
        "LEAVE_BALANCE_NOT_FOUND",
      );
    }

    const [leaveRequest] = await LeaveRequest.create(
      [
        {
          employee: data.employeeId,
          branch: employee.branch,
          leavePolicy: data.leavePolicyId,
          leaveType: data.leaveType,
          startDate: data.startDate,
          endDate: data.endDate,
          durationType: data.durationType ?? LEAVE_DURATION_TYPE.FULL_DAY,
          totalDays: calculation.totalDays,
          reason: data.reason,
          status: LEAVE_REQUEST_STATUS.PENDING,
          appliedAt: new Date(),
        },
      ],
      session ? { session } : {},
    );

    await reserveLeaveBalance({
      employeeId: data.employeeId,
      leaveBalanceId: balance._id.toString(),
      amount: calculation.totalDays,
      leaveRequestId: leaveRequest!._id.toString(),
      session,
    });

    return leaveRequest;
  });
};

export const cancelLeaveRequest = async (
  requestId: string,
  actorId: string,
) => {
  return runTransaction(async (session) => {
    const request = await LeaveRequest.findById(requestId).session(
      session ?? null,
    );

    if (!request) {
      throw new AppError(
        "Leave request not found",
        404,
        "LEAVE_REQUEST_NOT_FOUND",
      );
    }

    if (request.employee.toString() !== actorId) {
      throw new AppError(
        "You can only cancel your own leave request",
        403,
        "LEAVE_ACCESS_DENIED",
      );
    }

    if (request.status !== LEAVE_REQUEST_STATUS.PENDING) {
      throw new AppError(
        "Only pending leave requests can be cancelled",
        400,
        "INVALID_LEAVE_STATUS",
      );
    }

    const balance = await LeaveBalance.findOne({
      employee: request.employee,
      policy: request.leavePolicy,
      year: new Date(request.startDate).getFullYear(),
    }).session(session ?? null);

    if (!balance) {
      throw new AppError(
        "Associated leave balance record not found",
        404,
        "LEAVE_BALANCE_NOT_FOUND",
      );
    }

    // Release reserved balance
    await releaseLeaveBalance({
      employeeId: request.employee.toString(),
      leaveBalanceId: balance._id.toString(),
      amount: request.totalDays,
      leaveRequestId: request._id.toString(),
      performedBy: actorId,
      session,
    });

    request.status = LEAVE_REQUEST_STATUS.CANCELLED;
    request.cancelledAt = new Date();

    await request.save({ session });
    return request;
  });
};

export const updateLeaveRequest = async (
  requestId: string,
  data: Partial<CreateLeaveRequestInput>,
  actorId: string,
) => {
  return runTransaction(async (session) => {
    const request = await LeaveRequest.findById(requestId).session(
      session ?? null,
    );

    if (!request) {
      throw new AppError(
        "Leave request not found",
        404,
        "LEAVE_REQUEST_NOT_FOUND",
      );
    }

    if (request.employee.toString() !== actorId) {
      throw new AppError(
        "You can only update your own leave request",
        403,
        "LEAVE_ACCESS_DENIED",
      );
    }

    if (request.status !== LEAVE_REQUEST_STATUS.PENDING) {
      throw new AppError(
        "Only pending leave requests can be updated",
        400,
        "LEAVE_UPDATE_NOT_ALLOWED",
      );
    }

    const startDate = data.startDate ?? request.startDate;
    const endDate = data.endDate ?? request.endDate;

    if (startDate > endDate) {
      throw new AppError(
        "Start date cannot be after end date",
        400,
        "INVALID_DATE_RANGE",
      );
    }

    const calculation = await calculateLeaveDays({
      branchId: request.branch.toString(),
      startDate,
      endDate,
      durationType: data.durationType ?? request.durationType,
    });

    const oldDays = request.totalDays;
    const newDays = calculation.totalDays;
    const difference = newDays - oldDays;

    if (difference !== 0) {
      const balance = await LeaveBalance.findOne({
        employee: request.employee,
        policy: request.leavePolicy,
        year: new Date(startDate).getFullYear(),
      }).session(session ?? null);

      if (!balance) {
        throw new AppError(
          "Associated leave balance record not found",
          404,
          "LEAVE_BALANCE_NOT_FOUND",
        );
      }

      if (difference > 0) {
        // Reserve extra days
        await reserveLeaveBalance({
          employeeId: request.employee.toString(),
          leaveBalanceId: balance._id.toString(),
          amount: difference,
          leaveRequestId: request._id.toString(),
          session,
        });
      } else {
        // Release excess days
        await releaseLeaveBalance({
          employeeId: request.employee.toString(),
          leaveBalanceId: balance._id.toString(),
          amount: Math.abs(difference),
          leaveRequestId: request._id.toString(),
          performedBy: actorId,
          session,
        });
      }
    }

    request.startDate = startDate;
    request.endDate = endDate;
    request.totalDays = newDays;
    if (data.durationType) request.durationType = data.durationType;
    if (data.leaveType !== undefined) request.leaveType = data.leaveType;
    if (data.reason !== undefined) request.reason = data.reason;

    await request.save({ session });
    return request;
  });
};

export const listLeaveRequests = async ({
  filters,
  userContext,
}: ListLeaveRequestsInput) => {
  const page = Math.max(filters.page ?? 1, 1);
  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 100);
  const query: Record<string, unknown> = {};

  // Role Scoping Strategy
  if (userContext.role === "EMPLOYEE") {
    query.employee = userContext.id;
  } else if (userContext.role === "MANAGER" || userContext.role === "ADMIN") {
    if (userContext.branchId) query.branch = userContext.branchId;
  } // HEAD / SUPER_ADMIN has global access (unfiltered by default unless specified in params)

  if (filters.employeeId && userContext.role !== "EMPLOYEE")
    query.employee = filters.employeeId;
  if (
    filters.branchId &&
    (userContext.role === "HEAD" || userContext.role === "SUPER_ADMIN")
  ) {
    query.branch = filters.branchId;
  }
  if (filters.status) query.status = filters.status;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    LeaveRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employee", "name email role")
      .populate("branch", "name code")
      .populate("leavePolicy", "name code")
      .lean(),
    LeaveRequest.countDocuments(query),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getLeaveRequestById = async (requestId: string) => {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new AppError(
      "Invalid leave request ID",
      400,
      "INVALID_LEAVE_REQUEST_ID",
    );
  }

  const request = await LeaveRequest.findById(requestId)
    .populate("employee", "name email role")
    .populate("branch", "name code")
    .populate("leavePolicy", "name code")
    .lean();

  if (!request) {
    throw new AppError(
      "Leave request not found",
      404,
      "LEAVE_REQUEST_NOT_FOUND",
    );
  }

  return request;
};
