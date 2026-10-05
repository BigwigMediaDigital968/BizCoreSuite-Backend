import {
  ROLES
} from "../constants/roles.js";

import type {
  AuthenticatedUser
} from "../types/auth.js";

export const getBranchFilter = (
  user: AuthenticatedUser
) => {
  if (user.role === ROLES.HEAD) {
    return {};
  }

  return {
    branch: {
      $in: user.branches
    }
  };
};