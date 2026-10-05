import mongoose, { Types } from "mongoose";

import { DailyReport } from "../models/DailyReports.js";
import { CallLog } from "../models/CallLog.js";
import { Revenue, REVENUE_STATUS } from "../models/Revenue.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { User } from "../models/User.js";
import { Branch } from "../models/Branch.js";
import { NOTIFICATION_TYPES } from "../models/Notification.js";
import { ROLES } from "../constants/roles.js";
import {
  LEAVE_DURATION_TYPE,
  LEAVE_REQUEST_STATUS,
} from "../constants/leaveRequest.js";
import {
  DAILY_REPORT_LATE_GRACE_MINUTES,
  DAILY_REPORT_OPENS_BEFORE_MINUTES,
  DAILY_REPORT_STATUS,
  DAILY_REPORT_WINDOW_STATE,
  type DailyReportWindowState,
} from "../constants/dailyReport.js";
import {
  findHolidayForBranch,
  getEmployeeBranch,
} from "./attendance.service.js";
import { notify } from "./notification.service.js";
import { ReportService } from "./report.service.js";
import { AppError } from "../utils/AppError.js";
import { hasBranchAccess } from "../utils/branchAccess.js";
import {
  getDateInTimezone,
  getDayBoundsInTimezone,
  getDayOfWeekForDate,
  zonedTimeToUtc,
} from "../utils/timezone.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type {
  DailyReportListQuery,
  SubmitDailyReportInput,
} from "../validators/dailyReport.validator.js";

const MINUTE_MS = 60 * 1000;

/** Mismatches under a minute are rounding from the h/m duration input. */
const DURATION_TOLERANCE_SECONDS = 60;

const EXPORT_ROW_LIMIT = 5000;

const EMPLOYEE_FIELDS = "name email";
const BRANCH_FIELDS = "name code";

const toObjectId = (id: string | Types.ObjectId) =>
  typeof id === "string" ? new Types.ObjectId(id) : id;

// =========================================================================
// Branch schedule & submission window
// =========================================================================

interface BranchLike {
  _id: Types.ObjectId;
  attendanceConfig?: {
    timezone?: string;
    workingDays?: number[];
    workingHours?: { endTime?: string };
  };
}

const getSchedule = (branch: BranchLike) => ({
  timezone: branch.attendanceConfig?.timezone || "Asia/Kolkata",
  workingDays: branch.attendanceConfig?.workingDays ?? [1, 2, 3, 4, 5, 6],
  endTime: branch.attendanceConfig?.workingHours?.endTime || "18:30",
});

const getWindowBounds = (date: string, endTime: string, timezone: string) => {
  const closesAt = zonedTimeToUtc(date, endTime, timezone);
  return {
    opensAt: new Date(
      closesAt.getTime() - DAILY_REPORT_OPENS_BEFORE_MINUTES * MINUTE_MS,
    ),
    closesAt,
    lateUntil: new Date(
      closesAt.getTime() + DAILY_REPORT_LATE_GRACE_MINUTES * MINUTE_MS,
    ),
  };
};

/**
 * Leave dates are date-only values stored at UTC midnight, so UTC day
 * bounds match them exactly regardless of the branch timezone.
 */
const fullDayLeaveOnDateFilter = (date: string) => {
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const nextDay = new Date(dayStart.getTime() + 24 * 60 * MINUTE_MS);
  return {
    status: LEAVE_REQUEST_STATUS.APPROVED,
    durationType: LEAVE_DURATION_TYPE.FULL_DAY,
    startDate: { $lt: nextDay },
    endDate: { $gte: dayStart },
  };
};

const isWorkingDay = async (branch: BranchLike, date: string) => {
  const { workingDays } = getSchedule(branch);
  if (!workingDays.includes(getDayOfWeekForDate(date))) return false;
  return !(await findHolidayForBranch(branch._id, date));
};

const resolveWindow = async (employeeId: string, now = new Date()) => {
  const { branch } = await getEmployeeBranch(employeeId);
  const { timezone, endTime } = getSchedule(branch);

  const date = getDateInTimezone(timezone, now);
  const bounds = getWindowBounds(date, endTime, timezone);

  let state: DailyReportWindowState;

  if (!(await isWorkingDay(branch, date))) {
    state = DAILY_REPORT_WINDOW_STATE.NON_WORKING_DAY;
  } else if (
    await LeaveRequest.exists({
      employee: toObjectId(employeeId),
      ...fullDayLeaveOnDateFilter(date),
    })
  ) {
    state = DAILY_REPORT_WINDOW_STATE.ON_LEAVE;
  } else if (now < bounds.opensAt) {
    state = DAILY_REPORT_WINDOW_STATE.NOT_OPEN;
  } else if (now <= bounds.closesAt) {
    state = DAILY_REPORT_WINDOW_STATE.OPEN;
  } else if (now <= bounds.lateUntil) {
    state = DAILY_REPORT_WINDOW_STATE.LATE;
  } else {
    state = DAILY_REPORT_WINDOW_STATE.CLOSED;
  }

  return { branch, date, timezone, state, ...bounds };
};

