// src/controllers/performance.controller.ts
import { Request, Response, NextFunction } from "express";
import { getHierarchicalPerformanceReport } from "../services/performance.service.js";
import { AppError } from "../utils/AppError.js";

export const getPerformanceReportHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    const report = await getHierarchicalPerformanceReport(req.user, req.query);

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};