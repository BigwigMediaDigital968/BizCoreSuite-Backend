import { ROLES, type Role } from "../constants/roles.js";

// 1. Strongly type keys and values using `Role` instead of generic `string`
export const ROLE_HIERARCHY: Record<Role, Role[]> = {
  [ROLES.HEAD]: [ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE],
  [ROLES.ADMIN]: [ROLES.MANAGER, ROLES.EMPLOYEE],
  [ROLES.MANAGER]: [ROLES.EMPLOYEE],
  [ROLES.EMPLOYEE]: [],
};

export const canManageRole = (actorRole: Role, targetRole: Role): boolean => {
  // 2. Add safe fallback `?? []` so it never tries to call .includes() on undefined
  const manageableRoles = ROLE_HIERARCHY[actorRole] ?? [];

  return manageableRoles.includes(targetRole);
};
