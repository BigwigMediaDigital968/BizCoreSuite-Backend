import { Request, Response } from "express";
import { ActivityLog } from "../models/ActivityLog.js";
import { ROLES } from "../constants/roles.js";
import { PERMISSIONS } from "../constants/permissions.js";

// Mapping CRM modules to their respective view permissions
const MODULE_PERMISSION_MAP: Record<string, string> = {
  USER: PERMISSIONS.ACTIVITY_LOG_USER_VIEW,
  EMPLOYEE: PERMISSIONS.ACTIVITY_LOG_USER_VIEW,
  LEAD: PERMISSIONS.ACTIVITY_LOG_LEAD_VIEW,
  STRINGEE: PERMISSIONS.ACTIVITY_LOG_STRINGEE_VIEW,
  TASK: PERMISSIONS.ACTIVITY_LOG_TASK_VIEW,
  ATTENDANCE: PERMISSIONS.ACTIVITY_LOG_ATTENDANCE_VIEW,
  LEAVE: PERMISSIONS.ACTIVITY_LOG_LEAVE_VIEW,
  REVENUE: PERMISSIONS.ACTIVITY_LOG_REVENUE_VIEW,
};

export const getActivityLogs = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const skip = (page - 1) * limit;

    const { module, action, userId, branchId, startDate, endDate } = req.query;
    const currentUser = (req as any).user;
    const userPermissions: string[] = currentUser.permissions || [];

    const filter: any = {};

    // 1. MODULE-WISE PERMISSION CHECK
    if (module && typeof module === "string") {
      const requiredPermission = MODULE_PERMISSION_MAP[module];
      if (
        requiredPermission &&
        currentUser.role !== ROLES.HEAD &&
        !userPermissions.includes(requiredPermission)
      ) {
        return res.status(403).json({
          message: `Forbidden: You lack permission to view activity logs for module '${module}'`,
        });
      }
      filter.module = module;
    } else if (currentUser.role !== ROLES.HEAD) {
      // If no module filter passed, restrict query to modules user actually has permission to view
      const allowedModules = Object.keys(MODULE_PERMISSION_MAP).filter(
        (mod) => {
          const perm = MODULE_PERMISSION_MAP[mod];
          return perm ? userPermissions.includes(perm) : false;
        },
      );

      filter.module = { $in: allowedModules };
    }

    // 2. ROLE-BASED SCOPING
    if (currentUser.role === ROLES.ADMIN) {
      // Admins see logs within their branches
      filter.branch = { $in: currentUser.branches };
    } else if (currentUser.role === ROLES.MANAGER) {
      // Managers see logs within their branch
      filter.branch = currentUser.branches?.[0];
    }
    // HEAD role skips branch filter and sees all logs across all branches

    // 3. ADDITIONAL FILTERS
    if (action) filter.action = action;
    if (userId) filter.performedBy = userId;
    if (branchId && currentUser.role === ROLES.HEAD) filter.branch = branchId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate as string);
      if (endDate) filter.createdAt.$lte = new Date(endDate as string);
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate("performedBy", "name email role avatar")
        .populate("branch", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ActivityLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};
