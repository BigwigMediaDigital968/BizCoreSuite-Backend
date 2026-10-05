import { z } from "zod";
import { LEAVE_TYPE, LeaveType } from "../constants/leave.js";

// Cast to explicit enum tuple to satisfy Zod & TS types
const leaveTypeValues = Object.values(LEAVE_TYPE) as [
  LeaveType,
  ...LeaveType[],
];

export const createLeavePolicySchema = z.object({
  name: z.string().trim().min(2).max(150),

  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .transform((value) => value.toUpperCase()),

  branch: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid branch ID")
    .optional()
    .nullable(),

  leaveType: z.enum(leaveTypeValues, {
    message: "Invalid leave type",
  }),

  annualAllocation: z.number().min(0).default(0),

  isPaid: z.boolean().default(true),

  allowHalfDay: z.boolean().default(true),

  allowCarryForward: z.boolean().default(false),

  maximumCarryForward: z.number().min(0).optional().nullable(),

  allowNegativeBalance: z.boolean().default(false),

  minimumNoticeDays: z.number().min(0).default(0),

  maximumConsecutiveDays: z.number().min(1).optional().nullable(),

  applicableFrom: z.coerce.date(),

  applicableTo: z.coerce.date().optional().nullable(),

  isActive: z.boolean().default(true),
});

export const updateLeavePolicySchema = createLeavePolicySchema.partial();

export const leavePolicyListQuerySchema = z.object({
  branch: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, "Invalid branch ID")
    .optional(),

  leaveType: z
    .enum(leaveTypeValues, {
      message: "Invalid leave type",
    })
    .optional(),

  isActive: z.enum(["true", "false"]).optional(),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
});
