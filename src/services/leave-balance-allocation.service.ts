import mongoose from "mongoose";

import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { LeavePolicy } from "../models/LeavePolicy.js";
import { LeaveBalance } from "../models/LeaveBalance.js";
import { LeaveBalanceTransaction } from "../models/LeaveBalanceTransaction.js";

import {
  LEAVE_BALANCE_TRANSACTION_TYPE,
  LEAVE_BALANCE_TRANSACTION_SOURCE,
} from "../constants/leaveBalance.js";

import { EMPLOYMENT_STATUS } from "../constants/employee.js";
import { AppError } from "../utils/AppError.js";

export interface AllocateLeaveBalanceInput {
  employeeId: string;
  leavePolicyId: string;
  year: number;
}

export const allocateLeaveBalance = async (
  data: AllocateLeaveBalanceInput,
  performedBy: string,
) => {
  // Helper containing the actual operational steps
  const executeAllocation = async (session?: mongoose.ClientSession) => {
    /**
     * 1. Validate employee
     */
    const employee = await EmployeeProfile.findOne({
      user: new mongoose.Types.ObjectId(data.employeeId),
      employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
    })
      .session(session ?? null)
      .lean();

    if (!employee) {
      throw new AppError(
        "Active employee not found",
        404,
        "EMPLOYEE_NOT_FOUND",
      );
    }

    /**
     * 2. Validate policy
     */
    const policy = await LeavePolicy.findById(data.leavePolicyId)
      .session(session ?? null)
      .lean();

    if (!policy) {
      throw new AppError(
        "Leave policy not found",
        404,
        "LEAVE_POLICY_NOT_FOUND",
      );
    }

    /**
     * 3. Policy must be active
     */
    if (!policy.isActive) {
      throw new AppError(
        "Cannot allocate an inactive leave policy",
        400,
        "LEAVE_POLICY_INACTIVE",
      );
    }

    /**
     * 4. Check branch compatibility
     */
    if (
      policy.branch &&
      policy.branch.toString() !== employee.branch.toString()
    ) {
      throw new AppError(
        "Leave policy does not belong to employee's branch",
        400,
        "LEAVE_POLICY_BRANCH_MISMATCH",
      );
    }

    /**
     * 5. Check applicable dates
     */
    const yearStart = new Date(data.year, 0, 1);
    const yearEnd = new Date(data.year, 11, 31, 23, 59, 59, 999);

    if (policy.applicableFrom > yearEnd) {
      throw new AppError(
        "Leave policy is not applicable for this year",
        400,
        "POLICY_NOT_APPLICABLE",
      );
    }

    if (policy.applicableTo && policy.applicableTo < yearStart) {
      throw new AppError(
        "Leave policy is not applicable for this year",
        400,
        "POLICY_NOT_APPLICABLE",
      );
    }

    /**
     * 6. Check duplicate balance
     */
    const existingBalance = await LeaveBalance.findOne({
      employee: new mongoose.Types.ObjectId(data.employeeId),
      leaveType: policy.leaveType,
      year: data.year,
    }).session(session ?? null);

    if (existingBalance) {
      throw new AppError(
        `Leave balance already exists for ${policy.leaveType} for ${data.year}`,
        409,
        "LEAVE_BALANCE_ALREADY_EXISTS",
      );
    }

    /**
     * 7. Create balance
     */
    const allocated = policy.annualAllocation ?? 0;

    const balance = new LeaveBalance({
      employee: new mongoose.Types.ObjectId(data.employeeId),
      leaveType: policy.leaveType,
      policy: policy._id,
      year: data.year,
      allocated,
      used: 0,
      pending: 0,
      carriedForward: 0,
      adjusted: 0,
      available: allocated,
    });

    await balance.save({ session });

    /**
     * 8. Create transaction
     */
    await LeaveBalanceTransaction.create(
      [
        {
          employee: balance.employee,
          leaveBalance: balance._id,
          leaveType: balance.leaveType,
          transactionType: LEAVE_BALANCE_TRANSACTION_TYPE.CREDIT,
          source: LEAVE_BALANCE_TRANSACTION_SOURCE.POLICY_ALLOCATION,
          amount: allocated,
          balanceBefore: 0,
          balanceAfter: allocated,
          performedBy: new mongoose.Types.ObjectId(performedBy),
          remarks: `Leave allocated from policy ${policy.name}`,
        },
      ],
      session ? { session } : {},
    );

    return balance;
  };

  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const balance = await executeAllocation(session);
    await session.commitTransaction();
    return balance;
  } catch (error: any) {
    await session.abortTransaction();

    // Fallback if local MongoDB instance does not support transactions (Code 20 / Standalone)
    if (error?.code === 20 || error?.message?.includes("replica set")) {
      return await executeAllocation();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};