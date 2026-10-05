// src/controllers/revenue.controller.ts
import { Request, Response, NextFunction } from "express";
import {
  createRevenueEntry,
  getRevenueReport,
  getTotalRevenue,
  updateRevenueEntry,
  updateRevenueStatus,
} from "../services/revenue.service.js";
import { AppError } from "../utils/AppError.js";

export const createRevenueHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const data = await createRevenueEntry(req.user, req.body);
    return res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getRevenueReportHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const report = await getRevenueReport(req.user, req.query);
    return res.status(200).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
};

export const getTotalRevenueHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    const summary = await getTotalRevenue(req.user, req.query);
    return res.status(200).json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
};

export const updateRevenueStatusHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new AppError("Revenue ID parameter is required", 400, "INVALID_ID");
    }

    const updated = await updateRevenueStatus(req.user, id, req.body);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

export const updateRevenueEntryHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      throw new AppError("Revenue ID parameter is required", 400, "INVALID_ID");
    }

    const updated = await updateRevenueEntry(req.user, id, req.body);
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};
