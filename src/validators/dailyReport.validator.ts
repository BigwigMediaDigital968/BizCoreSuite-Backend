import { z } from "zod";

import { DAILY_REPORT_MAX_CUSTOM_FIELDS } from "../constants/dailyReport.js";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const count = z.coerce.number().int().min(0).max(100000);

export const submitDailyReportSchema = z
  .object({
    workCompleted: z.string().trim().min(1, "Work completed is required").max(2000),
    callsAttended: count,
    callsAnswered: count,
    conversions: count,
    totalCallDurationSeconds: z.coerce.number().int().min(0).max(86400),
    dailyFeedback: z.string().trim().max(2000).optional().default(""),
    customFields: z
      .array(
        z.object({
          label: z.string().trim().min(1, "Field name is required").max(60),
          value: z.string().trim().max(500).default(""),
        }),
      )
      .max(DAILY_REPORT_MAX_CUSTOM_FIELDS)
      .default([]),
  })
  .refine((data) => data.callsAnswered <= data.callsAttended, {
    message: "Calls answered cannot exceed calls attended",
    path: ["callsAnswered"],
  })
  .refine(
    (data) => {
      const labels = data.customFields.map((f) => f.label.toLowerCase());
      return new Set(labels).size === labels.length;
    },
    { message: "Additional field names must be unique", path: ["customFields"] },
  );

export type SubmitDailyReportInput = z.infer<typeof submitDailyReportSchema>;

const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

export const dailyReportListQuerySchema = z.object({
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  branchId: objectIdSchema.optional(),
  employeeId: objectIdSchema.optional(),
  lateOnly: booleanQuery,
  mismatchOnly: booleanQuery,
  reviewed: booleanQuery,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DailyReportListQuery = z.infer<typeof dailyReportListQuerySchema>;

export const myDailyReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const missingReportsQuerySchema = z.object({
  date: dateStringSchema,
  branchId: objectIdSchema.optional(),
});

export const summaryQuerySchema = z.object({
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  branchId: objectIdSchema.optional(),
});

export const exportQuerySchema = dailyReportListQuerySchema
  .omit({ page: true, limit: true })
  .extend({ format: z.enum(["csv", "excel"]).default("csv") });

export const reviewDailyReportSchema = z.object({
  remark: z.string().trim().max(1000).optional(),
});
