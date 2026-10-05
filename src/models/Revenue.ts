// src/models/Revenue.ts
import mongoose, { Document, Schema, Types, Model } from "mongoose";

export const REVENUE_STATUS = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;

export type RevenueStatus = keyof typeof REVENUE_STATUS;

export interface IRevenue extends Document {
  employee: Types.ObjectId;
  branch: Types.ObjectId;
  lead?: Types.ObjectId;
  date: Date;
  amount: number;
  source: string;
  clientName: string;
  clientContact?: string;
  reference?: string;
  status: RevenueStatus;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  notes?: string;
  createdBy: Types.ObjectId;
  lastEditedBy?: Types.ObjectId;
  lastEditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const revenueSchema = new Schema<IRevenue>(
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
    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      // index: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    clientContact: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: Object.values(REVENUE_STATUS),
      default: REVENUE_STATUS.PENDING,
      index: true,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastEditedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    lastEditedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

revenueSchema.index({ branch: 1, date: -1 });
revenueSchema.index({ employee: 1, date: -1 });
revenueSchema.index({ lead: 1 });

export const Revenue: Model<IRevenue> =
  mongoose.models.Revenue || mongoose.model<IRevenue>("Revenue", revenueSchema);
