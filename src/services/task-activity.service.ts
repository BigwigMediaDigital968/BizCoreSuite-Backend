import { TaskActivity } from "../models/TaskActivity.js";

import { type TaskActivityType } from "../constants/taskActivity.js";

interface CreateTaskActivityInput {
  task: string;

  activityType: TaskActivityType;

  performedBy: string;

  branch: string;

  previousValue?: string;

  newValue?: string;

  remark?: string;

  metadata?: Record<string, unknown>;
}

export const createTaskActivity = async (data: CreateTaskActivityInput) => {
  return TaskActivity.create({
    task: data.task,
    activityType: data.activityType,
    performedBy: data.performedBy,
    branch: data.branch,
    previousValue: data.previousValue,
    newValue: data.newValue,
    remark: data.remark,
    metadata: data.metadata,
  });
};

export const getTaskActivities = async (taskId: string) => {
  return TaskActivity.find({
    task: taskId,
  })
    .populate("performedBy", "name email role")
    .populate("branch", "name code")
    .sort({
      createdAt: -1,
    })
    .lean();
};
