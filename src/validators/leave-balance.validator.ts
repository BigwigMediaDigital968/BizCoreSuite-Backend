import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

export const allocateLeaveBalanceSchema = z.object({
  employeeId: objectIdSchema,

  leavePolicyId: objectIdSchema,

  year: z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .default(new Date().getFullYear()),
});

export const adjustLeaveBalanceSchema = z.object({
  amount: z.number().refine((value) => value !== 0, {
    message: "Adjustment amount cannot be zero",
  }),

  remarks: z.string().trim().min(3).max(500),
});

export type AdjustLeaveBalanceInput = z.infer<typeof adjustLeaveBalanceSchema>;
