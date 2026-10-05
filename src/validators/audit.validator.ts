import { z } from "zod";

export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),

  action: z.string().trim().optional(),

  entity: z.string().trim().optional(),

  actor: z.string().trim().optional(),

  entityId: z.string().trim().optional(),

  branch: z.string().trim().optional(),

  from: z.string().datetime().optional(),

  to: z.string().datetime().optional(),

  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
