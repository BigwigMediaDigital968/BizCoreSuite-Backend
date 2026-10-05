import mongoose from "mongoose";

import { Attendance } from "../models/Attendance.js";
import { User } from "../models/User.js";
import { Branch } from "../models/Branch.js";

import { AppError } from "../utils/AppError.js";
import { ROLES, type Role } from "../constants/roles.js";

interface AttendanceScope {
  employeeId?: string;
  branchIds?: string[];
}

export const buildAttendanceScope = async ({
  userId,
  role,
  employeeId,
  branchId,
}: {
  userId: string;
  role: Role;
  employeeId?: string;
  branchId?: string;
}): Promise<AttendanceScope> => {
  // 1. Employee Scope
  if (role === ROLES.EMPLOYEE) {
    if (employeeId && employeeId !== userId) {
      throw new AppError(
        "You can only view your own attendance",
        403,
        "ATTENDANCE_ACCESS_DENIED",
      );
    }

    return {
      employeeId: userId,
    };
  }

  // 2. Head Scope
  if (role === ROLES.HEAD) {
    return {
      branchIds: branchId ? [branchId] : undefined,
    };
  }

  // Common user lookup for Manager and Admin
  const user = await User.findById(userId).select("_id role branches").lean();

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  // 3. Manager Scope
  if (role === ROLES.MANAGER) {
    const managerBranchIds = (user.branches ?? []).map((branch) =>
      branch.toString(),
    );

    if (!managerBranchIds.length) {
      return {
        branchIds: [],
      };
    }

    if (branchId && !managerBranchIds.includes(branchId)) {
      throw new AppError(
        "You do not have access to this branch",
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }

    return {
      branchIds: branchId ? [branchId] : managerBranchIds,
    };
  }

  // 4. Admin Scope
  if (role === ROLES.ADMIN) {
    const adminBranchIds = (user.branches ?? []).map((branch) =>
      branch.toString(),
    );

    if (branchId && !adminBranchIds.includes(branchId)) {
      throw new AppError(
        "You do not have access to this branch",
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }

    return {
      branchIds: branchId ? [branchId] : adminBranchIds,
    };
  }

  return {};
};

export const getAttendanceRecords = async ({
  userId,
  role,
  filters,
}: {
  userId: string;
  role: Role;
  filters: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    employeeId?: string;
    branchId?: string;
    status?: string;
    workMode?: string;
    page: number;
    limit: number;
  };
}) => {
  const scope = await buildAttendanceScope({
    userId,
    role,
    employeeId: filters.employeeId,
    branchId: filters.branchId,
  });

  const query: Record<string, unknown> = {};

  // Apply Employee Filter
  if (scope.employeeId) {
    query.employee = new mongoose.Types.ObjectId(scope.employeeId);
  } else if (filters.employeeId) {
    // Allow higher roles to filter by a specific employee
    query.employee = new mongoose.Types.ObjectId(filters.employeeId);
  }

  // Apply Branch Filter
  if (scope.branchIds) {
    query.branch = {
      $in: scope.branchIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  // Apply Exact Date Filter
  if (filters.date) {
    query.date = filters.date;
  }

  // Apply Date Range Filter
  if (filters.dateFrom || filters.dateTo) {
    query.date = {};

    if (filters.dateFrom) {
      (query.date as Record<string, unknown>).$gte = filters.dateFrom;
    }

    if (filters.dateTo) {
      (query.date as Record<string, unknown>).$lte = filters.dateTo;
    }
  }

  // Apply Status Filter
  if (filters.status) {
    query.status = filters.status;
  }

  // Apply Work Mode Filter
  if (filters.workMode) {
    query.workMode = filters.workMode;
  }

  const skip = (filters.page - 1) * filters.limit;

  const [records, total] = await Promise.all([
    Attendance.find(query)
      .populate("employee", "_id name email role")
      .populate("branch", "_id name code")
      .sort({
        date: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(filters.limit)
      .lean(),

    Attendance.countDocuments(query),
  ]);

  return {
    records,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
};