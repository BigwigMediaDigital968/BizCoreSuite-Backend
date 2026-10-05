import { z } from "zod";

export const assignLeadSchema = z
  .object({
    employeeId: z.string().trim().min(1).optional(),
    branchId: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.employeeId || data.branchId), {
    message: "Either employeeId or branchId is required",
  });

export type AssignLeadInput = z.infer<typeof assignLeadSchema>;

export const assignLeadsBulkSchema = z
  .object({
    leadIds: z
      .array(z.string().min(1))
      .min(1, "At least one Lead ID is required"),
    employeeId: z.string().min(1).optional(),
    branchId: z.string().min(1).optional(),
  })
  .refine((data) => Boolean(data.employeeId || data.branchId), {
    message: "Either employeeId or branchId is required",
  });
