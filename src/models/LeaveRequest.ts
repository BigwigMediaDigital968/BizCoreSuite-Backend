import mongoose, { Document, Schema, Types } from "mongoose";

import {
  LEAVE_REQUEST_STATUS,
  type LeaveRequestStatus,
  LEAVE_DURATION_TYPE,
  type LeaveDurationType,
} from "../constants/leaveRequest.js";

export interface ILeaveRequest extends Document {
  employee: Types.ObjectId;

  branch: Types.ObjectId;

  leavePolicy: Types.ObjectId;

  leaveType: string;

  startDate: Date;

  endDate: Date;

  durationType: LeaveDurationType;

  totalDays: number;

  reason?: string;

  status: LeaveRequestStatus;

  appliedAt: Date;

  approvedBy?: Types.ObjectId;

  approvedAt?: Date;

  rejectedBy?: Types.ObjectId;

  rejectedAt?: Date;

  rejectionReason?: string;

  cancelledAt?: Date;

  cancellationReason?: string;

  createdAt: Date;

  updatedAt: Date;
}

const leaveRequestSchema = new Schema<ILeaveRequest>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    leavePolicy: {
      type: Schema.Types.ObjectId,
      ref: "LeavePolicy",
      required: true,
      index: true,
    },

    leaveType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
      index: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    durationType: {
      type: String,
      enum: Object.values(LEAVE_DURATION_TYPE),
      required: true,
      default: LEAVE_DURATION_TYPE.FULL_DAY,
    },

    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    status: {
      type: String,
      enum: Object.values(LEAVE_REQUEST_STATUS),
      required: true,
      default: LEAVE_REQUEST_STATUS.PENDING,
      index: true,
    },

    appliedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: {
      type: Date,
    },

    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    rejectedAt: {
      type: Date,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    cancelledAt: {
      type: Date,
    },

    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  },
);

leaveRequestSchema.index({
  employee: 1,
  status: 1,
  startDate: -1,
});

leaveRequestSchema.index({
  branch: 1,
  status: 1,
  startDate: -1,
});

leaveRequestSchema.index({
  employee: 1,
  startDate: 1,
  endDate: 1,
});

export const LeaveRequest = mongoose.model<ILeaveRequest>(
  "LeaveRequest",
  leaveRequestSchema,
);
