import mongoose, { Document, Schema } from "mongoose";

import {
  LEAVE_BALANCE_TRANSACTION_TYPE,
  LEAVE_BALANCE_TRANSACTION_SOURCE,
  type LeaveBalanceTransactionType,
  type LeaveBalanceTransactionSource,
} from "../constants/leaveBalance.js";

export interface ILeaveBalanceTransaction extends Document {
  employee: mongoose.Types.ObjectId;

  leaveBalance: mongoose.Types.ObjectId;

  leaveRequest?: mongoose.Types.ObjectId;

  leaveType: string;

  transactionType: LeaveBalanceTransactionType;

  source: LeaveBalanceTransactionSource;

  amount: number;

  balanceBefore: number;

  balanceAfter: number;

  performedBy?: mongoose.Types.ObjectId;

  remarks?: string;

  createdAt: Date;

  updatedAt: Date;
}

const transactionSchema = new Schema<ILeaveBalanceTransaction>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    leaveBalance: {
      type: Schema.Types.ObjectId,
      ref: "LeaveBalance",
      required: true,
      index: true,
    },

    leaveRequest: {
      type: Schema.Types.ObjectId,
      ref: "LeaveRequest",
      // index: true,
    },

    leaveType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    transactionType: {
      type: String,
      enum: Object.values(LEAVE_BALANCE_TRANSACTION_TYPE),
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: Object.values(LEAVE_BALANCE_TRANSACTION_SOURCE),
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index({
  employee: 1,
  createdAt: -1,
});

transactionSchema.index({
  leaveBalance: 1,
  createdAt: -1,
});

transactionSchema.index({
  leaveRequest: 1,
});

export const LeaveBalanceTransaction = mongoose.model<ILeaveBalanceTransaction>(
  "LeaveBalanceTransaction",
  transactionSchema,
);
