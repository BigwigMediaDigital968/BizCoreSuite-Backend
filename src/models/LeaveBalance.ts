import mongoose, { Document, Schema } from "mongoose";

export interface ILeaveBalance extends Document {
  employee: mongoose.Types.ObjectId;
  leaveType: string;
  policy: mongoose.Types.ObjectId;
  year: number;
  allocated: number;
  used: number;
  pending: number;
  available: number;
  carriedForward: number;
  adjusted: number;
  createdAt: Date;
  updatedAt: Date;
}

const leaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    leaveType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    policy: {
      type: Schema.Types.ObjectId,
      ref: "LeavePolicy",
      required: true,
      index: true,
    },

    year: {
      type: Number,
      required: true,
    },

    allocated: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    used: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    pending: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    available: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    carriedForward: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    adjusted: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Single compound index definition
leaveBalanceSchema.index(
  {
    employee: 1,
    leaveType: 1,
    year: 1,
  },
  {
    unique: true,
  },
);

export const LeaveBalance = mongoose.model<ILeaveBalance>(
  "LeaveBalance",
  leaveBalanceSchema,
);
