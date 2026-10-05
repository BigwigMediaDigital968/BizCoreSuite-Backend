import type { Request, Response } from "express";

import {
  exportReports,
  getMissingReports,
  getMyReportWindow,
  getReportById,
  getSummary,
  listMyReports,
  listReports,
  reviewReport,
  submitMyReport,
} from "../services/dailyReport.service.js";
import {
  dailyReportListQuerySchema,
  exportQuerySchema,
  missingReportsQuerySchema,
  myDailyReportsQuerySchema,
  reviewDailyReportSchema,
  submitDailyReportSchema,
  summaryQuerySchema,
} from "../validators/dailyReport.validator.js";
import { AppError } from "../utils/AppError.js";

// Validation failures throw ZodError, which errorHandler turns into a 400.

const requireUser = (req: Request) => {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  }
  return req.user;
};

const requireIdParam = (req: Request) => {
  const { id } = req.params;
  if (!id || Array.isArray(id)) {
    throw new AppError("Invalid report ID", 400, "INVALID_REPORT_ID");
  }
  return id;
};

/** Today's window, the employee's report (if any) and the system metrics. */
export const checkReportWindow = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const data = await getMyReportWindow(user.id);
  return res.status(200).json({ success: true, data });
};

/** Create or update today's report while the window is open. */
export const submitDailyReport = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = submitDailyReportSchema.parse(req.body ?? {});

  const { report, created } = await submitMyReport(user.id, input);

  return res.status(created ? 201 : 200).json({
    success: true,
    message: created
      ? "Daily report submitted successfully"
      : "Daily report updated successfully",
    data: report,
  });
};

export const getMyDailyReports = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { page, limit } = myDailyReportsQuerySchema.parse(req.query);

  const result = await listMyReports(user.id, page, limit);

  return res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getAllDailyReports = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const query = dailyReportListQuerySchema.parse(req.query);

  const result = await listReports(user, query);

  return res.status(200).json({
    success: true,
    data: result.items,
    pagination: result.pagination,
  });
};

export const getDailyReportById = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const report = await getReportById(user, requireIdParam(req));
  return res.status(200).json({ success: true, data: report });
};

export const reviewDailyReport = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { remark } = reviewDailyReportSchema.parse(req.body ?? {});

  const report = await reviewReport(user, requireIdParam(req), remark);

  return res.status(200).json({
    success: true,
    message: "Report marked as reviewed",
    data: report,
  });
};

export const getMissingDailyReports = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { date, branchId } = missingReportsQuerySchema.parse(req.query);

  const data = await getMissingReports(user, date, branchId);
  return res.status(200).json({ success: true, data });
};

export const getDailyReportSummary = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { startDate, endDate, branchId } = summaryQuerySchema.parse(req.query);

  const data = await getSummary(user, startDate, endDate, branchId);
  return res.status(200).json({ success: true, data });
};

export const exportDailyReports = async (req: Request, res: Response) => {
  const user = requireUser(req);
  const { format, ...filters } = exportQuerySchema.parse(req.query);

  const file = await exportReports(user, filters, format);

  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename=${file.filename}`);
  return res.status(200).send(file.body);
};
