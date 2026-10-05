import { Request, Response, NextFunction } from "express";
import {
  ReportService,
  ReportFilterQuery,
} from "../services/report.service.js";

export const getDashboardAnalyticsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters: ReportFilterQuery = req.query as any;
    const user = (req as any).user;

    const data = await ReportService.getDashboardSummary(user, filters);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const exportReportController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters: ReportFilterQuery = req.query as any;
    const user = (req as any).user;
    const format = filters.format || "csv";
    const module = filters.module || "ALL";

    let rawData: any;

    switch (module) {
      case "LEAD":
        rawData = await ReportService.getLeadReport(user, filters);
        break;
      case "ATTENDANCE":
        rawData = await ReportService.getAttendanceReport(user, filters);
        break;
      case "CALL_LOG":
        rawData = await ReportService.getCallReport(user, filters);
        break;
      case "REVENUE":
        rawData = await ReportService.getRevenueReport(user, filters);
        break;
      case "LEAVE":
        rawData = await ReportService.getLeaveReport(user, filters);
        break;
      default:
        rawData = await ReportService.getDashboardSummary(user, filters);
        break;
    }

    const exportData = Array.isArray(rawData) ? rawData : [rawData];

    if (format === "csv") {
      const csv = ReportService.exportToCSV(exportData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=report-${module}-${Date.now()}.csv`,
      );
      return res.status(200).send(csv);
    }

    if (format === "excel") {
      const buffer = await ReportService.exportToExcel(module, exportData);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=report-${module}-${Date.now()}.xlsx`,
      );
      return res.status(200).send(buffer);
    }

    return res.status(200).json({ success: true, data: rawData });
  } catch (error) {
    next(error);
  }
};
