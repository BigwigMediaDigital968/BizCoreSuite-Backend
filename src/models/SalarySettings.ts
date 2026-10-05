import mongoose, { Document, Schema } from "mongoose";

import {
  MISSED_CHECKOUT_POLICY,
  SALARY_PER_DAY_BASIS,
  SALARY_SETTINGS_KEY,
  STATUTORY_PRORATION,
  type SalarySettingsValues,
} from "../constants/salary.js";

/**
 * Optional. When no document exists the payout falls back to
 * DEFAULT_SALARY_SETTINGS (half days and absences only).
 */
export interface ISalarySettings extends Document, SalarySettingsValues {
  key: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const salarySettingsSchema = new Schema<ISalarySettings>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: SALARY_SETTINGS_KEY,
    },

    perDayBasis: {
      type: String,
      enum: Object.values(SALARY_PER_DAY_BASIS),
      required: true,
    },

    lateRule: {
      enabled: { type: Boolean, required: true },
      freeLatesPerMonth: { type: Number, min: 0, required: true },
      everyNLates: { type: Number, min: 1, required: true },
      deductionDays: { type: Number, min: 0, required: true },
      severeLateMinutes: { type: Number, min: 1, default: null },
    },

    halfDayRule: {
      enabled: { type: Boolean, required: true },
      minWorkingMinutes: { type: Number, min: 1, default: null },
    },

    missedCheckoutPolicy: {
      type: String,
      enum: Object.values(MISSED_CHECKOUT_POLICY),
      required: true,
    },

    absenceRequiresApproval: { type: Boolean, required: true },

    statutoryProration: {
      type: String,
      enum: Object.values(STATUTORY_PRORATION),
      required: true,
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const SalarySettings = mongoose.model<ISalarySettings>(
  "SalarySettings",
  salarySettingsSchema,
);
