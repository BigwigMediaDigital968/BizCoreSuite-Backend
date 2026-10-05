import mongoose, { Types } from "mongoose";
import { Branch } from "../models/Branch.js";
import { AppError } from "../utils/AppError.js";

export const getBranchAttendanceConfig = async (branchId: string) => {
  const branch = await Branch.findById(branchId).select(
    "_id name code isActive attendanceConfig",
  );

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  return {
    branch: {
      id: branch._id.toString(),
      name: branch.name,
      code: branch.code,
      isActive: branch.isActive,
    },

    attendanceConfig: branch.attendanceConfig,
  };
};

export const updateBranchAttendanceConfig = async (
  branchId: string,
  data: {
    enabled?: boolean;

    timezone?: string;

    location?: {
      latitude: number;
      longitude: number;
      radiusMeters: number;
    };

    workingDays?: number[];

    workingHours?: {
      startTime: string;
      endTime: string;
    };

    gracePeriodMinutes?: number;
  },
  updatedBy: string,
) => {
  const branch = await Branch.findById(branchId);

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (!branch.isActive) {
    throw new AppError(
      "Cannot update attendance configuration of an inactive branch",
      400,
      "BRANCH_INACTIVE",
    );
  }

  if (data.enabled !== undefined) {
    branch.attendanceConfig.enabled = data.enabled;
  }

  if (data.timezone !== undefined) {
    branch.attendanceConfig.timezone = data.timezone;
  }

  if (data.location !== undefined) {
    branch.attendanceConfig.location = data.location;
  }

  if (data.workingDays !== undefined) {
    branch.attendanceConfig.workingDays = data.workingDays;
  }

  if (data.workingHours !== undefined) {
    branch.attendanceConfig.workingHours = data.workingHours;
  }

  if (data.gracePeriodMinutes !== undefined) {
    branch.attendanceConfig.gracePeriodMinutes = data.gracePeriodMinutes;
  }

  branch.updatedBy = new mongoose.Types.ObjectId(updatedBy);

  await branch.save();

  return branch;
};
