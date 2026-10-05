export const SALARY_PER_DAY_BASIS = {
  WORKING_DAYS: "working_days",
  CALENDAR_DAYS: "calendar_days",
  FIXED_30: "fixed_30",
} as const;

export type SalaryPerDayBasis =
  (typeof SALARY_PER_DAY_BASIS)[keyof typeof SALARY_PER_DAY_BASIS];

export const MISSED_CHECKOUT_POLICY = {
  FULL_DAY: "full_day",
  HALF_DAY: "half_day",
} as const;

export type MissedCheckoutPolicy =
  (typeof MISSED_CHECKOUT_POLICY)[keyof typeof MISSED_CHECKOUT_POLICY];

export const STATUTORY_PRORATION = {
  PRORATE: "prorate",
  FULL_IF_ANY_PAYABLE_DAY: "full_if_any_payable_day",
} as const;

export type StatutoryProration =
  (typeof STATUTORY_PRORATION)[keyof typeof STATUTORY_PRORATION];

export const SALARY_DEDUCTION_SOURCE = {
  LATE_RULE: "late_rule",
  ABSENCE: "absence",
  MANUAL: "manual",
} as const;

export type SalaryDeductionSource =
  (typeof SALARY_DEDUCTION_SOURCE)[keyof typeof SALARY_DEDUCTION_SOURCE];

export const SALARY_DEDUCTION_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type SalaryDeductionStatus =
  (typeof SALARY_DEDUCTION_STATUS)[keyof typeof SALARY_DEDUCTION_STATUS];

export const SALARY_PAYOUT_STATUS = {
  GENERATED: "generated",
  PAID: "paid",
  CANCELLED: "cancelled",
} as const;

export type SalaryPayoutStatus =
  (typeof SALARY_PAYOUT_STATUS)[keyof typeof SALARY_PAYOUT_STATUS];

/** Longest range one payout may cover. */
export const SALARY_PAYOUT_MAX_RANGE_DAYS = 31;

export const SALARY_EARNING_FIELDS = [
  "basic",
  "hra",
  "conveyance",
  "medicalAllowance",
  "specialAllowance",
  "otherAllowance",
] as const;

export const SALARY_DEDUCTION_FIELDS = [
  "lop",
  "lateRule",
  "manual",
  "pf",
  "esi",
  "professionalTax",
  "other",
] as const;

/** Every amount Head may override in the preview. Totals are derived. */
export const SALARY_OVERRIDE_FIELDS = [
  ...SALARY_EARNING_FIELDS.map((f) => `earnings.${f}` as const),
  ...SALARY_DEDUCTION_FIELDS.map((f) => `deductions.${f}` as const),
  "net",
] as const;

export type SalaryOverrideField = (typeof SALARY_OVERRIDE_FIELDS)[number];

export interface SalarySettingsValues {
  perDayBasis: SalaryPerDayBasis;
  lateRule: {
    enabled: boolean;
    freeLatesPerMonth: number;
    everyNLates: number;
    deductionDays: number;
    /** A late longer than this costs ½ day on its own. null = off. */
    severeLateMinutes: number | null;
  };
  halfDayRule: {
    enabled: boolean;
    /** Worked less than this = ½ day. null = half the branch shift length. */
    minWorkingMinutes: number | null;
  };
  missedCheckoutPolicy: MissedCheckoutPolicy;
  /** true: each absent day is a suggestion Head approves/rejects in the preview. */
  absenceRequiresApproval: boolean;
  statutoryProration: StatutoryProration;
}

/**
 * Used whenever no SalarySettings document is saved: only half days and
 * absences (including unpaid leave) are deducted.
 */
export const DEFAULT_SALARY_SETTINGS: SalarySettingsValues = {
  perDayBasis: SALARY_PER_DAY_BASIS.WORKING_DAYS,
  lateRule: {
    enabled: false,
    freeLatesPerMonth: 2,
    everyNLates: 3,
    deductionDays: 0.5,
    severeLateMinutes: null,
  },
  halfDayRule: {
    enabled: true,
    minWorkingMinutes: null,
  },
  missedCheckoutPolicy: MISSED_CHECKOUT_POLICY.FULL_DAY,
  absenceRequiresApproval: false,
  statutoryProration: STATUTORY_PRORATION.PRORATE,
};

export const SALARY_SETTINGS_KEY = "global";
