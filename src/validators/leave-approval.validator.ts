import { z } from "zod";

export const rejectLeaveSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(3, "Rejection reason is required")
    .max(2000),
});
