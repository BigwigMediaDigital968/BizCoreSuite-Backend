export const LEAD_FOLLOW_UP_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  MISSED: "MISSED",
} as const;

export type LeadFollowUpStatus =
  (typeof LEAD_FOLLOW_UP_STATUS)[keyof typeof LEAD_FOLLOW_UP_STATUS];