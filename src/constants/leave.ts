export const LEAVE_TYPE = {
  CASUAL: "casual",
  SICK: "sick",
  EARNED: "earned",
  PAID: "paid",
  UNPAID: "unpaid",
  MATERNITY: "maternity",
  PATERNITY: "paternity",
  COMPENSATORY: "compensatory",
  BEREAVEMENT: "bereavement",
  ANNUAL: "annual",
  OTHER: "other",
} as const;

export type LeaveType = (typeof LEAVE_TYPE)[keyof typeof LEAVE_TYPE];

export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];

export const LEAVE_DURATION = {
  FULL_DAY: "full_day",
  HALF_DAY: "half_day",
  SECOND_HALF: "second_half",
} as const;

export type LeaveDuration =
  (typeof LEAVE_DURATION)[keyof typeof LEAVE_DURATION];

export const LEAVE_HALF_DAY = {
  FIRST_HALF: "first_half",
  SECOND_HALF: "second_half",
} as const;

export type LeaveHalfDay = (typeof LEAVE_HALF_DAY)[keyof typeof LEAVE_HALF_DAY];

export const LEAVE_BALANCE_TRANSACTION_TYPE = {
  ALLOCATED: "allocated",
  USED: "used",
  RESTORED: "restored",
  ADJUSTED: "adjusted",
} as const;

export type LeaveBalanceTransactionType =
  (typeof LEAVE_BALANCE_TRANSACTION_TYPE)[keyof typeof LEAVE_BALANCE_TRANSACTION_TYPE];
