/** Minutes before the branch's closing time that the report portal opens. */
export const DAILY_REPORT_OPENS_BEFORE_MINUTES = 30;

/**
 * Minutes after closing time that reports are still accepted, flagged LATE.
 * Only employees who are already signed in can use this: login and token
 * refresh are blocked after hours (see checkAccessPermission).
 */
export const DAILY_REPORT_LATE_GRACE_MINUTES = 60;

export const DAILY_REPORT_MAX_CUSTOM_FIELDS = 20;

export const DAILY_REPORT_STATUS = {
  SUBMITTED: "SUBMITTED",
  LATE: "LATE",
} as const;

export type DailyReportStatus =
  (typeof DAILY_REPORT_STATUS)[keyof typeof DAILY_REPORT_STATUS];

export const DAILY_REPORT_WINDOW_STATE = {
  NOT_OPEN: "not_open",
  OPEN: "open",
  LATE: "late",
  CLOSED: "closed",
  NON_WORKING_DAY: "non_working_day",
  ON_LEAVE: "on_leave",
} as const;

export type DailyReportWindowState =
  (typeof DAILY_REPORT_WINDOW_STATE)[keyof typeof DAILY_REPORT_WINDOW_STATE];
