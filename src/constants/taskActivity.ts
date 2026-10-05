export const TASK_ACTIVITY_TYPE = {
  CREATED: "created",
  ASSIGNED: "assigned",
  REASSIGNED: "reassigned",
  STATUS_CHANGED: "status_changed",
  PRIORITY_CHANGED: "priority_changed",
  DUE_DATE_CHANGED: "due_date_changed",
  REMARK_ADDED: "remark_added",
  UPDATED: "updated",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type TaskActivityType =
  (typeof TASK_ACTIVITY_TYPE)[keyof typeof TASK_ACTIVITY_TYPE];
