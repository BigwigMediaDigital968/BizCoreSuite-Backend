export const TASK_STATUS = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  ON_HOLD: "on_hold",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
