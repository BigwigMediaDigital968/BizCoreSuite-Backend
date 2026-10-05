import mongoose, { PipelineStage } from "mongoose";
import { Lead } from "../models/Lead.js";
import { Attendance } from "../models/Attendance.js";
import { CallLog } from "../models/CallLog.js";
import { Revenue } from "../models/Revenue.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { ROLES } from "../constants/roles.js";
import { Parser } from "json2csv";
import Workbook from "exceljs";

export interface ReportFilterQuery {
  startDate?: string;
  endDate?: string;
  perfStartDate?: string;
  perfEndDate?: string;
  performancePeriod?: "Daily" | "Weekly" | "Monthly";
  branchId?: string;
  employeeId?: string;
  module?: "LEAD" | "ATTENDANCE" | "CALL_LOG" | "REVENUE" | "LEAVE" | "ALL";
  format?: "json" | "csv" | "excel";
}

export interface UserScope {
  id: string;
  role: string;
  branches: string[];
}

export class ReportService {
  /**
   * Generates scoped Match Query based on Role and Filter params
   */
  private static buildScopeFilter(
    user: UserScope,
    queryBranch?: string,
    queryEmployee?: string,
  ) {
    const match: Record<string, any> = {};

    // 1. Role-based Branch Scope
    if (user.role !== ROLES.HEAD) {
      if (queryBranch && user.branches.includes(queryBranch)) {
        match.branch = new mongoose.Types.ObjectId(queryBranch);
      } else if (user.branches.length > 0) {
        match.branch = {
          $in: user.branches.map((b) => new mongoose.Types.ObjectId(b)),
        };
      }
    } else if (queryBranch) {
      match.branch = new mongoose.Types.ObjectId(queryBranch);
    }

    // 2. Employee Scope
    if (queryEmployee) {
      match.employeeId = new mongoose.Types.ObjectId(queryEmployee);
    }

    return match;
  }

  /**
   * Aggregates Lead Statistics
   */
  public static async getLeadReport(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const scope = this.buildScopeFilter(
      user,
      filters.branchId,
      filters.employeeId,
    );

    const dateMatch: Record<string, any> = { isDeleted: false, ...scope };
    if (scope.employeeId) {
      dateMatch.assignedTo = scope.employeeId;
      delete dateMatch.employeeId;
    }
    if (filters.startDate || filters.endDate) {
      dateMatch.createdAt = {};
      if (filters.startDate)
        dateMatch.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) dateMatch.createdAt.$lte = new Date(filters.endDate);
    }

