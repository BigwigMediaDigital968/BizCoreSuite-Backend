import mongoose, { Document, Schema } from "mongoose";

import {
  SALARY_PAYOUT_STATUS,
  type SalaryPayoutStatus,
  type SalarySettingsValues,
} from "../constants/salary.js";

export interface IPayoutOverride {
  field: string;
  calculated: number;
  value: number;
  reason: string;
}

export interface IPayoutAdjustment {
  label: string;
  amount: number;
  note?: string;
}

export interface IPayoutLine {
  employee: mongoose.Types.ObjectId;
  employeeCode: string;
  name: string;
  email: string;
  designation?: string;
  branch?: { _id: mongoose.Types.ObjectId; name: string; code: string } | null;
  salarySnapshot: Record<string, number>;
  days: Record<string, number>;
  lateCount: number;
  perDayRate: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  deductionRefs: mongoose.Types.ObjectId[];
  suggestions: unknown;
  manualDeductions: unknown;
  adjustments: IPayoutAdjustment[];
  overrides: IPayoutOverride[];
  calculatedNet: number;
  net: number;
  warnings: string[];
}

/** An immutable snapshot: nothing here is recalculated after generation. */
export interface ISalaryPayout extends Document {
  payoutNo: string;
  from: string;
  to: string;
  status: SalaryPayoutStatus;
  generatedBy: mongoose.Types.ObjectId;
  generatedAt: Date;
  paidAt?: Date | null;
  paidBy?: mongoose.Types.ObjectId | null;
  cancelledAt?: Date | null;
  cancelledBy?: mongoose.Types.ObjectId | null;
  cancelReason?: string | null;
  settingsSnapshot: SalarySettingsValues & { isDefault: boolean };
  totals: {
    employees: number;
    gross: number;
    deductions: number;
    adjustments: number;
    net: number;
    overriddenLines: number;
  };
  lines: IPayoutLine[];
  createdAt: Date;
  updatedAt: Date;
}

const payoutLineSchema = new Schema<IPayoutLine>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeCode: { type: String, default: "" },
    name: { type: String, required: true },
    email: { type: String, default: "" },
    designation: { type: String },
    branch: { type: Schema.Types.Mixed, default: null },
    salarySnapshot: { type: Schema.Types.Mixed, required: true },
    days: { type: Schema.Types.Mixed, required: true },
    lateCount: { type: Number, default: 0 },
    perDayRate: { type: Number, default: 0 },
    earnings: { type: Schema.Types.Mixed, required: true },
    deductions: { type: Schema.Types.Mixed, required: true },
    deductionRefs: [{ type: Schema.Types.ObjectId, ref: "SalaryDeduction" }],
    suggestions: { type: Schema.Types.Mixed, default: [] },
    manualDeductions: { type: Schema.Types.Mixed, default: [] },
    adjustments: {
      type: [
        {
          _id: false,
          label: { type: String, required: true, maxlength: 60 },
          amount: { type: Number, required: true },
          note: { type: String, maxlength: 300 },
        },
      ],
      default: [],
    },
    overrides: {
      type: [
        {
          _id: false,
          field: { type: String, required: true },
          calculated: { type: Number, required: true },
          value: { type: Number, required: true },
          reason: { type: String, required: true, maxlength: 300 },
        },
      ],
      default: [],
    },
    calculatedNet: { type: Number, required: true },
    net: { type: Number, required: true },
    warnings: { type: [String], default: [] },
  },
  { _id: false },
);

const salaryPayoutSchema = new Schema<ISalaryPayout>(
  {
    payoutNo: { type: String, required: true, unique: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(SALARY_PAYOUT_STATUS),
      default: SALARY_PAYOUT_STATUS.GENERATED,
      index: true,
    },
    generatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    generatedAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    paidBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    cancelReason: { type: String, trim: true, maxlength: 500, default: null },
    settingsSnapshot: { type: Schema.Types.Mixed, required: true },
    totals: {
      employees: { type: Number, required: true },
      gross: { type: Number, required: true },
      deductions: { type: Number, required: true },
      adjustments: { type: Number, required: true },
      net: { type: Number, required: true },
      overriddenLines: { type: Number, default: 0 },
    },
    lines: { type: [payoutLineSchema], default: [] },
  },
  { timestamps: true },
);

salaryPayoutSchema.index({ "lines.employee": 1, from: 1, to: 1 });
salaryPayoutSchema.index({ generatedAt: -1 });

export const SalaryPayout = mongoose.model<ISalaryPayout>(
  "SalaryPayout",
  salaryPayoutSchema,
);
