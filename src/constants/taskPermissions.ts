import { ROLES } from "./roles.js";

export const TASK_UPDATE_FIELDS = {
  [ROLES.HEAD]: [
    "title",
    "description",
    "priority",
    "status",
    "dueDate",
    "remarks",
    "completedAt",
    "assignedTo",
    "branch",
    "lead",
  ],

  [ROLES.ADMIN]: [
    "title",
    "description",
    "priority",
    "status",
    "dueDate",
    "remarks",
    "completedAt",
    "assignedTo",
    "branch",
    "lead",
  ],

  [ROLES.MANAGER]: [
    "title",
    "description",
    "priority",
    "status",
    "dueDate",
    "remarks",
    "completedAt",
    "assignedTo",
    "lead",
  ],

  [ROLES.EMPLOYEE]: ["status", "remarks", "completedAt"],
} as const;