    const pipeline: PipelineStage[] = [
      { $match: dateMatch },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: "$count" },
          statusBreakdown: { $push: { status: "$_id", count: "$count" } },
        },
      },
      { $project: { _id: 0 } },
    ];

    const result = await Lead.aggregate(pipeline);
    return result[0] || { totalLeads: 0, statusBreakdown: [] };
  }

  /**
   * Aggregates Attendance Metrics
   */
  public static async getAttendanceReport(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const scope = this.buildScopeFilter(
      user,
      filters.branchId,
      filters.employeeId,
    );
    if (scope.employeeId) {
      scope.employee = scope.employeeId;
      delete scope.employeeId;
    }

    if (filters.startDate || filters.endDate) {
      scope.createdAt = {};
      if (filters.startDate) scope.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) scope.createdAt.$lte = new Date(filters.endDate);
    }

    const result = await Attendance.aggregate([
      { $match: scope },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalLateMinutes: { $sum: "$lateMinutes" },
          totalWorkingMinutes: { $sum: "$totalWorkingMinutes" },
        },
      },
    ]);

    return result;
  }

  /**
   * Aggregates Dialer / Call Log Metrics
   */
  public static async getCallReport(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const scope = this.buildScopeFilter(
      user,
      filters.branchId,
      filters.employeeId,
    );
    if (scope.employeeId) {
      scope.caller = scope.employeeId;
      delete scope.employeeId;
    }

    if (filters.startDate || filters.endDate) {
      scope.createdAt = {};
      if (filters.startDate) scope.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) scope.createdAt.$lte = new Date(filters.endDate);
    }

    return CallLog.aggregate([
      { $match: scope },
      {
        $group: {
          _id: "$callStatus",
          totalCalls: { $sum: 1 },
          totalDurationSeconds: { $sum: "$duration" },
          avgDurationSeconds: { $avg: "$duration" },
        },
      },
    ]);
  }

  /**
   * Aggregates Leave Metrics
   */
  public static async getLeaveReport(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const scope = this.buildScopeFilter(
      user,
      filters.branchId,
      filters.employeeId,
    );
    if (scope.employeeId) {
      scope.employee = scope.employeeId;
      delete scope.employeeId;
    }

    if (filters.startDate || filters.endDate) {
      scope.startDate = {};
      if (filters.startDate) scope.startDate.$gte = new Date(filters.startDate);
      if (filters.endDate) scope.startDate.$lte = new Date(filters.endDate);
    }

    return LeaveRequest.aggregate([
      { $match: scope },
      {
        $group: {
          _id: { status: "$status", leaveType: "$leaveType" },
          totalDays: { $sum: "$totalDays" },
          requestsCount: { $sum: 1 },
        },
      },
    ]);
  }

  /**
   * CSV Data Exporter
   */
  public static exportToCSV(data: any[]): string {
    const json2csvParser = new Parser();
    return json2csvParser.parse(data);
  }

  /**
   * Excel Buffer Exporter
   */
  public static async exportToExcel(
    sheetName: string,
    data: any[],
  ): Promise<Buffer> {
    const workbook = new Workbook.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    if (data.length > 0) {
      const headers = Object.keys(data[0]).map((key) => ({
        header: key.toUpperCase(),
        key: key,
        width: 20,
      }));
      worksheet.columns = headers;
      worksheet.addRows(data);
    }

    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  /**
   * Aggregates Revenue Figures (Includes Today's Total and Overall Total)
   */
  public static async getRevenueReport(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const scope = this.buildScopeFilter(
      user,
      filters.branchId,
      filters.employeeId,
    );
    if (scope.employeeId) {
      scope.employee = scope.employeeId;
      delete scope.employeeId;
    }

    // Calculate start and end of today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const dateMatch: Record<string, any> = { ...scope };
    if (filters.startDate || filters.endDate) {
      dateMatch.date = {};
      if (filters.startDate) dateMatch.date.$gte = new Date(filters.startDate);
      if (filters.endDate) dateMatch.date.$lte = new Date(filters.endDate);
    }

    const [todayAgg, totalAgg] = await Promise.all([
      Revenue.aggregate([
        {
          $match: { ...scope, date: { $gte: startOfToday, $lte: endOfToday } },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Revenue.aggregate([
        { $match: dateMatch },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    return {
      today: todayAgg[0]?.total || 0,
      total: totalAgg[0]?.total || 0,
    };
  }

  /**
   * Aggregates Top Performing Branch, Employee, and Admin using Performance Period Filter
   */
  public static async getTopPerformers(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const scope = this.buildScopeFilter(
      user,
      filters.branchId,
      filters.employeeId,
    );

    // Prefer performance-specific date ranges over global timeframe filter
    const perfStart = filters.perfStartDate || filters.startDate;
    const perfEnd = filters.perfEndDate || filters.endDate;

    const dateMatch: Record<string, any> = { ...scope };
    if (perfStart || perfEnd) {
      dateMatch.date = {};
      if (perfStart) dateMatch.date.$gte = new Date(perfStart);
      if (perfEnd) dateMatch.date.$lte = new Date(perfEnd);
    }

    const [topBranchAgg, topEmployeeAgg, topAdminAgg] = await Promise.all([
      // Top Branch
      Revenue.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$branch", totalRevenue: { $sum: "$amount" } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "branches",
            localField: "_id",
            foreignField: "_id",
            as: "branchDetails",
          },
        },
        {
          $unwind: { path: "$branchDetails", preserveNullAndEmptyArrays: true },
        },
      ]),

      // Top Employee
      Revenue.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$employee", totalRevenue: { $sum: "$amount" } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "employeeDetails",
          },
        },
        {
          $unwind: {
            path: "$employeeDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "branches",
            localField: "employeeDetails.branch",
            foreignField: "_id",
            as: "branchDetails",
          },
        },
        {
          $unwind: { path: "$branchDetails", preserveNullAndEmptyArrays: true },
        },
      ]),

      // Top Admin
      Revenue.aggregate([
        { $match: dateMatch },
        { $group: { _id: "$createdBy", totalRevenue: { $sum: "$amount" } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 1 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "adminDetails",
          },
        },
        {
          $unwind: { path: "$adminDetails", preserveNullAndEmptyArrays: true },
        },
      ]),
    ]);

    const branch = topBranchAgg[0]
      ? {
          name: topBranchAgg[0].branchDetails?.name || "N/A",
          code: topBranchAgg[0].branchDetails?.code || "",
          revenue: topBranchAgg[0].totalRevenue || 0,
        }
      : null;

    const employee = topEmployeeAgg[0]
      ? {
          name: topEmployeeAgg[0].employeeDetails?.name || "N/A",
          branchName: topEmployeeAgg[0].branchDetails?.name || "N/A",
          revenue: topEmployeeAgg[0].totalRevenue || 0,
        }
      : null;

    const admin = topAdminAgg[0]
      ? {
          name: topAdminAgg[0].adminDetails?.name || "N/A",
          managedBranch: "Regional Operations",
          revenue: topAdminAgg[0].totalRevenue || 0,
        }
      : null;

    return { branch, employee, admin };
  }

  public static async getDashboardSummary(
    user: UserScope,
    filters: ReportFilterQuery,
  ) {
    const [leads, attendance, calls, revenue, leaves, topPerformers] =
      await Promise.all([
        this.getLeadReport(user, filters),
        this.getAttendanceReport(user, filters),
        this.getCallReport(user, filters),
        this.getRevenueReport(user, filters),
        this.getLeaveReport(user, filters),
        this.getTopPerformers(user, filters),
      ]);

    return {
      leads,
      attendance,
      calls,
      revenue,
      leaves,
      topPerformers,
    };
  }
}
