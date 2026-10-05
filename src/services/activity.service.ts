import { Types } from "mongoose";
import { ActivityLog, ActivityModule } from "../models/ActivityLog.js";
import { getIO } from "../socket/index.js";
import { ROLES, Role } from "../constants/roles.js";
import { PERMISSIONS, Permission } from "../constants/permissions.js";
import { notify } from "./notification.service.js";
import {
  NOTIFICATION_TYPES,
  NotificationType,
} from "../models/Notification.js";

export interface LogActivityParams {
  module: ActivityModule;
  action: string;
  description: string;
  performedBy: string | Types.ObjectId;
  entityId?: string | Types.ObjectId;
  branch?: string | Types.ObjectId;
  metadata?: Record<string, any>;
  ipAddress?: string;
  notifyRoles?: Role[];
  notifyPermissions?: Permission[];
}

export const logActivity = async (params: LogActivityParams): Promise<void> => {
  try {
    // 1. Create and Save Activity Log
    const createdLog = await ActivityLog.create({
      module: params.module,
      action: params.action,
      description: params.description,
      performedBy: new Types.ObjectId(params.performedBy.toString()),
      entityId: params.entityId
        ? new Types.ObjectId(params.entityId.toString())
        : undefined,
      branch: params.branch
        ? new Types.ObjectId(params.branch.toString())
        : undefined,
      metadata: params.metadata || {},
      ipAddress: params.ipAddress,
    });

    const populatedLog = await ActivityLog.findById(createdLog._id).populate(
      "performedBy",
      "name email role",
    );

    // Dynamic Notification Type Resolver
    const computedType =
      `${params.module}_${params.action}` as NotificationType;
    const notificationType = NOTIFICATION_TYPES[computedType]
      ? computedType
      : NOTIFICATION_TYPES.SYSTEM_ALERT;

    const targetRoles = params.notifyRoles || [ROLES.HEAD, ROLES.ADMIN];

    // 2. Dispatch Live Notifications to Database & Sockets
    await notify({
      roles: targetRoles,
      permissions: params.notifyPermissions,
      branchId: params.branch,
      senderId: params.performedBy,
      type: notificationType,
      title: `${params.module} Notification`,
      message: params.description,
      entityId: params.entityId,
      entityType: params.module,
    });

    // 3. Emit Activity Event to Activity Feed Listeners
    const io = getIO();
    if (io && populatedLog) {
      targetRoles.forEach((role) => {
        io.to(`role:${role}`).emit("ACTIVITY_LOGGED", populatedLog);
      });
    }
  } catch (error) {
    console.error("[ACTIVITY_LOG_ERROR]: Failed to save activity", error);
  }
};
