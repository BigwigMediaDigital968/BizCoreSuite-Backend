import type { Role } from "../constants/roles.js";

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
  branchId?: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: Role;
}