import { Router, type Request, type Response } from "express";
import { ROLE_PERMISSIONS } from "../permissions/rolePermissions.js";
import { ROLES, type Role } from "../constants/roles.js";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  // Extract role from query param, e.g. /api/v1/permissions?role=manager
  const role = req.query.role as Role;

  // If role is provided, return that specific role's permissions
  if (role) {
    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role specified",
      });
    }

    return res.status(200).json({
      success: true,
      data: ROLE_PERMISSIONS[role] || [],
    });
  }

  // If no role query param, return all role permissions
  return res.status(200).json({
    success: true,
    data: ROLE_PERMISSIONS,
  });
});

export default router;