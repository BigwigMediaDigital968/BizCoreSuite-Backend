import type { NextFunction, Request, Response } from "express";

import {
  createEmployeeProfile,
  getEmployeeCountByBranch,
  getEmployeeProfileById,
  listEmployees,
  updateEmployeeProfile,
} from "../services/employee.service.js";

import {
  createEmployeeProfileSchema,
  employeeListQuerySchema,
  updateEmployeeProfileSchema,
} from "../validators/employee.validator.js";

import { createAuditLog } from "../services/audit.service.js";
import { Types } from "mongoose";

export interface IPopulatedEmployeeProfile {
  _id: Types.ObjectId;
  employeeCode: string;
  user: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  branch: {
    _id: Types.ObjectId;
    name: string;
    code: string;
    city: string;
    state?: string;
  };
  reportingManager?: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    role: string;
  };
  // Add other required properties as needed
}

export const createEmployeeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const data = createEmployeeProfileSchema.parse(req.body);

    const employee = await createEmployeeProfile(data, {
      userId: req.user.id,
      role: req.user.role,
      branches: req.user.branches,
    });

    await createAuditLog({
      actor: req.user.id,
      action: "EMPLOYEE_CREATED",
      entity: "EmployeeProfile",
      entityId: employee._id.toString(),
      branch: employee.branch.toString(),
      metadata: {
        employeeCode: employee.employeeCode,
        user: employee.user.toString(),
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(201).json({
      success: true,
      message: "Employee profile created successfully",
      data: employee,
    });
  } catch (error) {
    next(error);
  }
};

export const updateEmployeeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const employeeId = req.params.id;

    if (typeof employeeId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid employee ID",
        code: "INVALID_EMPLOYEE_ID",
      });
    }

    // Validate update payload
    const data = updateEmployeeProfileSchema.parse(req.body);

    const updatedEmployee = await updateEmployeeProfile(employeeId, data, {
      userId: req.user.id,
      role: req.user.role,
      branches: req.user.branches,
    });

    // Create audit log entry for the update operation
    await createAuditLog({
      actor: req.user.id,
      action: "EMPLOYEE_UPDATED",
      entity: "EmployeeProfile",
      entityId: updatedEmployee._id.toString(),
      branch: updatedEmployee.branch.toString(),
      metadata: {
        employeeCode: updatedEmployee.employeeCode,
        updatedFields: Object.keys(data),
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      message: "Employee profile updated successfully",
      data: updatedEmployee,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const { id } = req.params;

    if (typeof id !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid ID provided",
        code: "INVALID_ID",
      });
    }

    const employee = await getEmployeeProfileById(id, {
      userId: req.user.id,
      role: req.user.role,
      branches: req.user.branches,
    });

    return res.status(200).json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
};

export const listEmployeesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const query = employeeListQuerySchema.parse(req.query);

    const result = await listEmployees(
      {
        userId: req.user.id,
        role: req.user.role,
        branches: req.user.branches,
      },
      query,
    );

    return res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getBranchEmployeeCountController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const { branchId } = req.params;

    if (typeof branchId !== "string" || !Types.ObjectId.isValid(branchId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid branch ID provided",
        code: "INVALID_BRANCH_ID",
      });
    }

    const result = await getEmployeeCountByBranch(branchId, {
      userId: req.user.id,
      role: req.user.role,
      branches: req.user.branches,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
