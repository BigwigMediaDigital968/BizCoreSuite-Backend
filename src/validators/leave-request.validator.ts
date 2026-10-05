import { z } from "zod";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");

// Base schema without refinements
export const baseLeaveRequestSchema = z.object({
  leavePolicyId: objectIdSchema,

  leaveType: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((value) => value.toUpperCase()),

  startDate: z.coerce.date(),

  endDate: z.coerce.date(),

  durationType: z.enum(["full_day", "first_half", "second_half"]),

  reason: z.string().trim().max(2000).optional(),
});

// Create schema with date refinement
export const createLeaveRequestSchema = baseLeaveRequestSchema.refine(
  (data) => data.endDate >= data.startDate,
  {
    message: "End date cannot be before start date",
    path: ["endDate"],
  },
);

// Update schema created from base object schema + optional date refinement
export const updateLeaveRequestSchema = baseLeaveRequestSchema.partial().refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.endDate >= data.startDate;
    }
    return true;
  },
  {
    message: "End date cannot be before start date",
    path: ["endDate"],
  },
);

export const leaveRequestListQuerySchema = z.object({
  employeeId: objectIdSchema.optional(),

  branchId: objectIdSchema.optional(),

  leaveType: z.string().trim().optional(),

  status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),

  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
});
