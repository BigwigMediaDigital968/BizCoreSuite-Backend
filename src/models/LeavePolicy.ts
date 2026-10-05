import mongoose, { Document, Schema, Types } from "mongoose";

import { LEAVE_TYPE, type LeaveType } from "../constants/leave.js";

export interface ILeavePolicy extends Document {
  name: string;
  code: string;
  isDeleted: boolean;
  leaveType: LeaveType;
  branch?: Types.ObjectId | null;
  annualAllocation: number;
  isPaid: boolean;
  allowHalfDay: boolean;
  allowCarryForward: boolean;
  maximumCarryForward?: number | null;
  allowNegativeBalance: boolean;
  minimumNoticeDays: number;
  maximumConsecutiveDays?: number | null;
  applicableFrom: Date;
  applicableTo?: Date | null;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const leavePolicySchema = new Schema<ILeavePolicy>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    leaveType: {
      type: String,
      enum: Object.values(LEAVE_TYPE),
      required: true,
      index: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
      default: null,
    },
    annualAllocation: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowHalfDay: {
      type: Boolean,
      required: true,
      default: true,
    },
    allowCarryForward: {
      type: Boolean,
      required: true,
      default: false,
    },
    maximumCarryForward: {
      type: Number,
      min: 0,
      default: null,
    },
    allowNegativeBalance: {
      type: Boolean,
      required: true,
      default: false,
    },
    minimumNoticeDays: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    maximumConsecutiveDays: {
      type: Number,
      min: 1,
      default: null,
    },
    applicableFrom: {
      type: Date,
      required: true,
    },
    applicableTo: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

leavePolicySchema.index({
  branch: 1,
  leaveType: 1,
  isActive: 1,
});

leavePolicySchema.index({
  applicableFrom: 1,
  applicableTo: 1,
});

export const LeavePolicy = mongoose.model<ILeavePolicy>(
  "LeavePolicy",
  leavePolicySchema,
);