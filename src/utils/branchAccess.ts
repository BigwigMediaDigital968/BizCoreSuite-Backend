import { ROLES } from "../constants/roles.js";

import type { Role } from "../constants/roles.js";

interface BranchAccessUser {
  id: string;
  role: Role;
  branches: string[];
}

export const hasGlobalBranchAccess = (
  user: BranchAccessUser
): boolean => {
  return user.role === ROLES.HEAD;
};

export const hasBranchAccess = (
  user: BranchAccessUser,
  branchId: string
): boolean => {
  if (hasGlobalBranchAccess(user)) {
    return true;
  }

  return user.branches.includes(branchId);
};