import { z } from "zod";

import { TASK_PRIORITY } from "../constants/taskPriority.js";
import { TASK_STATUS } from "../constants/taskStatus.js";

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(200),

  description: z.string().trim().max(5000).optional(),

  leads: z.array(z.string()).optional(),

  assignedTo: z.string().min(1),

  priority: z
    .enum([
      TASK_PRIORITY.LOW,
      TASK_PRIORITY.MEDIUM,
      TASK_PRIORITY.HIGH,
      TASK_PRIORITY.URGENT,
    ])
    .optional(),

  dueDate: z.string().datetime().optional(),

  remarks: z.string().trim().max(2000).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.enum([
    TASK_STATUS.TODO,
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.ON_HOLD,
    TASK_STATUS.COMPLETED,
    TASK_STATUS.CANCELLED,
  ]),

  remarks: z.string().trim().max(2000).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  priority: z
    .enum([
      TASK_PRIORITY.LOW,
      TASK_PRIORITY.MEDIUM,
      TASK_PRIORITY.HIGH,
      TASK_PRIORITY.URGENT,
    ])
    .optional(),
  status: z
    .enum([
      TASK_STATUS.TODO,
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.ON_HOLD,
      TASK_STATUS.COMPLETED,
      TASK_STATUS.CANCELLED,
    ])
    .optional(),
  dueDate: z.string().datetime().optional(),
  remarks: z.string().trim().max(2000).optional(),
  completedAt: z.string().datetime().nullable().optional(),
  assignedTo: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  branch: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .optional(),
  leads: z.array(z.string()).nullable().optional(),
});
