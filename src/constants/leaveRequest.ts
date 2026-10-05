export const LEAVE_REQUEST_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export type LeaveRequestStatus =
  (typeof LEAVE_REQUEST_STATUS)[keyof typeof LEAVE_REQUEST_STATUS];

export const LEAVE_DURATION_TYPE = {
  FULL_DAY: "full_day",
  FIRST_HALF: "first_half",
  SECOND_HALF: "second_half",
} as const;

export type LeaveDurationType =
  (typeof LEAVE_DURATION_TYPE)[keyof typeof LEAVE_DURATION_TYPE];