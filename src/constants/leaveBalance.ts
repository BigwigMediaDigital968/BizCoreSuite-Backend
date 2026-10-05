export const LEAVE_BALANCE_TRANSACTION_TYPE = {
  CREDIT: "credit",
  DEBIT: "debit",
  RESTORE: "restore",
  ADJUSTMENT: "adjustment",
  RESERVE: "reserve",
  RELEASE: "release",
} as const;

export type LeaveBalanceTransactionType =
  (typeof LEAVE_BALANCE_TRANSACTION_TYPE)[keyof typeof LEAVE_BALANCE_TRANSACTION_TYPE];

export const LEAVE_BALANCE_TRANSACTION_SOURCE = {
  POLICY_ALLOCATION: "policy_allocation",
  LEAVE_APPLICATION: "leave_application",
  LEAVE_APPROVAL: "leave_approval",
  LEAVE_CANCELLATION: "leave_cancellation",
  LEAVE_REJECTION: "leave_rejection",
  ADMIN_ADJUSTMENT: "admin_adjustment",
  YEAR_END: "year_end",
} as const;

export type LeaveBalanceTransactionSource =
  (typeof LEAVE_BALANCE_TRANSACTION_SOURCE)[keyof typeof LEAVE_BALANCE_TRANSACTION_SOURCE];
