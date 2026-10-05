import mongoose, { Document, Schema } from "mongoose";

import { TASK_STATUS, type TaskStatus } from "../constants/taskStatus.js";

import { TASK_PRIORITY, type TaskPriority } from "../constants/taskPriority.js";

export interface ITask extends Document {
  title: string;

  description?: string;

  branch: mongoose.Types.ObjectId;

  leads?: mongoose.Types.ObjectId[]; // ✅ Multi-lead array

  assignedTo: mongoose.Types.ObjectId;

  assignedBy: mongoose.Types.ObjectId;

  priority: TaskPriority;

  status: TaskStatus;

  dueDate?: Date;

  completedAt?: Date;

  remarks?: string;

  createdBy: mongoose.Types.ObjectId;

  isDeleted: boolean;

  createdAt: Date;

  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 5000,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    leads: [
      {
        type: Schema.Types.ObjectId,
        ref: "Lead",
        index: true,
      },
    ],

    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.MEDIUM,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(TASK_STATUS),
      default: TASK_STATUS.TODO,
      required: true,
      index: true,
    },

    dueDate: {
      type: Date,
      index: true,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
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

taskSchema.index({
  branch: 1,
  status: 1,
});

taskSchema.index({
  branch: 1,
  assignedTo: 1,
  status: 1,
});

taskSchema.index({
  assignedTo: 1,
  dueDate: 1,
});

taskSchema.index({
  branch: 1,
  createdAt: -1,
});

export const Task = mongoose.model<ITask>("Task", taskSchema);
