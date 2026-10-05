export const ATTENDANCE_MODE = {
  WFO: "wfo",
} as const;

export type AttendanceMode =
  (typeof ATTENDANCE_MODE)[keyof typeof ATTENDANCE_MODE];