// =========================================================================
// System metrics (what the CRM itself recorded for the day)
// =========================================================================

export const computeSystemMetrics = async (
  employeeId: string,
  date: string,
  timezone: string,
) => {
  const { start, end } = getDayBoundsInTimezone(date, timezone);
  const employee = toObjectId(employeeId);

  const [callStats] = await CallLog.aggregate<{
    attended: number;
    answered: number;
    duration: number;
  }>([
    { $match: { caller: employee, createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: null,
        attended: { $sum: 1 },
        // The webhook only sets "ended" when there was talk time (otherwise
        // "missed"); "answered" is a call still in progress.
        answered: {
          $sum: {
            $cond: [{ $in: ["$callStatus", ["answered", "ended"]] }, 1, 0],
          },
        },
        duration: { $sum: "$duration" },
      },
    },
  ]);

  // A conversion is a revenue entry the employee booked that day.
  const conversions = await Revenue.countDocuments({
    employee,
    date: { $gte: start, $lt: end },
    status: { $ne: REVENUE_STATUS.REJECTED },
  });

  return {
    callsAttended: callStats?.attended ?? 0,
    callsAnswered: callStats?.answered ?? 0,
    conversions,
    totalCallDurationSeconds: callStats?.duration ?? 0,
    computedAt: new Date(),
  };
};

// =========================================================================
// Employee: today's portal
// =========================================================================

const SUBMITTABLE_STATES: DailyReportWindowState[] = [
  DAILY_REPORT_WINDOW_STATE.OPEN,
  DAILY_REPORT_WINDOW_STATE.LATE,
];

export const getMyReportWindow = async (employeeId: string) => {
  const now = new Date();
  const window = await resolveWindow(employeeId, now);

  const [report, systemMetrics] = await Promise.all([
    DailyReport.findOne({
      employeeId: toObjectId(employeeId),
      reportDate: window.date,
    })
      .populate("review.reviewedBy", EMPLOYEE_FIELDS)
      .lean(),
    computeSystemMetrics(employeeId, window.date, window.timezone),
  ]);

  return {
    date: window.date,
    timezone: window.timezone,
    state: window.state,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
    lateUntil: window.lateUntil,
    serverTime: now,
    canSubmit:
      SUBMITTABLE_STATES.includes(window.state) && !report?.review?.reviewedAt,
    report,
    systemMetrics,
  };
};

const WINDOW_REJECTIONS: Partial<
  Record<DailyReportWindowState, { message: string; code: string }>
> = {
  [DAILY_REPORT_WINDOW_STATE.NOT_OPEN]: {
    message: `The daily report portal opens ${DAILY_REPORT_OPENS_BEFORE_MINUTES} minutes before your working day ends.`,
    code: "REPORT_WINDOW_NOT_OPEN",
  },
  [DAILY_REPORT_WINDOW_STATE.CLOSED]: {
    message: "The daily report window for today has closed.",
    code: "REPORT_WINDOW_CLOSED",
  },
  [DAILY_REPORT_WINDOW_STATE.NON_WORKING_DAY]: {
    message: "Today is not a working day for your branch.",
    code: "NOT_WORKING_DAY",
  },
  [DAILY_REPORT_WINDOW_STATE.ON_LEAVE]: {
    message: "You are on approved leave today.",
    code: "ON_LEAVE",
  },
};

