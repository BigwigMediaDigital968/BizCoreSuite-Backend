export const TASK_PRIORITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type TaskPriority = (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];
