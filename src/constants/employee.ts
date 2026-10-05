export const EMPLOYMENT_TYPES = {
  FULL_TIME: "full_time",
  PART_TIME: "part_time",
  CONTRACT: "contract",
  INTERN: "intern",
} as const;

export type EmploymentType =
  (typeof EMPLOYMENT_TYPES)[keyof typeof EMPLOYMENT_TYPES];

export const EMPLOYMENT_STATUS = {
  ACTIVE: "active",
  PROBATION: "probation",
  NOTICE_PERIOD: "notice_period",
  RESIGNED: "resigned",
  TERMINATED: "terminated",
  INACTIVE: "inactive",
} as const;

export type EmploymentStatus =
  (typeof EMPLOYMENT_STATUS)[keyof typeof EMPLOYMENT_STATUS];

export const GENDER = {
  MALE: "male",
  FEMALE: "female",
  OTHER: "other",
} as const;

export type Gender = (typeof GENDER)[keyof typeof GENDER];