export const submitMyReport = async (
  employeeId: string,
  input: SubmitDailyReportInput,
) => {
  const now = new Date();
  const window = await resolveWindow(employeeId, now);

  const rejection = WINDOW_REJECTIONS[window.state];
  if (rejection) {
    throw new AppError(rejection.message, 403, rejection.code);
  }

  const systemMetrics = await computeSystemMetrics(
    employeeId,
    window.date,
    window.timezone,
  );

  const existing = await DailyReport.findOne({
    employeeId: toObjectId(employeeId),
    reportDate: window.date,
  });

  if (existing) {
    if (existing.review?.reviewedAt) {
      throw new AppError(
        "This report has already been reviewed and can no longer be edited.",
        409,
        "REPORT_ALREADY_REVIEWED",
      );
    }

    existing.set({ ...input, systemMetrics });
    existing.editCount += 1;
    await existing.save();

    return { report: existing, created: false };
  }

  try {
    const report = await DailyReport.create({
      ...input,
      employeeId: toObjectId(employeeId),
      branchId: window.branch._id,
      reportDate: window.date,
      systemMetrics,
      submittedAt: now,
      status:
        window.state === DAILY_REPORT_WINDOW_STATE.LATE
          ? DAILY_REPORT_STATUS.LATE
          : DAILY_REPORT_STATUS.SUBMITTED,
    });

    return { report, created: true };
  } catch (error) {
    // Two tabs submitting at once: the unique index lets only one through.
    if ((error as { code?: number }).code === 11000) {
      throw new AppError(
        "Today's report was just submitted. Refresh to edit it.",
        409,
        "REPORT_ALREADY_EXISTS",
      );
    }
    throw error;
  }
};

