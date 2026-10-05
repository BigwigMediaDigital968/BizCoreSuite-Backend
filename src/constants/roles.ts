export const ROLES = {
  HEAD: "head",
  ADMIN: "admin",
  MANAGER: "manager",
  EMPLOYEE: "employee"
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];