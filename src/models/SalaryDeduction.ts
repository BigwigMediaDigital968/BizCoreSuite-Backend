import mongoose, { Document, Schema } from "mongoose";

import {
  SALARY_DEDUCTION_SOURCE,
  SALARY_DEDUCTION_STATUS,
  type SalaryDeductionSource,
  type SalaryDeductionStatus,
} from "../constants/salary.js";

export interface ISalaryDeduction extends Document {
  employee: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  /** "YYYY-MM-DD": the day the deduction applies to. */
  date: string;
  source: SalaryDeductionSource;
  /** Exactly one of amount / days; days use the payout's per-day rate. */
  amount?: number | null;
  days?: number | null;
  reason: string;
  status: SalaryDeductionStatus;
  /** null = suggested by the system (late rule, absence). */
  raisedBy?: mongoose.Types.ObjectId | null;
  reviewedBy?: mongoose.Types.ObjectId | null;
  reviewedAt?: Date | null;
  reviewRemark?: string | null;
  /** Set once a payout uses it; it's locked after that. */
  payout?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const salaryDeductionSchema = new Schema<ISalaryDeduction>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branch: { type: Schema.Types.ObjectId, ref: "Branch" },
    date: { type: String, required: true },
    source: {
      type: String,
      enum: Object.values(SALARY_DEDUCTION_SOURCE),
      required: true,
    },
    amount: { type: Number, min: 0, default: null },
    days: { type: Number, min: 0, max: 31, default: null },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: Object.values(SALARY_DEDUCTION_STATUS),
      default: SALARY_DEDUCTION_STATUS.PENDING,
      index: true,
    },
    raisedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewRemark: { type: String, trim: true, maxlength: 500, default: null },
    payout: {
      type: Schema.Types.ObjectId,
      ref: "SalaryPayout",
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

salaryDeductionSchema.index({ employee: 1, date: 1 });
salaryDeductionSchema.index({ status: 1, date: -1 });

export const SalaryDeduction = mongoose.model<ISalaryDeduction>(
  "SalaryDeduction",
  salaryDeductionSchema,
);
