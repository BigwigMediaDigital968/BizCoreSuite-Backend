import { z } from "zod";

import {
  MISSED_CHECKOUT_POLICY,
  SALARY_DEDUCTION_STATUS,
  SALARY_OVERRIDE_FIELDS,
  SALARY_PAYOUT_STATUS,
  SALARY_PER_DAY_BASIS,
  STATUTORY_PRORATION,
} from "../constants/salary.js";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ID");
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const money = z.coerce.number().min(0).max(100_000_000);

// ---------- Settings ----------

export const salarySettingsSchema = z.object({
  perDayBasis: z.enum(Object.values(SALARY_PER_DAY_BASIS) as [string, ...string[]]),
  lateRule: z.object({
    enabled: z.boolean(),
    freeLatesPerMonth: z.coerce.number().int().min(0).max(31),
    everyNLates: z.coerce.number().int().min(1).max(31),
    deductionDays: z.coerce.number().min(0).max(31),
    severeLateMinutes: z.coerce.number().int().min(1).max(1440).nullable(),
  }),
  halfDayRule: z.object({
    enabled: z.boolean(),
    minWorkingMinutes: z.coerce.number().int().min(1).max(1440).nullable(),
  }),
  missedCheckoutPolicy: z.enum(
    Object.values(MISSED_CHECKOUT_POLICY) as [string, ...string[]],
  ),
  absenceRequiresApproval: z.boolean(),
  statutoryProration: z.enum(
    Object.values(STATUTORY_PRORATION) as [string, ...string[]],
  ),
});

export type SalarySettingsInput = z.infer<typeof salarySettingsSchema>;

// ---------- Payout preview / generate ----------

const rangeSchema = z
  .object({ from: dateStringSchema, to: dateStringSchema })
  .refine((r) => r.from <= r.to, {
    message: "Start date must be on or before the end date",
    path: ["to"],
  });

export const eligibleEmployeesQuerySchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    branchId: objectIdSchema.optional(),
  })
  .refine((r) => r.from <= r.to, {
    message: "Start date must be on or before the end date",
    path: ["to"],
  });

const overrideSchema = z.object({
  field: z.enum(SALARY_OVERRIDE_FIELDS as unknown as [string, ...string[]]),
  value: money,
  reason: z.string().trim().min(1, "A reason is required").max(300),
});

const adjustmentSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(60),
  amount: z.coerce.number().min(-100_000_000).max(100_000_000),
  note: z.string().trim().max(300).optional(),
});

const decision = z.enum([
  SALARY_DEDUCTION_STATUS.APPROVED,
  SALARY_DEDUCTION_STATUS.REJECTED,
]);

export const payoutInputSchema = z
  .object({
    from: dateStringSchema,
    to: dateStringSchema,
    employeeIds: z.array(objectIdSchema).min(1, "Select at least one employee").max(500),
    /** Keyed by employee id. */
    adjustments: z.record(z.string(), z.array(adjustmentSchema).max(20)).default({}),
    /** Keyed by employee id. */
    overrides: z.record(z.string(), z.array(overrideSchema).max(20)).default({}),
    /** Keyed by employee id, then suggestion key. Unlisted = approved. */
    suggestionDecisions: z
      .record(z.string(), z.record(z.string(), decision))
      .default({}),
    /** Keyed by pending SalaryDeduction id. Unlisted = stays pending. */
    deductionDecisions: z.record(z.string(), decision).default({}),
  })
  .and(rangeSchema);

export type PayoutInput = z.infer<typeof payoutInputSchema>;

export const payoutListQuerySchema = z.object({
  status: z
    .enum(Object.values(SALARY_PAYOUT_STATUS) as [string, ...string[]])
    .optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PayoutListQuery = z.infer<typeof payoutListQuerySchema>;

export const myPayoutsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

export const payoutExportQuerySchema = z.object({
  format: z.enum(["csv", "excel"]).default("csv"),
});

export const cancelPayoutSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required").max(500),
});

// ---------- Deductions ----------

export const createDeductionSchema = z
  .object({
    employeeId: objectIdSchema,
    date: dateStringSchema,
    amount: money.optional(),
    days: z.coerce.number().min(0.5).max(31).optional(),
    reason: z.string().trim().min(1, "A reason is required").max(500),
  })
  .refine((d) => (d.amount === undefined) !== (d.days === undefined), {
    message: "Enter either an amount or a number of days",
    path: ["amount"],
  })
  .refine((d) => d.amount === undefined || d.amount > 0, {
    message: "Amount must be greater than 0",
    path: ["amount"],
  });

export type CreateDeductionInput = z.infer<typeof createDeductionSchema>;

export const reviewDeductionSchema = z.object({
  status: decision,
  remark: z.string().trim().max(500).optional(),
});

export const deductionListQuerySchema = z.object({
  status: z
    .enum(Object.values(SALARY_DEDUCTION_STATUS) as [string, ...string[]])
    .optional(),
  employeeId: objectIdSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type DeductionListQuery = z.infer<typeof deductionListQuerySchema>;