export const listMyReports = async (
  employeeId: string,
  page: number,
  limit: number,
) => {
  const filter = { employeeId: toObjectId(employeeId) };

  const [items, total] = await Promise.all([
    DailyReport.find(filter)
      .populate("review.reviewedBy", EMPLOYEE_FIELDS)
      .sort({ reportDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DailyReport.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// =========================================================================
// Management: scoped to the viewer's branches (Head sees all)
// =========================================================================

const assertBranchAccess = (user: AuthenticatedUser, branchId: string) => {
  if (!hasBranchAccess(user, branchId)) {
    throw new AppError(
      "You do not have access to this branch",
      403,
      "BRANCH_ACCESS_DENIED",
    );
  }
};

/** Branch ids the viewer may see, or null for every branch. */
const getScopedBranchIds = (
  user: AuthenticatedUser,
  branchId?: string,
): Types.ObjectId[] | null => {
  if (branchId) {
    assertBranchAccess(user, branchId);
    return [toObjectId(branchId)];
  }
  if (user.role === ROLES.HEAD) return null;
  return user.branches.map(toObjectId);
};

const buildListFilter = (
  user: AuthenticatedUser,
  query: Omit<DailyReportListQuery, "page" | "limit">,
) => {
  const filter: Record<string, unknown> = {};

  const branchIds = getScopedBranchIds(user, query.branchId);
  if (branchIds) filter.branchId = { $in: branchIds };

  if (query.employeeId) filter.employeeId = toObjectId(query.employeeId);

  if (query.startDate || query.endDate) {
    // YYYY-MM-DD strings sort chronologically.
    filter.reportDate = {
      ...(query.startDate ? { $gte: query.startDate } : {}),
      ...(query.endDate ? { $lte: query.endDate } : {}),
    };
  }

  if (query.lateOnly) filter.status = DAILY_REPORT_STATUS.LATE;

  if (query.reviewed !== undefined) {
    filter["review.reviewedAt"] = { $exists: query.reviewed };
  }

  if (query.mismatchOnly) {
    filter.$expr = {
      $or: [
        { $ne: ["$callsAttended", "$systemMetrics.callsAttended"] },
        { $ne: ["$callsAnswered", "$systemMetrics.callsAnswered"] },
        { $ne: ["$conversions", "$systemMetrics.conversions"] },
        {
          $gt: [
            {
              $abs: {
                $subtract: [
                  "$totalCallDurationSeconds",
                  "$systemMetrics.totalCallDurationSeconds",
                ],
              },
            },
            DURATION_TOLERANCE_SECONDS,
          ],
        },
      ],
    };
  }

  return filter;
};

const REPORT_POPULATE = [
  { path: "employeeId", select: EMPLOYEE_FIELDS },
  { path: "branchId", select: BRANCH_FIELDS },
  { path: "review.reviewedBy", select: EMPLOYEE_FIELDS },
];

export const listReports = async (
  user: AuthenticatedUser,
  query: DailyReportListQuery,
) => {
  const { page, limit, ...filters } = query;
  const filter = buildListFilter(user, filters);

  const [items, total] = await Promise.all([
    DailyReport.find(filter)
      .populate(REPORT_POPULATE)
      .sort({ reportDate: -1, submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    DailyReport.countDocuments(filter),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const scopedIdFilter = (user: AuthenticatedUser, id: string) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid report ID", 400, "INVALID_REPORT_ID");
  }
  const branchIds = getScopedBranchIds(user);
  return {
    _id: toObjectId(id),
    ...(branchIds ? { branchId: { $in: branchIds } } : {}),
  };
};

export const getReportById = async (user: AuthenticatedUser, id: string) => {
  const report = await DailyReport.findOne(scopedIdFilter(user, id))
    .populate(REPORT_POPULATE)
    .lean();

  // Out-of-scope reports read as missing rather than forbidden.
  if (!report) {
    throw new AppError("Daily report not found", 404, "REPORT_NOT_FOUND");
  }

  return report;
};

export const reviewReport = async (
  user: AuthenticatedUser,
  id: string,
  remark?: string,
) => {
  const report = await DailyReport.findOne(scopedIdFilter(user, id));

  if (!report) {
    throw new AppError("Daily report not found", 404, "REPORT_NOT_FOUND");
  }

  report.review = {
    reviewedBy: toObjectId(user.id),
    reviewedAt: new Date(),
    ...(remark ? { remark } : {}),
  };
  await report.save();

  await notify({
    userIds: [report.employeeId],
    senderId: user.id,
    type: NOTIFICATION_TYPES.DAILY_REPORT_REVIEWED,
    title: "Daily report reviewed",
    message: remark
      ? `${user.name} reviewed your report for ${report.reportDate}: "${remark}"`
      : `${user.name} reviewed your report for ${report.reportDate}.`,
    entityId: report._id as Types.ObjectId,
    entityType: "DailyReport",
  });

  return getReportById(user, id);
};

/**
 * Active employees in scope who owe a report for `date` but haven't filed
 * one. Employees are grouped under their primary branch (`branches[0]`),
 * the same branch the portal and attendance use.
 */
export const getMissingReports = async (
  user: AuthenticatedUser,
  date: string,
  branchId?: string,
) => {
  const branchIds = getScopedBranchIds(user, branchId);

  const employees = await User.find({
    role: ROLES.EMPLOYEE,
    isActive: true,
    ...(branchIds ? { "branches.0": { $in: branchIds } } : {}),
  })
    .select("name email branches")
    .lean();

  const primaryBranchIds = [
    ...new Set(
      employees
        .map((e) => e.branches?.[0]?.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [branches, submitted, onLeave] = await Promise.all([
    Branch.find({ _id: { $in: primaryBranchIds }, isActive: true })
      .select("name code attendanceConfig")
      .lean(),
    DailyReport.find({
      reportDate: date,
      employeeId: { $in: employees.map((e) => e._id) },
    })
      .select("employeeId")
      .lean(),
    LeaveRequest.find({
      employee: { $in: employees.map((e) => e._id) },
      ...fullDayLeaveOnDateFilter(date),
    })
      .select("employee")
      .lean(),
  ]);

  const branchInfo = new Map<
    string,
    {
      _id: Types.ObjectId;
      name: string;
      code: string;
      workingDay: boolean;
      closesAt: Date;
      lateUntil: Date;
    }
  >();

  await Promise.all(
    branches.map(async (branch) => {
      const { timezone, endTime } = getSchedule(branch);
      const { closesAt, lateUntil } = getWindowBounds(date, endTime, timezone);
      branchInfo.set(branch._id.toString(), {
        _id: branch._id,
        name: branch.name,
        code: branch.code,
        workingDay: await isWorkingDay(branch, date),
        closesAt,
        lateUntil,
      });
    }),
  );

  const submittedIds = new Set(submitted.map((r) => r.employeeId.toString()));
  const onLeaveIds = new Set(onLeave.map((l) => l.employee.toString()));
  const now = new Date();

  let expected = 0;
  let onLeaveCount = 0;
  const missing = [];

  for (const employee of employees) {
    const branch = branchInfo.get(employee.branches?.[0]?.toString() ?? "");
    if (!branch?.workingDay) continue;

    const id = employee._id.toString();
    if (onLeaveIds.has(id)) {
      onLeaveCount += 1;
      continue;
    }

    expected += 1;
    if (submittedIds.has(id)) continue;

    missing.push({
      employee: { _id: employee._id, name: employee.name, email: employee.email },
      branch: { _id: branch._id, name: branch.name, code: branch.code },
      closesAt: branch.closesAt,
      lateUntil: branch.lateUntil,
      // Still within the (late) window: not missed yet, just outstanding.
      windowOpen: now <= branch.lateUntil,
    });
  }

  missing.sort((a, b) => a.employee.name.localeCompare(b.employee.name));

  return {
    date,
    totals: {
      expected,
      submitted: expected - missing.length,
      missing: missing.length,
      onLeave: onLeaveCount,
    },
    missing,
  };
};

export const getSummary = async (
  user: AuthenticatedUser,
  startDate: string,
  endDate: string,
  branchId?: string,
) => {
  const filter = buildListFilter(user, { startDate, endDate, branchId });

  const rows = await DailyReport.aggregate([
    { $match: filter },
    {
      $group: {
        _id: "$employeeId",
        reports: { $sum: 1 },
        lateReports: {
          $sum: { $cond: [{ $eq: ["$status", DAILY_REPORT_STATUS.LATE] }, 1, 0] },
        },
        callsAttended: { $sum: "$callsAttended" },
        callsAnswered: { $sum: "$callsAnswered" },
        conversions: { $sum: "$conversions" },
        totalCallDurationSeconds: { $sum: "$totalCallDurationSeconds" },
        systemCallsAttended: { $sum: "$systemMetrics.callsAttended" },
        systemConversions: { $sum: "$systemMetrics.conversions" },
        branchId: { $first: "$branchId" },
      },
    },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "employee",
      },
    },
    {
      $lookup: {
        from: Branch.collection.name,
        localField: "branchId",
        foreignField: "_id",
        as: "branch",
      },
    },
    {
      $project: {
        _id: 0,
        // Only whitelisted fields leave the pipeline (no password hashes).
        employee: {
          _id: { $arrayElemAt: ["$employee._id", 0] },
          name: { $arrayElemAt: ["$employee.name", 0] },
          email: { $arrayElemAt: ["$employee.email", 0] },
        },
        branch: {
          _id: { $arrayElemAt: ["$branch._id", 0] },
          name: { $arrayElemAt: ["$branch.name", 0] },
          code: { $arrayElemAt: ["$branch.code", 0] },
        },
        reports: 1,
        lateReports: 1,
        callsAttended: 1,
        callsAnswered: 1,
        conversions: 1,
        totalCallDurationSeconds: 1,
        systemCallsAttended: 1,
        systemConversions: 1,
      },
    },
    { $sort: { conversions: -1, callsAttended: -1 } },
  ]);

  return { startDate, endDate, rows };
};

// =========================================================================
// Export
// =========================================================================

const minutes = (seconds: number) => Math.round((seconds / 60) * 10) / 10;

export const exportReports = async (
  user: AuthenticatedUser,
  query: Omit<DailyReportListQuery, "page" | "limit">,
  format: "csv" | "excel",
) => {
  const filter = buildListFilter(user, query);

  const reports = await DailyReport.find(filter)
    .populate(REPORT_POPULATE)
    .sort({ reportDate: -1, submittedAt: -1 })
    .limit(EXPORT_ROW_LIMIT)
    .lean();

  const rows = reports.map((r) => {
    const employee = r.employeeId as unknown as { name?: string; email?: string };
    const branch = r.branchId as unknown as { name?: string };
    const reviewer = r.review?.reviewedBy as unknown as { name?: string } | undefined;

    return {
      Date: r.reportDate,
      Employee: employee?.name ?? "",
      Email: employee?.email ?? "",
      Branch: branch?.name ?? "",
      Status: r.status,
      "Submitted At": new Date(r.submittedAt).toISOString(),
      "Work Completed": r.workCompleted,
      "Calls Attended": r.callsAttended,
      "Calls Answered": r.callsAnswered,
      Conversions: r.conversions,
      "Call Duration (min)": minutes(r.totalCallDurationSeconds),
      "Daily Feedback": r.dailyFeedback ?? "",
      "Additional Fields": (r.customFields ?? [])
        .map((f) => `${f.label}: ${f.value}`)
        .join("; "),
      "System Calls Attended": r.systemMetrics?.callsAttended ?? 0,
      "System Calls Answered": r.systemMetrics?.callsAnswered ?? 0,
      "System Conversions": r.systemMetrics?.conversions ?? 0,
      "System Call Duration (min)": minutes(
        r.systemMetrics?.totalCallDurationSeconds ?? 0,
      ),
      "Reviewed By": reviewer?.name ?? "",
      "Review Remark": r.review?.remark ?? "",
    };
  });

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    return {
      body: await ReportService.exportToExcel("Daily Reports", rows),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `daily-reports-${stamp}.xlsx`,
    };
  }

  return {
    // json2csv throws on an empty array; an empty file is the right answer.
    body: rows.length ? ReportService.exportToCSV(rows) : "",
    contentType: "text/csv",
    filename: `daily-reports-${stamp}.csv`,
  };
};
