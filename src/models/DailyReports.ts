import mongoose, { Schema, Document } from "mongoose";

import {
  DAILY_REPORT_MAX_CUSTOM_FIELDS,
  DAILY_REPORT_STATUS,
  type DailyReportStatus,
} from "../constants/dailyReport.js";

export interface IDailyReportCustomField {
  label: string;
  value: string;
}

/** What the system recorded for the day, snapshotted on every save. */
export interface IDailyReportSystemMetrics {
  callsAttended: number;
  callsAnswered: number;
  conversions: number;
  totalCallDurationSeconds: number;
  computedAt: Date;
}

export interface IDailyReportReview {
  reviewedBy: mongoose.Types.ObjectId;
  reviewedAt: Date;
  remark?: string;
}

export interface IDailyReport extends Document {
  employeeId: mongoose.Types.ObjectId;
  branchId: mongoose.Types.ObjectId;
  /** "YYYY-MM-DD" in the branch timezone, same convention as Attendance.date. */
  reportDate: string;

  workCompleted: string;
  callsAttended: number;
  callsAnswered: number;
  conversions: number;
  totalCallDurationSeconds: number;
  dailyFeedback?: string;
  customFields: IDailyReportCustomField[];

  systemMetrics: IDailyReportSystemMetrics;

  submittedAt: Date;
  status: DailyReportStatus;
  editCount: number;
  review?: IDailyReportReview;

  createdAt: Date;
  updatedAt: Date;
}

const nonNegativeInt = {
  type: Number,
  required: true,
  default: 0,
  min: 0,
};

const DailyReportSchema = new Schema<IDailyReport>(
  {
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    reportDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },

    workCompleted: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    callsAttended: nonNegativeInt,
    callsAnswered: nonNegativeInt,
    conversions: nonNegativeInt,
    totalCallDurationSeconds: nonNegativeInt,
    dailyFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    customFields: {
      type: [
        {
          _id: false,
          label: { type: String, required: true, trim: true, maxlength: 60 },
          value: { type: String, trim: true, maxlength: 500, default: "" },
        },
      ],
      default: [],
      validate: {
        validator: (fields: unknown[]) =>
          fields.length <= DAILY_REPORT_MAX_CUSTOM_FIELDS,
        message: `At most ${DAILY_REPORT_MAX_CUSTOM_FIELDS} additional fields are allowed`,
      },
    },

    systemMetrics: {
      callsAttended: { type: Number, default: 0 },
      callsAnswered: { type: Number, default: 0 },
      conversions: { type: Number, default: 0 },
      totalCallDurationSeconds: { type: Number, default: 0 },
      computedAt: { type: Date, default: Date.now },
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: Object.values(DAILY_REPORT_STATUS),
      default: DAILY_REPORT_STATUS.SUBMITTED,
    },
    editCount: {
      type: Number,
      default: 0,
    },
    review: {
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewedAt: { type: Date },
      remark: { type: String, trim: true, maxlength: 1000 },
    },
  },
  {
    timestamps: true,
  },
);

// One report per employee per day.
DailyReportSchema.index({ employeeId: 1, reportDate: 1 }, { unique: true });
DailyReportSchema.index({ branchId: 1, reportDate: -1 });

export const DailyReport = mongoose.model<IDailyReport>(
  "DailyReport",
  DailyReportSchema,
);
