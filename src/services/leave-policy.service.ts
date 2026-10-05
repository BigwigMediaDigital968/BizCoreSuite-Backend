import mongoose from "mongoose";

import { LeaveType } from "../constants/leave.js";
import { ILeavePolicy, LeavePolicy } from "../models/LeavePolicy.js";
import { AppError } from "../utils/AppError.js";

type LeavePolicyQuery = Record<string, any>;

interface CreateLeavePolicyInput {
  name: string;
  code: string;
  branch?: string | null;
  leaveType: LeaveType;

  annualAllocation: number;
  allowCarryForward: boolean;
  maximumCarryForward?: number | null;
  isPaid?: boolean;
  allowHalfDay: boolean;
  allowNegativeBalance?: boolean;
  minimumNoticeDays?: number;
  maximumConsecutiveDays?: number | null;
  applicableFrom: Date;
  applicableTo?: Date | null;
  isActive: boolean;
}

interface UpdateLeavePolicyInput extends Partial<CreateLeavePolicyInput> {}

interface ListLeavePolicyInput {
  branch?: string;
  leaveType?: LeaveType;
  isActive?: boolean;
  page: number;
  limit: number;
}

const validateBranchId = (branchId?: string | null) => {
  if (branchId && !mongoose.Types.ObjectId.isValid(branchId)) {
    throw new AppError("Invalid branch ID", 400, "INVALID_BRANCH_ID");
  }
};

export const createLeavePolicy = async (
  data: CreateLeavePolicyInput,
  userId: string,
) => {
  validateBranchId(data.branch);

  const filter: LeavePolicyQuery = {
    code: data.code,
    isDeleted: false,
  };

  if (data.branch) {
    filter.branch = new mongoose.Types.ObjectId(data.branch);
  } else {
    filter.branch = null;
  }

  const existingPolicy = await LeavePolicy.findOne(filter);

  if (existingPolicy) {
    throw new AppError(
      "Leave policy with this code already exists",
      409,
      "LEAVE_POLICY_ALREADY_EXISTS",
    );
  }

  const policy = await LeavePolicy.create({
    ...data,
    branch: data.branch ? new mongoose.Types.ObjectId(data.branch) : null,
    createdBy: new mongoose.Types.ObjectId(userId),
  });

  return policy;
};

export const getLeavePolicyById = async (policyId: string) => {
  if (!mongoose.Types.ObjectId.isValid(policyId)) {
    throw new AppError(
      "Invalid leave policy ID",
      400,
      "INVALID_LEAVE_POLICY_ID",
    );
  }

  const policy = await LeavePolicy.findOne({
    _id: policyId,
    isDeleted: false,
  });

  if (!policy) {
    throw new AppError("Leave policy not found", 404, "LEAVE_POLICY_NOT_FOUND");
  }

  return policy;
};

export const listLeavePolicies = async (data: ListLeavePolicyInput) => {
  const filter: LeavePolicyQuery = {
    isDeleted: false,
  };

  if (data.branch) {
    validateBranchId(data.branch);
    filter.branch = new mongoose.Types.ObjectId(data.branch);
  }

  if (data.leaveType) {
    filter.leaveType = data.leaveType;
  }

  if (typeof data.isActive === "boolean") {
    filter.isActive = data.isActive;
  }

  const skip = (data.page - 1) * data.limit;

  const [policies, total] = await Promise.all([
    LeavePolicy.find(filter)
      .sort({
        applicableFrom: -1,
        createdAt: -1,
      })
      .skip(skip)
      .limit(data.limit)
      .lean(),

    LeavePolicy.countDocuments(filter),
  ]);

  return {
    policies,
    pagination: {
      page: data.page,
      limit: data.limit,
      total,
      totalPages: Math.ceil(total / data.limit),
    },
  };
};

export const updateLeavePolicy = async (
  policyId: string,
  data: UpdateLeavePolicyInput,
  userId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(policyId)) {
    throw new AppError(
      "Invalid leave policy ID",
      400,
      "INVALID_LEAVE_POLICY_ID",
    );
  }

  const policy = await LeavePolicy.findOne({
    _id: policyId,
    isDeleted: false,
  });

  if (!policy) {
    throw new AppError("Leave policy not found", 404, "LEAVE_POLICY_NOT_FOUND");
  }

  if (data.code) {
    const branchVal = data.branch !== undefined ? data.branch : policy.branch;

    const duplicateFilter: LeavePolicyQuery = {
      _id: { $ne: policyId },
      code: data.code,
      isDeleted: false,
      branch: branchVal
        ? new mongoose.Types.ObjectId(branchVal.toString())
        : null,
    };

    const duplicate = await LeavePolicy.findOne(duplicateFilter);

    if (duplicate) {
      throw new AppError(
        "Leave policy with this code already exists",
        409,
        "LEAVE_POLICY_ALREADY_EXISTS",
      );
    }
  }

  Object.assign(policy, data);

  if (data.branch !== undefined) {
    policy.branch = data.branch
      ? new mongoose.Types.ObjectId(data.branch)
      : null;
  }

  policy.updatedBy = new mongoose.Types.ObjectId(userId);

  await policy.save();

  return policy;
};

export const deactivateLeavePolicy = async (
  policyId: string,
  userId: string,
) => {
  if (!mongoose.Types.ObjectId.isValid(policyId)) {
    throw new AppError(
      "Invalid leave policy ID",
      400,
      "INVALID_LEAVE_POLICY_ID",
    );
  }

  const policy = await LeavePolicy.findOne({
    _id: policyId,
    isDeleted: false,
  });

  if (!policy) {
    throw new AppError("Leave policy not found", 404, "LEAVE_POLICY_NOT_FOUND");
  }

  policy.isActive = false;
  policy.updatedBy = new mongoose.Types.ObjectId(userId);

  await policy.save();

  return policy;
};
