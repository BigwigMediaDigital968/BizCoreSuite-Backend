export const AUDIT_ENTITIES = {
  USER: "User",
  EMPLOYEE_PROFILE: "EmployeeProfile",
  BRANCH: "Branch",
  HOLIDAY: "Holiday",
  SESSION: "Session",
  AUTH: "Auth",
  LEAD: "Lead",
  CONTACT: "Contact",
  DEAL: "Deal",
  TASK: "Task",
  SALARY_PAYOUT: "SalaryPayout",
  SALARY_DEDUCTION: "SalaryDeduction",
} as const;

export type AuditEntity = (typeof AUDIT_ENTITIES)[keyof typeof AUDIT_ENTITIES];
