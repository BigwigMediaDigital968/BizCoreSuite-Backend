import mongoose, { Types } from "mongoose";
import { Notification, NotificationType } from "../models/Notification.js";
import { User } from "../models/User.js";
import { Role, ROLES } from "../constants/roles.js";
import { Permission } from "../constants/permissions.js";
import { getIO } from "../socket/index.js"; // Standard Socket.io getter

export interface NotifyOptions {
  // Target Selection (Provide AT LEAST ONE criteria)
  userIds?: (string | Types.ObjectId)[];
  roles?: Role[];
  permissions?: Permission[];

  // Context Filters (Optional: Restrict recipients by scope)
  branchId?: string | Types.ObjectId;

  // Payload Information
  senderId?: string | Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string | Types.ObjectId;
  entityType?: string; // "Task", "User", "Lead", "Revenue"
}

/**
 * Universal, Reusable Notification Engine
 */
export const notify = async (options: NotifyOptions): Promise<void> => {
  try {
    const {
      userIds = [],
      roles = [],
      permissions = [],
      branchId,
      senderId,
      type,
      title,
      message,
      entityId,
      entityType,
    } = options;

    const recipientSet = new Set<string>();

    // 1. Direct Target User IDs
    userIds.forEach((id) => recipientSet.add(id.toString()));

    // 2. Dynamic Query for Roles / Permissions / Branch Scoping
    if (roles.length > 0 || permissions.length > 0 || branchId) {
      const query: Record<string, unknown> = { isActive: true };

      if (roles.length > 0) {
        query.role = { $in: roles };
      }

      if (permissions.length > 0) {
        query.permissions = { $in: permissions };
      }

      if (branchId) {
        query.branches = new Types.ObjectId(branchId.toString());
      }

      const matchingUsers = await User.find(query).select("_id").lean();
      matchingUsers.forEach((u) => recipientSet.add(u._id.toString()));
    }

    // Exclude sender from receiving their own notification
    if (senderId) {
      recipientSet.delete(senderId.toString());
    }

    const finalRecipientIds = Array.from(recipientSet);
    if (finalRecipientIds.length === 0) return;

    // 3. Batch Create In-App Notifications in Database
    const dbDocs = finalRecipientIds.map((recipientId) => ({
      recipient: new Types.ObjectId(recipientId),
      sender: senderId ? new Types.ObjectId(senderId.toString()) : undefined,
      type,
      title,
      message,
      entityId: entityId ? new Types.ObjectId(entityId.toString()) : undefined,
      entityType,
    }));

    const savedNotifications = await Notification.insertMany(dbDocs);

    // 4. Real-time Delivery via Socket.io
    const io = getIO();
    if (io) {
      savedNotifications.forEach((notification) => {
        io.to(`user:${notification.recipient.toString()}`).emit(
          "NOTIFICATION_RECEIVED",
          notification
        );
      });
    }
  } catch (error) {
    // Non-blocking logger so failed notifications never break main execution flow
    console.error("[NOTIFICATION_ERROR]: Failed to send notification", error);
  }
};