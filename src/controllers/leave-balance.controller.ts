import type { Request, Response, NextFunction } from "express";
import {
  getEmployeeLeaveBalances,
  getLeaveBalanceTransactions,
  adjustLeaveBalance,
} from "../services/leave-balance.service.js";
import { allocateLeaveBalanceSchema } from "../validators/leave-balance.validator.js";
import { allocateLeaveBalance } from "../services/leave-balance-allocation.service.js";
import { AppError } from "../utils/AppError.js";

export const allocateLeaveBalanceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user?.id) {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    }

    const data = allocateLeaveBalanceSchema.parse(req.body);

    const balance = await allocateLeaveBalance(data, req.user.id);

    return res.status(201).json({
      success: true,
      message: "Leave allocated successfully",
      data: {
        balance,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getLeaveBalancesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const year = req.query.year
      ? Number(req.query.year)
      : new Date().getFullYear();

    const result = await getEmployeeLeaveBalances({
      employeeId: userId,
      year,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmployeeLeaveBalancesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role; // Ensure role is available on req.user

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    let targetEmployeeId = String(req.params.employeeId);

    // If non-admin/non-manager, restrict employeeId strictly to the authenticated user's ID
    if (userRole === "employee") {
      targetEmployeeId = userId;
    }

    const year = req.query.year
      ? Number(req.query.year)
      : new Date().getFullYear();

    const result = await getEmployeeLeaveBalances({
      employeeId: targetEmployeeId,
      year,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getLeaveBalanceTransactionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const employeeId = String(req.params.employeeId);
    const leaveBalanceId = req.query.leaveBalanceId
      ? String(req.query.leaveBalanceId)
      : undefined;

    const result = await getLeaveBalanceTransactions({
      employeeId,
      leaveBalanceId,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const adjustLeaveBalanceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const leaveBalanceId = String(req.params.id);
    const { employeeId, amount, remarks } = req.body;

    const result = await adjustLeaveBalance({
      employeeId,
      leaveBalanceId,
      amount: Number(amount),
      remarks,
      performedBy: userId,
    });

    return res.status(200).json({
      success: true,
      message: "Leave balance adjusted successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
