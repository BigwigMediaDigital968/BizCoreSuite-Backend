import mongoose, { Document, Schema } from "mongoose";

import { LEAD_STATUS, type LeadStatus } from "../constants/leadStatus.js";

export const LEAD_SOURCE_TYPE = {
  MANUAL: "MANUAL",
  EXCEL: "EXCEL",
  API: "API",
  IMPORT: "IMPORT",
  INTEGRATION: "INTEGRATION",
} as const;

export type LeadSourceType =
  (typeof LEAD_SOURCE_TYPE)[keyof typeof LEAD_SOURCE_TYPE];

export interface ILead extends Document {
  name: string;

  phoneCountryCode: string;

  phone: string;

  email?: string;

  city?: string;

  industry?: string;

  message?: string;

  status: LeadStatus;

  remarks?: string;

  source: string;

  sourceType: LeadSourceType;

  externalId?: string;

  /** Set for leads created by a lead-source integration (e.g. WATI). */
  integration?: mongoose.Types.ObjectId;

  branch?: mongoose.Types.ObjectId;

  assignedTo?: mongoose.Types.ObjectId;

  assignedBy?: mongoose.Types.ObjectId;

  assignedAt?: Date;

  createdBy: mongoose.Types.ObjectId;

  isDeleted: boolean;

  createdAt: Date;

  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    phoneCountryCode: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
      index: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    industry: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    message: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    status: {
      type: String,
      enum: Object.values(LEAD_STATUS),
      default: LEAD_STATUS.NEW,
      required: true,
      index: true,
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },

    source: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },

    sourceType: {
      type: String,
      enum: Object.values(LEAD_SOURCE_TYPE),
      required: true,
      index: true,
    },

    externalId: {
      type: String,
      trim: true,
      maxlength: 200,
      index: true,
      sparse: true,
    },

    integration: {
      type: Schema.Types.ObjectId,
      ref: "Integration",
      index: true,
      sparse: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      // required: true,
      index: true,
    },

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    assignedAt: {
      type: Date,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

leadSchema.index({
  branch: 1,
  status: 1,
});

leadSchema.index({
  branch: 1,
  assignedTo: 1,
  status: 1,
});

leadSchema.index({
  branch: 1,
  createdAt: -1,
});

leadSchema.index({
  assignedTo: 1,
  createdAt: -1,
});

leadSchema.index({
  source: 1,
  createdAt: -1,
});

leadSchema.index({
  phoneCountryCode: 1,
  phone: 1,
});

export const Lead = mongoose.model<ILead>("Lead", leadSchema);
