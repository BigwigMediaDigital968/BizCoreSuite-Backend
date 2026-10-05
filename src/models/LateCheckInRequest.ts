import mongoose, { Document, Schema } from "mongoose";

export const LATE_CHECKIN_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type LateCheckInStatus =
  (typeof LATE_CHECKIN_STATUS)[keyof typeof LATE_CHECKIN_STATUS];

export interface ILateCheckInRequest extends Document {
  employee: mongoose.Types.ObjectId;
  branch: mongoose.Types.ObjectId;
  requestDate: Date; // Normalized UTC date (YYYY-MM-DD)
  reason: string;
  status: LateCheckInStatus;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewRemarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lateCheckInRequestSchema = new Schema<ILateCheckInRequest>(
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
    requestDate: {
      type: Date,
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: Object.values(LATE_CHECKIN_STATUS),
      default: LATE_CHECKIN_STATUS.PENDING,
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewRemarks: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { timestamps: true },
);

lateCheckInRequestSchema.index(
  { employee: 1, requestDate: 1 },
  { unique: true },
);

export const LateCheckInRequest = mongoose.model<ILateCheckInRequest>(
  "LateCheckInRequest",
  lateCheckInRequestSchema,
);
