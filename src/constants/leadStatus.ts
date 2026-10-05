export const LEAD_STATUS = {
  NEW: "new",
  ASSIGNED: "assigned",
  CONTACTED: "contacted",
  FOLLOW_UP: "follow_up",
  INTERESTED: "interested",
  QUALIFIED: "qualified",
  CONVERTED: "converted",
  LOST: "lost",
  CLOSED: "closed",
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];
