import mongoose, { Schema, Document } from "mongoose";

export type ActivityModule =
  | "USER"
  | "EMPLOYEE"
  | "BRANCH"
  | "HOLIDAY"
  | "ATTENDANCE"
  | "LEAVE"
  | "LEAD"
  | "LEAD_ACTIVITY"
  | "LEAD_FOLLOWUP"
  | "CUSTOMER"
  | "TASK"
  | "STRINGEE"
  | "CALL_LOG"
  | "REVENUE"
  | "SALARY"
  | "ACHIEVEMENT"
  | "PERFORMANCE"
  | "INCENTIVE"
  | "REPORT"
  | "DAILY_REPORT"
  | "INTEGRATION"
  | "SYSTEM";

export interface IActivityLog extends Document {
  module: ActivityModule;
  action: string;
  description: string;
  performedBy: mongoose.Types.ObjectId;
  entityId?: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
  ipAddress?: string;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    module: { type: String, required: true, index: true },
    action: { type: String, required: true, index: true },
    description: { type: String, required: true },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    entityId: { type: Schema.Types.ObjectId, index: true },
    branch: { type: Schema.Types.ObjectId, ref: "Branch", index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Compound indexes for optimal search and dashboard analytics filtering
activityLogSchema.index({ branch: 1, createdAt: -1 });
activityLogSchema.index({ module: 1, action: 1, createdAt: -1 });

export const ActivityLog = mongoose.model<IActivityLog>(
  "ActivityLog",
  activityLogSchema,
);
