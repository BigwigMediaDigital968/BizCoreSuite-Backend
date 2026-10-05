import mongoose, { Document, Schema } from "mongoose";

import { type TaskActivityType } from "../constants/taskActivity.js";

export interface ITaskActivity extends Document {
  task: mongoose.Types.ObjectId;

  activityType: TaskActivityType;

  performedBy: mongoose.Types.ObjectId;

  branch: mongoose.Types.ObjectId;

  previousValue?: string;

  newValue?: string;

  remark?: string;

  metadata?: Record<string, unknown>;

  createdAt: Date;

  updatedAt: Date;
}

const taskActivitySchema = new Schema<ITaskActivity>(
  {
    task: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },

    activityType: {
      type: String,
      required: true,
      index: true,
    },

    performedBy: {
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

    previousValue: {
      type: String,
      default: null,
    },

    newValue: {
      type: String,
      default: null,
    },

    remark: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

taskActivitySchema.index({
  task: 1,
  createdAt: -1,
});

taskActivitySchema.index({
  branch: 1,
  createdAt: -1,
});

taskActivitySchema.index({
  performedBy: 1,
  createdAt: -1,
});

export const TaskActivity = mongoose.model<ITaskActivity>(
  "TaskActivity",
  taskActivitySchema,
);
