import { z } from "zod";

export const createLeadFollowUpSchema = z.object({
  scheduledAt: z.coerce.date().refine((date) => date.getTime() > Date.now(), {
    message: "Follow-up time must be in the future",
  }),

  remark: z
    .string()
    .trim()
    .max(2000, "Remark cannot exceed 2000 characters")
    .optional(),
});

export type CreateLeadFollowUpInput = z.infer<typeof createLeadFollowUpSchema>;
