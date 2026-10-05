import mongoose from "mongoose";

import { Holiday } from "../models/Holiday.js";
import { Branch } from "../models/Branch.js";
import { AppError } from "../utils/AppError.js";

export const createHoliday = async (
  data: {
    branchId: string;
    date: string;
    name: string;
    description?: string;
    type: "national" | "regional" | "company" | "optional";
  },
  userId: string,
) => {
  const branch = await Branch.findById(data.branchId);

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (!branch.isActive) {
    throw new AppError(
      "Cannot create holiday for an inactive branch",
      400,
      "BRANCH_INACTIVE",
    );
  }

  const date = new Date(data.date);

  const existingHoliday = await Holiday.findOne({
    branch: data.branchId,
    date,
  });

  if (existingHoliday) {
    throw new AppError(
      "A holiday already exists for this branch on this date",
      409,
      "HOLIDAY_ALREADY_EXISTS",
    );
  }

  const holiday = await Holiday.create({
    branch: new mongoose.Types.ObjectId(data.branchId),

    date,

    name: data.name,

    description: data.description,

    type: data.type,

    createdBy: new mongoose.Types.ObjectId(userId),
  });

  return holiday;
};

export const getBranchHolidays = async (branchId: string, year?: number) => {
  const branch = await Branch.findById(branchId).select(
    "_id name code isActive",
  );

  if (!branch) {
    throw new AppError("Branch not found", 404, "BRANCH_NOT_FOUND");
  }

  const filter: Record<string, unknown> = {
    branch: branchId,
    isActive: true,
  };

  if (year !== undefined) {
    const start = new Date(`${year}-01-01T00:00:00.000Z`);

    const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    filter.date = {
      $gte: start,
      $lt: end,
    };
  }

  return Holiday.find(filter).sort({
    date: 1,
  });
};

export const updateHoliday = async (
  holidayId: string,
  data: {
    date?: string;
    name?: string;
    description?: string;
    type?: "national" | "regional" | "company" | "optional";
    isActive?: boolean;
  },
  userId: string,
) => {
  const holiday = await Holiday.findById(holidayId);

  if (!holiday) {
    throw new AppError("Holiday not found", 404, "HOLIDAY_NOT_FOUND");
  }

  if (data.date) {
    holiday.date = new Date(data.date);
  }

  if (data.name !== undefined) {
    holiday.name = data.name;
  }

  if (data.description !== undefined) {
    holiday.description = data.description;
  }

  if (data.type !== undefined) {
    holiday.type = data.type;
  }

  if (data.isActive !== undefined) {
    holiday.isActive = data.isActive;
  }

  holiday.updatedBy = new mongoose.Types.ObjectId(userId);

  await holiday.save();

  return holiday;
};

export const deleteHoliday = async (holidayId: string, userId: string) => {
  const holiday = await Holiday.findById(holidayId);

  if (!holiday) {
    throw new AppError("Holiday not found", 404, "HOLIDAY_NOT_FOUND");
  }

  holiday.isActive = false;

  holiday.updatedBy = new mongoose.Types.ObjectId(userId);

  await holiday.save();

  return holiday;
};
