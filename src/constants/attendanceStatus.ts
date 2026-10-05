export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  LATE: "late",
  HALF_DAY: "half_day",
  ABSENT: "absent",
  ON_LEAVE: "on_leave",
  HOLIDAY: "holiday",
  WEEK_OFF: "week_off",
} as const;

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];