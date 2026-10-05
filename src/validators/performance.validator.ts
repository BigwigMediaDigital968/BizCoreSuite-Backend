// src/validators/performance.validator.ts
import { z } from "zod";

export const getEmployeePerformanceSchema = z.object({
  query: z.object({
    employeeId: z.string().optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
    endDate: z.string().datetime({ offset: true }).optional(),
  }),
});

export type GetEmployeePerformanceQuery = z.infer<
  typeof getEmployeePerformanceSchema
>["query"];
