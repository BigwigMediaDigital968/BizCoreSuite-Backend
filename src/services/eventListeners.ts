import { notify } from "./notification.service.js";
import { logActivity } from "./activity.service.js";
import { NOTIFICATION_TYPES } from "../models/Notification.js";
import { ROLES } from "../constants/roles.js";
import { appEvents } from "../socket/notification.socket.js";

appEvents.on(NOTIFICATION_TYPES.EMPLOYEE_CREATED, async (data) => {
  // 1. Send Notification
  await notify({
    roles: [ROLES.HEAD],
    senderId: data.createdBy,
    type: NOTIFICATION_TYPES.EMPLOYEE_CREATED,
    title: "New Employee Created",
    message: `${data.employeeName} has been added to the system.`,
    entityId: data.employeeId,
    entityType: "User",
  });

  // 2. Log Activity
  await logActivity({
    module: "USER",
    action: "EMPLOYEE_CREATED",
    description: `Created user account for ${data.employeeName}`,
    performedBy: data.createdBy,
    entityId: data.employeeId,
  });
});

appEvents.on(NOTIFICATION_TYPES.TASK_ASSIGNED, async (data) => {
  await notify({
    userIds: [data.assigneeId],
    senderId: data.assignedBy,
    type: NOTIFICATION_TYPES.TASK_ASSIGNED,
    title: "New Task Assigned",
    message: `You have been assigned task: "${data.taskTitle}"`,
    entityId: data.taskId,
    entityType: "Task",
  });

  await logActivity({
    module: "TASK",
    action: "TASK_ASSIGNED",
    description: `Assigned task "${data.taskTitle}"`,
    performedBy: data.assignedBy,
    entityId: data.taskId,
  });
});
