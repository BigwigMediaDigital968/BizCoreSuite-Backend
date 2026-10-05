export const HOLIDAY_TYPE = {
  NATIONAL: "national",
  REGIONAL: "regional",
  COMPANY: "company",
  OPTIONAL: "optional",
} as const;

export type HolidayType =
  (typeof HOLIDAY_TYPE)[keyof typeof HOLIDAY_TYPE];