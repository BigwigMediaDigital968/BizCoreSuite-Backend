export const ATTENDANCE_STATUS = {
  PRESENT: "present",
  LATE: "late",
  HALF_DAY: "half_day",
  ABSENT: "absent",
  ON_LEAVE: "on_leave",
} as const;

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export const ATTENDANCE_WORK_MODE = {
  WFO: "WFO",
  WFH: "WFH",
} as const;

export type AttendanceWorkMode =
  (typeof ATTENDANCE_WORK_MODE)[keyof typeof ATTENDANCE_WORK_MODE];

export const ATTENDANCE_EVENT = {
  CHECK_IN: "check_in",
  CHECK_OUT: "check_out",
} as const;

export type AttendanceEvent =
  (typeof ATTENDANCE_EVENT)[keyof typeof ATTENDANCE_EVENT];
