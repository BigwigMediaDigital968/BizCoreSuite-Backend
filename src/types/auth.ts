import type { Role } from "../constants/roles.js";
import type { Permission } from "../constants/permissions.js";

export interface AuthenticatedUser {
  id: string;
  _id?: string; // Optional alias if database queries pass raw MongoDB IDs
  email: string;
  name: string;
  role: Role;
  permissions?: Permission[]; // Optional array if permissions are attached during auth middleware execution
  branchId: string[];
  branches: string[];
}