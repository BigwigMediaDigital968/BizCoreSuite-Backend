import type { NextFunction, Request, Response } from "express";
import type { ITask } from "../models/Task.js";
import {
  createTask,
  getTaskById,
  getTasks,
  updateTask,
} from "../services/task.service.js";
import { createAuditLog } from "../services/audit.service.js";
import { AppError } from "../utils/AppError.js";
import { updateTaskSchema } from "../validators/task.validator.js";
import { getTaskActivities } from "../services/task-activity.service.js";

export const createTaskController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    const task: ITask = await createTask(req.body, req.user.id);

    await createAuditLog({
      actor: req.user.id,
      action: "TASK_CREATED",
      entity: "Task",
      entityId: task._id.toString(),
      branch: task.branch.toString(),
      metadata: {
        title: task.title,
        assignedTo: task.assignedTo.toString(),
        lead: task.leads ? task.leads.toString() : undefined,
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

export const getTasksController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new AppError(
        "Authentication required",
        401,
        "AUTHENTICATION_REQUIRED",
      );
    }

    const tasks = await getTasks(req.user, req.query);

    return res.status(200).json({
      success: true,
      message: "Tasks fetched successfully",
      data: tasks,
    });
  } catch (error) {
    next(error);
  }
};

export const getTaskByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const taskId = req.params.id;

    if (!taskId || Array.isArray(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
        code: "INVALID_TASK_ID",
      });
    }

    const task = await getTaskById(taskId, req.user);

    return res.status(200).json({
      success: true,
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTaskController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const taskId = req.params.id;

    if (!taskId || Array.isArray(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
        code: "INVALID_TASK_ID",
      });
    }

    const data = updateTaskSchema.parse(req.body);

    const task = await updateTask(taskId, data, req.user);

    return res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: task,
    });
  } catch (error) {
    next(error);
  }
};

export const getTaskActivitiesController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        code: "AUTHENTICATION_REQUIRED",
      });
    }

    const taskId = req.params.id;

    if (!taskId || Array.isArray(taskId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID",
        code: "INVALID_TASK_ID",
      });
    }

    /*
     * Reuse the existing task access
     * validation.
     */
    await getTaskById(taskId, req.user);

    const activities = await getTaskActivities(taskId);

    return res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
};
