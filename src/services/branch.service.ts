import { ROLES } from "../constants/roles.js";
import { Branch } from "../models/Branch.js";
import { User } from "../models/User.js";
import { AuthenticatedUser } from "../types/auth.js";
import { AppError } from "../utils/AppError.js";
import { Types } from "mongoose";

interface CreateBranchInput {
  name: string;
  code: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
}

interface UpdateBranchInput {
  name?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
}

const validateBranchId = (branchId: string) => {
  if (!Types.ObjectId.isValid(branchId)) {
    throw new AppError("Invalid branch ID", 400, "INVALID_BRANCH_ID");
  }
};

export const createBranch = async (data: CreateBranchInput, userId: string) => {
  const existingBranch = await Branch.findOne({
    code: data.code.toUpperCase(),
  });

  if (existingBranch) {
    throw new AppError(
      "A branch with this code already exists",
      409,
      "BRANCH_CODE_EXISTS",
    );
  }

  const branch = await Branch.create({
    ...data,
    code: data.code.toUpperCase(),
    createdBy: userId,
  });

  await User.findByIdAndUpdate(userId, {
    $addToSet: {
      branches: branch._id,
    },
  });

  return branch;
};

export const getBranches = async (user: AuthenticatedUser) => {
  if (user.role === ROLES.HEAD) {
    return Branch.find().sort({
      name: 1,
    });
  }

  return Branch.find({
    _id: {
      $in: user.branches,
    },
  }).sort({
    name: 1,
  });
};

export const updateBranch = async (
  branchId: string,
  data: UpdateBranchInput,
) => {
  validateBranchId(branchId);
  const branch = await Branch.findById(branchId);

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (!branch.isActive) {
    throw new AppError(
      "Cannot update an inactive branch",
      400,
      "BRANCH_INACTIVE",
    );
  }

  // Only update fields that were actually provided.
  Object.assign(branch, data);

  await branch.save();

  return branch;
};

export const updateBranchStatus = async (
  branchId: string,
  isActive: boolean,
) => {
  validateBranchId(branchId);
  const branch = await Branch.findById(branchId);

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (branch.isActive === isActive) {
    throw new AppError(
      isActive ? "Branch is already active" : "Branch is already inactive",
      400,
      isActive ? "BRANCH_ALREADY_ACTIVE" : "BRANCH_ALREADY_INACTIVE",
    );
  }

  branch.isActive = isActive;

  await branch.save();

  return branch;
};

