// src/services/performance.service.ts
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { Lead } from "../models/Lead.js";
import { CallLog } from "../models/CallLog.js";
import { Task } from "../models/Task.js";
import { Attendance } from "../models/Attendance.js";
import { User } from "../models/User.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { ROLES } from "../constants/roles.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";

export const flexiblePerformanceQuerySchema = z.object({
  targetUserId: z.string().optional(),
  branchId: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  viewMode: z.enum(["INDIVIDUAL", "TEAM", "BRANCH"]).default("INDIVIDUAL"),
});

export type FlexiblePerformanceQueryParams = z.infer<typeof flexiblePerformanceQuerySchema>;

export const getHierarchicalPerformanceReport = async (
  requestor: AuthenticatedUser,
  rawQueryParams: unknown
) => {
  // 1. Input Validation
  const validationResult = flexiblePerformanceQuerySchema.safeParse(rawQueryParams);
  if (!validationResult.success) {
    const formattedErrors = validationResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    throw new AppError(`Invalid query parameters: ${formattedErrors}`, 400, "INVALID_QUERY_PARAMS");
  }

  const { targetUserId, branchId, startDate, endDate, viewMode } = validationResult.data;

  // 2. Resolve Scope and Target User Hierarchy
  let targetUserIds: Types.ObjectId[] = [];
  let scopeInfo: Record<string, unknown> = { viewMode };

  if (viewMode === "INDIVIDUAL") {
    const resolvedUserId = targetUserId || requestor.id;
    if (!Types.ObjectId.isValid(resolvedUserId)) {
      throw new AppError("Invalid target user ID", 400, "INVALID_USER_ID");
    }

    const targetUser = await User.findById(resolvedUserId).lean();
    if (!targetUser || !targetUser.isActive) {
      throw new AppError("Target user not found or inactive", 404, "USER_NOT_FOUND");
    }

    // Role Security Checks
    if (requestor.role === ROLES.EMPLOYEE && requestor.id !== resolvedUserId) {
      throw new AppError("Employees can only view their own performance", 403, "ACCESS_DENIED");
    }

    if (requestor.role === ROLES.MANAGER) {
      if (requestor.id !== resolvedUserId) {
        const isSubordinate = await EmployeeProfile.exists({
          user: targetUser._id,
          reportingManager: new Types.ObjectId(requestor.id),
        });
        if (!isSubordinate) {
          throw new AppError("Managers can only view performance of their team members", 403, "ACCESS_DENIED");
        }
      }
    }

    if (requestor.role === ROLES.ADMIN) {
      const sharesBranch = targetUser.branches.some((b) => requestor.branches.includes(b.toString()));
      if (!sharesBranch) {
        throw new AppError("Admin can only view performance within assigned branches", 403, "ACCESS_DENIED");
      }
    }

    targetUserIds = [targetUser._id];
    scopeInfo.targetUser = { id: targetUser._id, name: targetUser.name, role: targetUser.role };

  } else if (viewMode === "TEAM") {
    // Aggregate Subordinates / Team Performance
    if (requestor.role === ROLES.EMPLOYEE) {
      throw new AppError("Employees cannot access team metrics", 403, "ACCESS_DENIED");
    }

    if (requestor.role === ROLES.MANAGER) {
      const teamProfiles = await EmployeeProfile.find({
        reportingManager: new Types.ObjectId(requestor.id),
      }).select("user").lean();

      targetUserIds = teamProfiles.map((p) => p.user);
      targetUserIds.push(new Types.ObjectId(requestor.id)); // Include Manager
    } else if (requestor.role === ROLES.ADMIN || requestor.role === ROLES.HEAD) {
      const targetManagerId = targetUserId || requestor.id;
      const teamProfiles = await EmployeeProfile.find({
        reportingManager: new Types.ObjectId(targetManagerId),
      }).select("user").lean();

      targetUserIds = teamProfiles.map((p) => p.user);
      targetUserIds.push(new Types.ObjectId(targetManagerId));
    }
    scopeInfo.teamSize = targetUserIds.length;

  } else if (viewMode === "BRANCH") {
    if (requestor.role === ROLES.EMPLOYEE || requestor.role === ROLES.MANAGER) {
      throw new AppError("Only Admins and Head can access full branch metrics", 403, "ACCESS_DENIED");
    }

    const selectedBranch = branchId || requestor.branches[0];
    if (!selectedBranch || !Types.ObjectId.isValid(selectedBranch)) {
      throw new AppError("Valid Branch ID is required for branch view", 400, "INVALID_BRANCH_ID");
    }

    if (requestor.role === ROLES.ADMIN && !requestor.branches.includes(selectedBranch)) {
      throw new AppError("Access restricted to assigned branches", 403, "BRANCH_ACCESS_DENIED");
    }

    const branchUsers = await User.find({
      branches: new Types.ObjectId(selectedBranch),
      isActive: true,
    }).select("_id").lean();

    targetUserIds = branchUsers.map((u) => u._id);
    scopeInfo.branchId = selectedBranch;
    scopeInfo.activeUsersCount = targetUserIds.length;
  }

  // 3. Construct Date Filters
  const dateFilter: Record<string, unknown> = {};
  if (startDate || endDate) {
    dateFilter.createdAt = {};
    if (startDate) (dateFilter.createdAt as Record<string, Date>).$gte = new Date(startDate);
    if (endDate) (dateFilter.createdAt as Record<string, Date>).$lte = new Date(endDate);
  }

  // 4. Run Concurrent Aggregation Pipelines Across Aggregated User Set
  const [leadMetrics, callMetrics, taskMetrics, attendanceMetrics] = await Promise.all([
    Lead.aggregate([
      {
        $match: {
          assignedTo: { $in: targetUserIds },
          isDeleted: false,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalAssigned: { $sum: 1 },
          statusBreakdown: { $push: "$status" },
        },
      },
      {
        $project: {
          _id: 0,
          totalAssigned: 1,
          statusCounts: {
            $arrayToObject: {
              $map: {
                input: { $setUnion: ["$statusBreakdown"] },
                as: "status",
                in: {
                  k: "$$status",
                  v: {
                    $size: {
                      $filter: {
                        input: "$statusBreakdown",
                        as: "s",
                        cond: { $eq: ["$$s", "$$status"] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ]),

    CallLog.aggregate([
      {
        $match: {
          caller: { $in: targetUserIds },
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          answeredCalls: { $sum: { $cond: [{ $eq: ["$callStatus", "ended"] }, 1, 0] } },
          missedCalls: { $sum: { $cond: [{ $in: ["$callStatus", ["missed", "rejected"]] }, 1, 0] } },
          totalDurationSeconds: { $sum: "$duration" },
          avgDurationSeconds: { $avg: "$duration" },
        },
      },
      { $project: { _id: 0 } },
    ]),

    Task.aggregate([
      {
        $match: {
          assignedTo: { $in: targetUserIds },
          isDeleted: false,
          ...dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalTasks: { $sum: 1 },
          completedTasks: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
          pendingTasks: { $sum: { $cond: [{ $ne: ["$status", "COMPLETED"] }, 1, 0] } },
          overdueTasks: {
            $sum: {
              $cond: [
                { $and: [{ $ne: ["$status", "COMPLETED"] }, { $lt: ["$dueDate", new Date()] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),

    Attendance.aggregate([
      {
        $match: {
          employee: { $in: targetUserIds },
          ...(startDate || endDate ? { createdAt: dateFilter.createdAt } : {}),
        },
      },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          daysPresent: { $sum: { $cond: [{ $eq: ["$status", "PRESENT"] }, 1, 0] } },
          totalLateMinutes: { $sum: "$lateMinutes" },
          totalWorkingMinutes: { $sum: "$totalWorkingMinutes" },
        },
      },
      { $project: { _id: 0 } },
    ]),
  ]);

  return {
    scope: scopeInfo,
    period: {
      startDate: startDate || "ALL_TIME",
      endDate: endDate || "ALL_TIME",
    },
    metrics: {
      leads: leadMetrics[0] || { totalAssigned: 0, statusCounts: {} },
      calls: callMetrics[0] || {
        totalCalls: 0,
        answeredCalls: 0,
        missedCalls: 0,
        totalDurationSeconds: 0,
        avgDurationSeconds: 0,
      },
      tasks: taskMetrics[0] || {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        overdueTasks: 0,
      },
      attendance: attendanceMetrics[0] || {
        totalLogs: 0,
        daysPresent: 0,
        totalLateMinutes: 0,
        totalWorkingMinutes: 0,
      },
    },
  };
};