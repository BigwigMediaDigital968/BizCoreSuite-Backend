import { Server, Socket } from "socket.io";
import { EventEmitter } from "events";
import { Notification, NOTIFICATION_TYPES } from "../models/Notification.js";
import { User } from "../models/User.js";
import { ROLES } from "../constants/roles.js";

export const appEvents = new EventEmitter();

let ioServer: Server | null = null;

export const initSocket = (io: Server) => {
  ioServer = io;

  io.on("connection", (socket: Socket) => {
    const userId = socket.handshake.query.userId as string;
    const role = socket.handshake.query.role as string;

    if (userId) socket.join(`user:${userId}`);
    if (role) socket.join(`role:${role}`);

    socket.on("disconnect", () => {
      // Automatic cleanup handled by socket.io
    });
  });
};

// Unified Push Function
export const sendNotification = async (payload: {
  recipients: string[];
  senderId?: string;
  type: string;
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
}) => {
  const docs = payload.recipients.map((recipientId) => ({
    recipient: recipientId,
    sender: payload.senderId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    entityId: payload.entityId,
    entityType: payload.entityType,
  }));

  // 1. Save to Database
  const savedNotifications = await Notification.insertMany(docs);

  // 2. Real-Time Socket Push
  if (ioServer) {
    savedNotifications.forEach((notification) => {
      ioServer!
        .to(`user:${notification.recipient.toString()}`)
        .emit("NOTIFICATION_RECEIVED", notification);
    });
  }
};

// Listeners for System Events
appEvents.on(NOTIFICATION_TYPES.EMPLOYEE_CREATED, async (data) => {
  // Notify HEAD users when a new employee is created
  const headUsers = await User.find({ role: ROLES.HEAD, isActive: true })
    .select("_id")
    .lean();
  const recipients = headUsers.map((u) => u._id.toString());

  if (recipients.length) {
    await sendNotification({
      recipients,
      senderId: data.createdBy,
      type: NOTIFICATION_TYPES.EMPLOYEE_CREATED,
      title: "New Employee Created",
      message: `${data.employeeName} has been added to the system.`,
      entityId: data.employeeId,
      entityType: "User",
    });
  }
});

appEvents.on(NOTIFICATION_TYPES.BRANCH_ASSIGNED, async (data) => {
  await sendNotification({
    recipients: [data.adminId],
    senderId: data.assignedBy,
    type: NOTIFICATION_TYPES.BRANCH_ASSIGNED,
    title: "Branch Assigned",
    message: `You have been assigned to branch: ${data.branchName}`,
    entityId: data.branchId,
    entityType: "Branch",
  });
});

appEvents.on(NOTIFICATION_TYPES.TASK_ASSIGNED, async (data) => {
  await sendNotification({
    recipients: [data.assigneeId],
    senderId: data.assignedBy,
    type: NOTIFICATION_TYPES.TASK_ASSIGNED,
    title: "New Task Assigned",
    message: `You have been assigned task: "${data.taskTitle}"`,
    entityId: data.taskId,
    entityType: "Task",
  });
});
