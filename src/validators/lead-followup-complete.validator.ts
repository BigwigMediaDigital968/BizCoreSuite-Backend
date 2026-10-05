import { z } from "zod";

export const completeLeadFollowUpSchema = z.object({
  remark: z
    .string()
    .trim()
    .min(1, "Completion remark is required")
    .max(2000, "Remark cannot exceed 2000 characters"),
});

export type CompleteLeadFollowUpInput = z.infer<
  typeof completeLeadFollowUpSchema
>;
