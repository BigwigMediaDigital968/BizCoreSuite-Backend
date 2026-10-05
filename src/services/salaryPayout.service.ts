import mongoose, { Types } from "mongoose";

import { Attendance } from "../models/Attendance.js";
import { Branch } from "../models/Branch.js";
import { EmployeeProfile } from "../models/EmployeeProfile.js";
import { Holiday } from "../models/Holiday.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { SalaryDeduction } from "../models/SalaryDeduction.js";
import {
  SalaryPayout,
  type IPayoutAdjustment,
  type IPayoutOverride,
} from "../models/SalaryPayout.js";
import { SalarySettings } from "../models/SalarySettings.js";
import { User } from "../models/User.js";
import { ATTENDANCE_STATUS } from "../constants/attendanceStatus.js";
import { EMPLOYMENT_STATUS, type EmploymentStatus } from "../constants/employee.js";
import {
  LEAVE_DURATION_TYPE,
  LEAVE_REQUEST_STATUS,
} from "../constants/leaveRequest.js";
import { ROLES } from "../constants/roles.js";
import {
  DEFAULT_SALARY_SETTINGS,
  MISSED_CHECKOUT_POLICY,
  SALARY_DEDUCTION_FIELDS,
  SALARY_DEDUCTION_SOURCE,
  SALARY_DEDUCTION_STATUS,
  SALARY_EARNING_FIELDS,
  SALARY_PAYOUT_MAX_RANGE_DAYS,
  SALARY_PAYOUT_STATUS,
  SALARY_PER_DAY_BASIS,
  SALARY_SETTINGS_KEY,
  STATUTORY_PRORATION,
  type SalaryDeductionSource,
  type SalarySettingsValues,
} from "../constants/salary.js";
import { ReportService } from "./report.service.js";
import { AppError } from "../utils/AppError.js";
import {
  getDateInTimezone,
  getDayOfWeekForDate,
  timeToMinutes,
} from "../utils/timezone.js";
import type { AuthenticatedUser } from "../types/auth.js";
import type {
  CreateDeductionInput,
  DeductionListQuery,
  PayoutInput,
  PayoutListQuery,
  SalarySettingsInput,
} from "../validators/salary.validator.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];
const DEFAULT_SHIFT = { startTime: "09:30", endTime: "18:30" };

/** Profiles in these states don't get paid. */
const EXITED_STATUSES: EmploymentStatus[] = [
  EMPLOYMENT_STATUS.RESIGNED,
  EMPLOYMENT_STATUS.TERMINATED,
  EMPLOYMENT_STATUS.INACTIVE,
];

const toObjectId = (id: string | Types.ObjectId) =>
  typeof id === "string" ? new Types.ObjectId(id) : id;

/** Money is kept to the paisa; every line item is rounded on its own. */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// =========================================================================
// Date helpers ("YYYY-MM-DD" strings only)
// =========================================================================

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

const daysBetweenInclusive = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      DAY_MS,
  ) + 1;

const eachDay = function* (from: string, to: string) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
};

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

const daysInMonth = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
};

/** Splits [from, to] into calendar-month pieces. */
const monthSegments = (from: string, to: string) => {
  const segments: { month: string; from: string; to: string }[] = [];
  let cursor = from;
  while (cursor <= to) {
    const month = cursor.slice(0, 7);
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    const end = monthEnd < to ? monthEnd : to;
    segments.push({ month, from: cursor, to: end });
    cursor = addDays(end, 1);
  }
  return segments;
};

const assertRange = (from: string, to: string) => {
  if (daysBetweenInclusive(from, to) > SALARY_PAYOUT_MAX_RANGE_DAYS) {
    throw new AppError(
      `A payout can cover at most ${SALARY_PAYOUT_MAX_RANGE_DAYS} days`,
      400,
      "PAYOUT_RANGE_TOO_LONG",
    );
  }
  if (to > getDateInTimezone(DEFAULT_TIMEZONE)) {
    throw new AppError(
      "A payout can't include future dates",
      400,
      "PAYOUT_RANGE_IN_FUTURE",
    );
  }
};

// =========================================================================
// Settings (optional document; defaults when none is saved)
// =========================================================================

export const getSettings = async (): Promise<
  SalarySettingsValues & { isDefault: boolean; updatedAt?: Date }
> => {
  const doc = await SalarySettings.findOne({ key: SALARY_SETTINGS_KEY }).lean();
  if (!doc) return { ...DEFAULT_SALARY_SETTINGS, isDefault: true };

  return {
    perDayBasis: doc.perDayBasis,
    lateRule: {
      enabled: doc.lateRule.enabled,
      freeLatesPerMonth: doc.lateRule.freeLatesPerMonth,
      everyNLates: doc.lateRule.everyNLates,
      deductionDays: doc.lateRule.deductionDays,
      severeLateMinutes: doc.lateRule.severeLateMinutes ?? null,
    },
    halfDayRule: {
      enabled: doc.halfDayRule.enabled,
      minWorkingMinutes: doc.halfDayRule.minWorkingMinutes ?? null,
    },
    missedCheckoutPolicy: doc.missedCheckoutPolicy,
    absenceRequiresApproval: doc.absenceRequiresApproval,
    statutoryProration: doc.statutoryProration,
    isDefault: false,
    updatedAt: doc.updatedAt,
  };
};

export const updateSettings = async (
  user: AuthenticatedUser,
  input: SalarySettingsInput,
) => {
  await SalarySettings.findOneAndUpdate(
    { key: SALARY_SETTINGS_KEY },
    { ...input, key: SALARY_SETTINGS_KEY, updatedBy: toObjectId(user.id) },
    { upsert: true, runValidators: true },
  );
  return getSettings();
};

export const resetSettings = async () => {
  await SalarySettings.deleteOne({ key: SALARY_SETTINGS_KEY });
  return getSettings();
};

// =========================================================================
// Loading everything one calculation needs, in batched queries
// =========================================================================

interface BranchInfo {
  _id: Types.ObjectId;
  name: string;
  code: string;
  timezone: string;
  workingDays: number[];
  shiftMinutes: number;
  attendanceEnabled: boolean;
}

interface EmployeeInfo {
  userId: Types.ObjectId;
  name: string;
  email: string;
  role: string;
  employeeCode: string;
  designation?: string;
  joiningDate?: string;
  salary: Record<string, number>;
  branch: BranchInfo | null;
}

const toBranchInfo = (branch: {
  _id: Types.ObjectId;
  name: string;
  code: string;
  attendanceConfig?: {
    enabled?: boolean;
    timezone?: string;
    workingDays?: number[];
    workingHours?: { startTime?: string; endTime?: string };
  };
}): BranchInfo => {
  const config = branch.attendanceConfig;
  const start = config?.workingHours?.startTime || DEFAULT_SHIFT.startTime;
  const end = config?.workingHours?.endTime || DEFAULT_SHIFT.endTime;
  return {
    _id: branch._id,
    name: branch.name,
    code: branch.code,
    timezone: config?.timezone || DEFAULT_TIMEZONE,
    workingDays: config?.workingDays?.length
      ? config.workingDays
      : DEFAULT_WORKING_DAYS,
    shiftMinutes: Math.max(0, timeToMinutes(end) - timeToMinutes(start)),
    attendanceEnabled: config?.enabled !== false,
  };
};

const loadEmployees = async (
  userIds: Types.ObjectId[],
): Promise<Map<string, EmployeeInfo>> => {
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: userIds } })
      .select("name email role branches isActive")
      .lean(),
    EmployeeProfile.find({ user: { $in: userIds } })
      .select("user employeeCode designation joiningDate salary branch employmentStatus")
      .lean(),
  ]);

  const profileByUser = new Map(profiles.map((p) => [p.user.toString(), p]));

  const branchIds = new Set<string>();
  for (const u of users) {
    const primary =
      u.branches?.[0]?.toString() ??
      profileByUser.get(u._id.toString())?.branch?.toString();
    if (primary) branchIds.add(primary);
  }

  const branches = await Branch.find({ _id: { $in: [...branchIds] } })
    .select("name code attendanceConfig")
    .lean();
  const branchById = new Map(
    branches.map((b) => [b._id.toString(), toBranchInfo(b)]),
  );

  const result = new Map<string, EmployeeInfo>();
  for (const u of users) {
    const profile = profileByUser.get(u._id.toString());
    const primary = u.branches?.[0]?.toString() ?? profile?.branch?.toString();
    result.set(u._id.toString(), {
      userId: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      employeeCode: profile?.employeeCode ?? "",
      designation: profile?.designation,
      joiningDate: profile?.joiningDate
        ? toDateString(new Date(profile.joiningDate))
        : undefined,
      salary: (profile?.salary ?? {}) as unknown as Record<string, number>,
      branch: primary ? (branchById.get(primary) ?? null) : null,
    });
  }
  return result;
};

interface LeaveDay {
  isPaid: boolean;
  half: boolean;
}

interface AttendanceDay {
  status: string;
  checkInAt?: Date;
  checkOutAt?: Date;
  lateMinutes: number;
  totalWorkingMinutes?: number;
}

const loadPeriodData = async (
  employees: EmployeeInfo[],
  from: string,
  to: string,
) => {
  const userIds = employees.map((e) => e.userId);
  const branchIds = [
    ...new Set(
      employees
        .map((e) => e.branch?._id.toString())
        .filter((id): id is string => Boolean(id)),
    ),
  ].map(toObjectId);

  // Holidays and leave dates are date-only values stored at UTC midnight.
  const rangeStart = new Date(`${from}T00:00:00.000Z`);
  const rangeEnd = new Date(`${to}T23:59:59.999Z`);

  const [holidays, leaves, attendance] = await Promise.all([
    Holiday.find({
      branch: { $in: branchIds },
      isActive: true,
      date: { $gte: rangeStart, $lte: rangeEnd },
    })
      .select("branch date name")
      .lean(),
    LeaveRequest.find({
      employee: { $in: userIds },
      status: LEAVE_REQUEST_STATUS.APPROVED,
      startDate: { $lte: rangeEnd },
      endDate: { $gte: rangeStart },
    })
      .select("employee startDate endDate durationType leavePolicy")
      .populate("leavePolicy", "isPaid")
      .lean(),
    Attendance.find({
      employee: { $in: userIds },
      date: { $gte: from, $lte: to },
    })
      .select("employee date status checkInAt checkOutAt lateMinutes totalWorkingMinutes")
      .lean(),
  ]);

  const holidaysByBranch = new Map<string, Set<string>>();
  for (const h of holidays) {
    const key = h.branch.toString();
    if (!holidaysByBranch.has(key)) holidaysByBranch.set(key, new Set());
    holidaysByBranch.get(key)!.add(toDateString(new Date(h.date)));
  }

  const leavesByEmployee = new Map<string, Map<string, LeaveDay>>();
  for (const leave of leaves) {
    const key = leave.employee.toString();
    if (!leavesByEmployee.has(key)) leavesByEmployee.set(key, new Map());
    const days = leavesByEmployee.get(key)!;
    const policy = leave.leavePolicy as unknown as { isPaid?: boolean } | null;
    const isPaid = policy?.isPaid !== false;
    const half = leave.durationType !== LEAVE_DURATION_TYPE.FULL_DAY;
    const start = toDateString(new Date(leave.startDate));
    const end = toDateString(new Date(leave.endDate));
    for (const d of eachDay(start < from ? from : start, end > to ? to : end)) {
      days.set(d, { isPaid, half });
    }
  }

  const attendanceByEmployee = new Map<string, Map<string, AttendanceDay>>();
  for (const a of attendance) {
    const key = a.employee.toString();
    if (!attendanceByEmployee.has(key)) attendanceByEmployee.set(key, new Map());
    attendanceByEmployee.get(key)!.set(a.date, {
      status: a.status,
      checkInAt: a.checkInAt,
      checkOutAt: a.checkOutAt,
      lateMinutes: a.lateMinutes ?? 0,
      totalWorkingMinutes: a.totalWorkingMinutes,
    });
  }

  return { holidaysByBranch, leavesByEmployee, attendanceByEmployee };
};

// =========================================================================
// The calculation (pure: it never writes)
// =========================================================================

export interface PayoutSuggestion {
  key: string;
  type: SalaryDeductionSource;
  date: string;
  days: number;
  amount: number;
  description: string;
  decision: "approved" | "rejected";
}

export interface PayoutManualDeduction {
  _id: Types.ObjectId;
  date: string;
  reason: string;
  amount: number | null;
  days: number | null;
  computedAmount: number;
  status: string;
  decision: "approved" | "rejected" | "pending";
}

export interface ComputedLine {
  employee: Types.ObjectId;
  employeeCode: string;
  name: string;
  email: string;
  designation?: string;
  branch: { _id: Types.ObjectId; name: string; code: string } | null;
  salarySnapshot: Record<string, number>;
  days: Record<string, number>;
  lateCount: number;
  perDayRate: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  deductionRefs: Types.ObjectId[];
  suggestions: PayoutSuggestion[];
  manualDeductions: PayoutManualDeduction[];
  adjustments: IPayoutAdjustment[];
  overrides: IPayoutOverride[];
  calculatedNet: number;
  net: number;
  warnings: string[];
}

interface ManualDeductionDoc {
  _id: Types.ObjectId;
  employee: Types.ObjectId;
  date: string;
  reason: string;
  amount?: number | null;
  days?: number | null;
  status: string;
}

interface ComputeContext {
  settings: SalarySettingsValues;
  from: string;
  to: string;
  today: string;
  holidays: Set<string>;
  leaves: Map<string, LeaveDay>;
  attendance: Map<string, AttendanceDay>;
  manualDeductions: ManualDeductionDoc[];
  suggestionDecisions: Record<string, "approved" | "rejected">;
  deductionDecisions: Record<string, "approved" | "rejected">;
  adjustments: IPayoutAdjustment[];
  overrides: { field: string; value: number; reason: string }[];
}

const STATUTORY_FIELDS = [
  ["pf", "pfDeduction"],
  ["esi", "esiDeduction"],
  ["professionalTax", "professionalTax"],
  ["other", "otherDeduction"],
] as const;

const formatInr = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const computeLine = (
  employee: EmployeeInfo,
  ctx: ComputeContext,
): ComputedLine => {
  const { settings } = ctx;
  const warnings: string[] = [];
  const branch = employee.branch;
  const workingDays = branch?.workingDays ?? DEFAULT_WORKING_DAYS;

  // Only employees punch in; for everyone else (and branches with attendance
  // switched off) every working day without leave counts as present.
  const attendanceTracked =
    employee.role === ROLES.EMPLOYEE && (branch?.attendanceEnabled ?? false);
  if (!attendanceTracked) {
    warnings.push("Attendance isn't tracked for this employee; working days are counted as present");
  }
  if (!branch) warnings.push("No branch assigned; default working days used");

  const halfDayThreshold =
    settings.halfDayRule.minWorkingMinutes ??
    Math.floor((branch?.shiftMinutes ?? 540) / 2);

  // ----- Monthly salary -----
  const salary = employee.salary;
  const componentSum = SALARY_EARNING_FIELDS.reduce(
    (sum, f) => sum + (salary[f] ?? 0),
    0,
  );
  const monthlyGross = componentSum > 0 ? componentSum : (salary.grossSalary ?? 0);
  const componentShare = (field: (typeof SALARY_EARNING_FIELDS)[number]) => {
    if (componentSum > 0) return (salary[field] ?? 0) / componentSum;
    return field === "basic" ? 1 : 0;
  };

  const employedFrom =
    employee.joiningDate && employee.joiningDate > ctx.from
      ? employee.joiningDate
      : ctx.from;
  if (employedFrom > ctx.from) {
    warnings.push(`Joined on ${employedFrom}, part-way through the period`);
  }

  const days = {
    calendar: 0,
    notEmployed: 0,
    entitled: 0,
    working: 0,
    holidays: 0,
    weekOffs: 0,
    present: 0,
    late: 0,
    halfDay: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    absent: 0,
    excused: 0,
    lop: 0,
    payable: 0,
  };

  let grossPeriod = 0;
  let lopAmount = 0;
  let lateAmount = 0;
  const statutory = { pf: 0, esi: 0, professionalTax: 0, other: 0 };
  const suggestions: PayoutSuggestion[] = [];
  const rateByMonth = new Map<string, number>();
  let missedCheckouts = 0;
  let firstRate = 0;

  const decide = (key: string) => ctx.suggestionDecisions[key] ?? "approved";

  for (const segment of monthSegments(ctx.from, ctx.to)) {
    const monthDays = daysInMonth(segment.month);
    const monthStart = `${segment.month}-01`;
    const monthEnd = `${segment.month}-${String(monthDays).padStart(2, "0")}`;

    let divisor: number;
    if (settings.perDayBasis === SALARY_PER_DAY_BASIS.WORKING_DAYS) {
      divisor = 0;
      for (const d of eachDay(monthStart, monthEnd)) {
        if (workingDays.includes(getDayOfWeekForDate(d))) divisor++;
      }
    } else if (settings.perDayBasis === SALARY_PER_DAY_BASIS.CALENDAR_DAYS) {
      divisor = monthDays;
    } else {
      divisor = 30;
    }

    const rate = divisor > 0 ? monthlyGross / divisor : 0;
    if (divisor === 0) warnings.push(`No working days configured for ${segment.month}`);
    rateByMonth.set(segment.month, rate);
    if (!firstRate) firstRate = rate;

    let segEntitled = 0;
    let segLop = 0;
    let segLates = 0;
    const severeLates: { date: string; minutes: number }[] = [];

    for (const d of eachDay(segment.from, segment.to)) {
      days.calendar++;
      if (d < employedFrom) {
        days.notEmployed++;
        continue;
      }

      const isWorkingWeekday = workingDays.includes(getDayOfWeekForDate(d));
      if (settings.perDayBasis === SALARY_PER_DAY_BASIS.WORKING_DAYS) {
        if (isWorkingWeekday) segEntitled++;
      } else {
        segEntitled++;
      }

      if (!isWorkingWeekday) {
        days.weekOffs++;
        continue;
      }
      if (ctx.holidays.has(d)) {
        days.holidays++;
        continue;
      }

      days.working++;
      const leave = ctx.leaves.get(d);
      if (leave && !leave.half) {
        if (leave.isPaid) days.paidLeave++;
        else {
          days.unpaidLeave++;
          segLop++;
        }
        continue;
      }

      let remaining = 1;
      if (leave) {
        remaining = 0.5;
        if (leave.isPaid) days.paidLeave += 0.5;
        else {
          days.unpaidLeave += 0.5;
          segLop += 0.5;
        }
      }

      if (!attendanceTracked) {
        days.present += remaining;
        continue;
      }

      const att = ctx.attendance.get(d);
      const attended =
        att &&
        att.status !== ATTENDANCE_STATUS.ABSENT &&
        (att.checkInAt || att.status === ATTENDANCE_STATUS.HALF_DAY);

      if (attended) {
        if (att.status === ATTENDANCE_STATUS.LATE) {
          days.late++;
          const severe = settings.lateRule.severeLateMinutes;
          if (severe && att.lateMinutes > severe) {
            severeLates.push({ date: d, minutes: att.lateMinutes });
          } else {
            segLates++;
          }
        }

        let isHalf = att.status === ATTENDANCE_STATUS.HALF_DAY;
        // With half-day leave the other half is already accounted for.
        if (!isHalf && !leave) {
          if (att.checkOutAt) {
            if (
              settings.halfDayRule.enabled &&
              (att.totalWorkingMinutes ?? Infinity) < halfDayThreshold
            ) {
              isHalf = true;
            }
          } else if (d !== ctx.today) {
            missedCheckouts++;
            if (settings.missedCheckoutPolicy === MISSED_CHECKOUT_POLICY.HALF_DAY) {
              isHalf = true;
            }
          }
        }

        if (isHalf && !leave) {
          days.present += 0.5;
          days.halfDay++;
          segLop += 0.5;
        } else {
          days.present += remaining;
        }
        continue;
      }

      // No attendance, no leave, not a holiday: absent.
      days.absent += remaining;
      if (settings.absenceRequiresApproval) {
        const key = `absence:${d}`;
        const decision = decide(key);
        suggestions.push({
          key,
          type: SALARY_DEDUCTION_SOURCE.ABSENCE,
          date: d,
          days: remaining,
          amount: round2(remaining * rate),
          description:
            d === ctx.today
              ? `Absent on ${d} (today, the day isn't over)`
              : `Absent on ${d}`,
          decision,
        });
        if (decision === "approved") segLop += remaining;
        else days.excused += remaining;
      } else {
        segLop += remaining;
      }
    }

    // Fixed-30 pays exactly 30 days for a full month.
    if (settings.perDayBasis === SALARY_PER_DAY_BASIS.FIXED_30) {
      segEntitled =
        segment.from === monthStart && segment.to === monthEnd && employedFrom <= monthStart
          ? 30
          : Math.min(30, segEntitled);
    }

    // ----- Late rule for this month -----
    if (settings.lateRule.enabled) {
      for (const s of severeLates) {
        const key = `late-severe:${s.date}`;
        const decision = decide(key);
        suggestions.push({
          key,
          type: SALARY_DEDUCTION_SOURCE.LATE_RULE,
          date: s.date,
          days: 0.5,
          amount: round2(0.5 * rate),
          description: `${s.minutes} min late on ${s.date} (over ${settings.lateRule.severeLateMinutes} min = ½ day)`,
          decision,
        });
        if (decision === "approved") lateAmount += 0.5 * rate;
      }

      const { freeLatesPerMonth, everyNLates, deductionDays } = settings.lateRule;
      const blocks = Math.floor(Math.max(0, segLates - freeLatesPerMonth) / everyNLates);
      if (blocks > 0 && deductionDays > 0) {
        const key = `late:${segment.month}`;
        const decision = decide(key);
        const blockDays = blocks * deductionDays;
        suggestions.push({
          key,
          type: SALARY_DEDUCTION_SOURCE.LATE_RULE,
          date: segment.to,
          days: blockDays,
          amount: round2(blockDays * rate),
          description: `${segLates} lates in ${segment.month} (${freeLatesPerMonth} free, ${deductionDays} day per ${everyNLates}) → ${blockDays} day(s)`,
          decision,
        });
        if (decision === "approved") lateAmount += blockDays * rate;
      }
    }

    days.entitled += segEntitled;
    days.lop += segLop;
    grossPeriod += segEntitled * rate;
    lopAmount += segLop * rate;

    // ----- Statutory deductions for this month -----
    const segPayable = Math.max(0, segEntitled - segLop);
    const factor =
      settings.statutoryProration === STATUTORY_PRORATION.FULL_IF_ANY_PAYABLE_DAY
        ? segPayable > 0
          ? 1
          : 0
        : divisor > 0
          ? Math.min(1, segPayable / divisor)
          : 0;
    for (const [key, source] of STATUTORY_FIELDS) {
      statutory[key] += (salary[source] ?? 0) * factor;
    }
  }

  days.payable = Math.max(0, days.entitled - days.lop);
  if (missedCheckouts > 0) {
    warnings.push(`Missed checkout on ${missedCheckouts} day(s)`);
  }
  if (ctx.to === ctx.today && attendanceTracked) {
    warnings.push("The period includes today, which isn't over yet");
  }

  // ----- Manual deductions (approved, or pending with an approve decision) -----
  const rateFor = (date: string) => rateByMonth.get(date.slice(0, 7)) ?? firstRate;
  let manualAmount = 0;
  const deductionRefs: Types.ObjectId[] = [];
  const manualDeductions: PayoutManualDeduction[] = ctx.manualDeductions.map((d) => {
    const computedAmount = round2(d.amount ?? (d.days ?? 0) * rateFor(d.date));
    const decision =
      d.status === SALARY_DEDUCTION_STATUS.APPROVED
        ? "approved"
        : (ctx.deductionDecisions[d._id.toString()] ?? "pending");
    if (decision === "approved") {
      manualAmount += computedAmount;
      deductionRefs.push(d._id);
    }
    return {
      _id: d._id,
      date: d.date,
      reason: d.reason,
      amount: d.amount ?? null,
      days: d.days ?? null,
      computedAmount,
      status: d.status,
      decision,
    };
  });

  // ----- Assemble -----
  const earnings: Record<string, number> = {};
  for (const f of SALARY_EARNING_FIELDS) {
    earnings[f] = round2(grossPeriod * componentShare(f));
  }

  const deductions: Record<string, number> = {
    lop: round2(lopAmount),
    lateRule: round2(lateAmount),
    manual: round2(manualAmount),
    pf: round2(statutory.pf),
    esi: round2(statutory.esi),
    professionalTax: round2(statutory.professionalTax),
    other: round2(statutory.other),
  };

  const adjustments = ctx.adjustments.map((a) => ({
    label: a.label,
    amount: round2(a.amount),
    ...(a.note ? { note: a.note } : {}),
  }));
  const adjustmentTotal = round2(adjustments.reduce((s, a) => s + a.amount, 0));

  const sumEarnings = () =>
    round2(SALARY_EARNING_FIELDS.reduce((s, f) => s + (earnings[f] ?? 0), 0));
  const sumDeductions = () =>
    round2(SALARY_DEDUCTION_FIELDS.reduce((s, f) => s + (deductions[f] ?? 0), 0));

  const calculatedNet = Math.max(
    0,
    round2(sumEarnings() - sumDeductions() + adjustmentTotal),
  );

  // ----- Head's manual overrides -----
  const overrides: IPayoutOverride[] = [];
  let netOverride: IPayoutOverride | null = null;
  for (const o of ctx.overrides) {
    const value = round2(o.value);
    if (o.field === "net") {
      netOverride = { field: "net", calculated: 0, value, reason: o.reason };
      continue;
    }
    const [group, key] = o.field.split(".") as ["earnings" | "deductions", string];
    const target = group === "earnings" ? earnings : deductions;
    const calculated = target[key] ?? 0;
    // A no-op edit isn't worth an audit entry.
    if (calculated === value) continue;
    target[key] = value;
    overrides.push({ field: o.field, calculated, value, reason: o.reason });
  }

  earnings.gross = sumEarnings();
  deductions.total = sumDeductions();
  const componentNet = round2(earnings.gross - deductions.total + adjustmentTotal);

  let net: number;
  if (netOverride) {
    const calculated = Math.max(0, componentNet);
    if (calculated !== netOverride.value) {
      overrides.push({ ...netOverride, calculated });
      warnings.push(
        `Net set manually; differs from its components by ${formatInr(round2(netOverride.value - componentNet))}`,
      );
      net = netOverride.value;
    } else {
      net = calculated;
    }
  } else if (componentNet < 0) {
    warnings.push(`Deductions exceed earnings by ${formatInr(-componentNet)}; net set to ₹0`);
    net = 0;
  } else {
    net = componentNet;
  }

  if (monthlyGross <= 0) warnings.push("No salary configured");

  return {
    employee: employee.userId,
    employeeCode: employee.employeeCode,
    name: employee.name,
    email: employee.email,
    ...(employee.designation ? { designation: employee.designation } : {}),
    branch: branch ? { _id: branch._id, name: branch.name, code: branch.code } : null,
    salarySnapshot: {
      ...Object.fromEntries(
        [...SALARY_EARNING_FIELDS, "grossSalary", "pfDeduction", "esiDeduction", "professionalTax", "otherDeduction", "netSalary"].map(
          (f) => [f, salary[f] ?? 0],
        ),
      ),
    },
    days,
    lateCount: days.late,
    perDayRate: round2(firstRate),
    earnings,
    deductions,
    deductionRefs,
    suggestions,
    manualDeductions,
    adjustments,
    overrides,
    calculatedNet,
    net,
    warnings,
  };
};

// =========================================================================
// Eligibility
// =========================================================================

const findOverlappingPayouts = async (
  userIds: Types.ObjectId[],
  from: string,
  to: string,
) => {
  const payouts = await SalaryPayout.find({
    status: { $ne: SALARY_PAYOUT_STATUS.CANCELLED },
    from: { $lte: to },
    to: { $gte: from },
    "lines.employee": { $in: userIds },
  })
    .select("payoutNo from to lines.employee")
    .lean();

  const byEmployee = new Map<string, { _id: Types.ObjectId; payoutNo: string }>();
  const wanted = new Set(userIds.map((id) => id.toString()));
  for (const p of payouts) {
    for (const line of p.lines) {
      const id = line.employee.toString();
      if (wanted.has(id) && !byEmployee.has(id)) {
        byEmployee.set(id, { _id: p._id as Types.ObjectId, payoutNo: p.payoutNo });
      }
    }
  }
  return byEmployee;
};

export const getEligibleEmployees = async (
  from: string,
  to: string,
  branchId?: string,
) => {
  assertRange(from, to);

  const users = await User.find({
    isActive: true,
    role: { $ne: ROLES.HEAD },
    ...(branchId ? { "branches.0": toObjectId(branchId) } : {}),
  })
    .select("_id")
    .lean();

  const profiles = await EmployeeProfile.find({
    user: { $in: users.map((u) => u._id as Types.ObjectId) },
    employmentStatus: { $nin: EXITED_STATUSES },
  })
    .select("user")
    .lean();

  const userIds = profiles.map((p) => p.user as Types.ObjectId);
  const [employees, overlaps] = await Promise.all([
    loadEmployees(userIds),
    findOverlappingPayouts(userIds, from, to),
  ]);

  const rows = [...employees.values()].map((e) => {
    const grossSalary =
      SALARY_EARNING_FIELDS.reduce((s, f) => s + (e.salary[f] ?? 0), 0) ||
      (e.salary.grossSalary ?? 0);
    const overlappingPayout = overlaps.get(e.userId.toString()) ?? null;
    const joinsAfterRange = Boolean(e.joiningDate && e.joiningDate > to);
    const hasSalary = grossSalary > 0;

    let disabledReason: string | null = null;
    if (!hasSalary) disabledReason = "No salary configured";
    else if (overlappingPayout)
      disabledReason = `Already in payout ${overlappingPayout.payoutNo}`;
    else if (joinsAfterRange) disabledReason = `Joins on ${e.joiningDate}`;

    return {
      _id: e.userId,
      name: e.name,
      email: e.email,
      role: e.role,
      employeeCode: e.employeeCode,
      designation: e.designation ?? null,
      branch: e.branch
        ? { _id: e.branch._id, name: e.branch.name, code: e.branch.code }
        : null,
      joiningDate: e.joiningDate ?? null,
      grossSalary: round2(grossSalary),
      hasSalary,
      overlappingPayout,
      selectable: !disabledReason,
      disabledReason,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
};

// =========================================================================
// Preview & generate
// =========================================================================

const buildLines = async (input: PayoutInput) => {
  assertRange(input.from, input.to);

  const userIds = [...new Set(input.employeeIds)].map(toObjectId);
  const [settings, employees, overlaps, manual] = await Promise.all([
    getSettings(),
    loadEmployees(userIds),
    findOverlappingPayouts(userIds, input.from, input.to),
    SalaryDeduction.find({
      employee: { $in: userIds },
      source: SALARY_DEDUCTION_SOURCE.MANUAL,
      status: { $in: [SALARY_DEDUCTION_STATUS.PENDING, SALARY_DEDUCTION_STATUS.APPROVED] },
      payout: null,
      date: { $gte: input.from, $lte: input.to },
    })
      .select("employee date reason amount days status")
      .sort({ date: 1 })
      .lean(),
  ]);

  const problems: string[] = [];
  for (const id of userIds) {
    const e = employees.get(id.toString());
    if (!e) {
      problems.push(`Employee ${id} not found`);
      continue;
    }
    const overlap = overlaps.get(id.toString());
    if (overlap) problems.push(`${e.name} is already in payout ${overlap.payoutNo}`);
    if (e.joiningDate && e.joiningDate > input.to) {
      problems.push(`${e.name} joins after the period ends`);
    }
  }
  if (problems.length) {
    throw new AppError(problems.join("; "), 409, "PAYOUT_EMPLOYEES_INVALID");
  }

  const period = await loadPeriodData([...employees.values()], input.from, input.to);
  const today = getDateInTimezone(DEFAULT_TIMEZONE);

  const manualByEmployee = new Map<string, ManualDeductionDoc[]>();
  for (const d of manual) {
    const key = d.employee.toString();
    if (!manualByEmployee.has(key)) manualByEmployee.set(key, []);
    manualByEmployee.get(key)!.push(d as unknown as ManualDeductionDoc);
  }

  const lines = userIds.map((id) => {
    const key = id.toString();
    const e = employees.get(key)!;
    return computeLine(e, {
      settings,
      from: input.from,
      to: input.to,
      today: e.branch ? getDateInTimezone(e.branch.timezone) : today,
      holidays: period.holidaysByBranch.get(e.branch?._id.toString() ?? "") ?? new Set(),
      leaves: period.leavesByEmployee.get(key) ?? new Map(),
      attendance: period.attendanceByEmployee.get(key) ?? new Map(),
      manualDeductions: manualByEmployee.get(key) ?? [],
      suggestionDecisions: input.suggestionDecisions[key] ?? {},
      deductionDecisions: input.deductionDecisions,
      adjustments: input.adjustments[key] ?? [],
      overrides: input.overrides[key] ?? [],
    });
  });

  lines.sort((a, b) => a.name.localeCompare(b.name));
  return { settings, lines };
};

const summarize = (lines: ComputedLine[]) => ({
  employees: lines.length,
  gross: round2(lines.reduce((s, l) => s + (l.earnings.gross ?? 0), 0)),
  deductions: round2(lines.reduce((s, l) => s + (l.deductions.total ?? 0), 0)),
  adjustments: round2(
    lines.reduce((s, l) => s + l.adjustments.reduce((a, x) => a + x.amount, 0), 0),
  ),
  net: round2(lines.reduce((s, l) => s + l.net, 0)),
  overriddenLines: lines.filter((l) => l.overrides.length > 0).length,
});

export const previewPayout = async (input: PayoutInput) => {
  const { settings, lines } = await buildLines(input);
  return {
    from: input.from,
    to: input.to,
    settings,
    totals: summarize(lines),
    lines,
  };
};

// Same fallback as leave.service.ts: standalone MongoDB has no transactions.
const runTransaction = async <T>(
  action: (session?: mongoose.ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await action(session);
    await session.commitTransaction();
    return result;
  } catch (error: any) {
    await session.abortTransaction();
    if (error?.code === 20 || error?.message?.includes("replica set")) {
      return await action();
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const nextPayoutNo = async (session?: mongoose.ClientSession) => {
  const month = getDateInTimezone(DEFAULT_TIMEZONE).slice(0, 7);
  const prefix = `PO-${month}-`;
  const last = await SalaryPayout.findOne({ payoutNo: { $regex: `^${prefix}` } })
    .sort({ payoutNo: -1 })
    .select("payoutNo")
    .session(session ?? null)
    .lean();
  const seq = last ? Number(last.payoutNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
};

export const generatePayout = async (user: AuthenticatedUser, input: PayoutInput) => {
  const { settings, lines } = await buildLines(input);
  const reviewer = toObjectId(user.id);
  const now = new Date();

  // Pending deductions the Head decided on in the preview. Only ones that
  // belong to employees in this payout; stray ids from the client are ignored.
  const decided = lines.flatMap((l) =>
    l.manualDeductions
      .filter((d) => d.status === SALARY_DEDUCTION_STATUS.PENDING && d.decision !== "pending")
      .map((d) => [d._id, d.decision as "approved" | "rejected"] as const),
  );

  const attempt = () =>
    runTransaction(async (session) => {
      const payoutId = new Types.ObjectId();

      // System suggestions become deduction records, so the decision is kept.
      const suggestionDocs = lines.flatMap((line) =>
        line.suggestions.map((s) => {
          const _id = new Types.ObjectId();
          if (s.decision === "approved") line.deductionRefs.push(_id);
          return {
            _id,
            employee: line.employee,
            branch: line.branch?._id,
            date: s.date,
            source: s.type,
            days: s.days,
            amount: s.amount,
            reason: s.description,
            status: s.decision,
            raisedBy: null,
            reviewedBy: reviewer,
            reviewedAt: now,
            payout: payoutId,
          };
        }),
      );

      const payout = await new SalaryPayout({
        _id: payoutId,
        payoutNo: await nextPayoutNo(session),
        from: input.from,
        to: input.to,
        status: SALARY_PAYOUT_STATUS.GENERATED,
        generatedBy: reviewer,
        generatedAt: now,
        settingsSnapshot: settings,
        totals: summarize(lines),
        lines,
      }).save({ session });

      if (suggestionDocs.length) {
        await SalaryDeduction.insertMany(suggestionDocs, { session });
      }

      for (const [id, status] of decided) {
        await SalaryDeduction.updateOne(
          { _id: id, status: SALARY_DEDUCTION_STATUS.PENDING, payout: null },
          { status, reviewedBy: reviewer, reviewedAt: now },
          { session },
        );
      }

      // Link every manual deduction the payout used. If one was used or
      // changed in the meantime, the counts won't match and nothing is saved.
      const manualIds = lines.flatMap((l) =>
        l.manualDeductions.filter((d) => d.decision === "approved").map((d) => d._id),
      );
      if (manualIds.length) {
        const result = await SalaryDeduction.updateMany(
          {
            _id: { $in: manualIds },
            status: SALARY_DEDUCTION_STATUS.APPROVED,
            payout: null,
          },
          { payout: payoutId },
          { session },
        );
        if (result.modifiedCount !== manualIds.length) {
          throw new AppError(
            "Some deductions changed while you were reviewing. Refresh the preview and try again.",
            409,
            "PAYOUT_DEDUCTIONS_CHANGED",
          );
        }
      }

      return payout;
    });

  // Two payouts generated at the same moment can pick the same number.
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if ((error as { code?: number }).code === 11000 && i < 2) continue;
      throw error;
    }
  }
};

// =========================================================================
// Previous payouts
// =========================================================================

const USER_FIELDS = "name email";

export const listPayouts = async (query: PayoutListQuery) => {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.from) filter.to = { $gte: query.from };
  if (query.to) filter.from = { $lte: query.to };

  const [items, total] = await Promise.all([
    SalaryPayout.find(filter)
      .select("-lines")
      .populate("generatedBy", USER_FIELDS)
      .sort({ generatedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    SalaryPayout.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

const findPayout = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid payout ID", 400, "INVALID_PAYOUT_ID");
  }
  const payout = await SalaryPayout.findById(id);
  if (!payout) throw new AppError("Payout not found", 404, "PAYOUT_NOT_FOUND");
  return payout;
};

export const getPayout = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid payout ID", 400, "INVALID_PAYOUT_ID");
  }
  const payout = await SalaryPayout.findById(id)
    .populate("generatedBy", USER_FIELDS)
    .populate("paidBy", USER_FIELDS)
    .populate("cancelledBy", USER_FIELDS)
    .lean();
  if (!payout) throw new AppError("Payout not found", 404, "PAYOUT_NOT_FOUND");
  return payout;
};

export const markPayoutPaid = async (user: AuthenticatedUser, id: string) => {
  const payout = await findPayout(id);
  if (payout.status !== SALARY_PAYOUT_STATUS.GENERATED) {
    throw new AppError(`A ${payout.status} payout can't be marked paid`, 409, "PAYOUT_NOT_GENERATED");
  }
  payout.status = SALARY_PAYOUT_STATUS.PAID;
  payout.paidAt = new Date();
  payout.paidBy = toObjectId(user.id);
  await payout.save();
  return getPayout(id);
};

export const cancelPayout = async (
  user: AuthenticatedUser,
  id: string,
  reason: string,
) => {
  const payout = await findPayout(id);
  if (payout.status !== SALARY_PAYOUT_STATUS.GENERATED) {
    throw new AppError(
      payout.status === SALARY_PAYOUT_STATUS.PAID
        ? "A paid payout can't be cancelled"
        : "This payout is already cancelled",
      409,
      "PAYOUT_NOT_CANCELLABLE",
    );
  }

  await runTransaction(async (session) => {
    payout.status = SALARY_PAYOUT_STATUS.CANCELLED;
    payout.cancelledAt = new Date();
    payout.cancelledBy = toObjectId(user.id);
    payout.cancelReason = reason;
    await payout.save({ session });

    // System suggestions are recalculated next time; the snapshot keeps them.
    await SalaryDeduction.deleteMany(
      { payout: payout._id, source: { $ne: SALARY_DEDUCTION_SOURCE.MANUAL } },
      { session },
    );
    // Manual deductions go back to the pool for the next payout.
    await SalaryDeduction.updateMany(
      { payout: payout._id, source: SALARY_DEDUCTION_SOURCE.MANUAL },
      { payout: null },
      { session },
    );
  });

  return getPayout(id);
};

export const exportPayout = async (id: string, format: "csv" | "excel") => {
  const payout = await getPayout(id);

  const rows = payout.lines.map((l) => ({
    "Payout No": payout.payoutNo,
    Period: `${payout.from} to ${payout.to}`,
    "Employee Code": l.employeeCode,
    Employee: l.name,
    Email: l.email,
    Branch: (l.branch as { name?: string } | null)?.name ?? "",
    "Working Days": l.days.working ?? 0,
    Present: l.days.present ?? 0,
    Late: l.days.late ?? 0,
    "Half Days": l.days.halfDay ?? 0,
    "Paid Leave": l.days.paidLeave ?? 0,
    "Unpaid Leave": l.days.unpaidLeave ?? 0,
    Absent: l.days.absent ?? 0,
    "LOP Days": l.days.lop ?? 0,
    "Payable Days": l.days.payable ?? 0,
    "Per-day Rate": l.perDayRate,
    ...Object.fromEntries(
      SALARY_EARNING_FIELDS.map((f) => [`Earning: ${f}`, l.earnings[f] ?? 0]),
    ),
    Gross: l.earnings.gross ?? 0,
    ...Object.fromEntries(
      SALARY_DEDUCTION_FIELDS.map((f) => [`Deduction: ${f}`, l.deductions[f] ?? 0]),
    ),
    "Total Deductions": l.deductions.total ?? 0,
    Adjustments: round2(l.adjustments.reduce((s, a) => s + a.amount, 0)),
    "Calculated Net": l.calculatedNet,
    Net: l.net,
    Overrides: l.overrides
      .map((o) => `${o.field}: ${o.calculated} → ${o.value} (${o.reason})`)
      .join("; "),
    Warnings: l.warnings.join("; "),
  }));

  const filename = `${payout.payoutNo}`;
  if (format === "excel") {
    return {
      body: await ReportService.exportToExcel("Payout", rows),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${filename}.xlsx`,
    };
  }
  return {
    body: rows.length ? ReportService.exportToCSV(rows) : "",
    contentType: "text/csv",
    filename: `${filename}.csv`,
  };
};

// =========================================================================
// Deductions
// =========================================================================

const DEDUCTION_POPULATE = [
  { path: "employee", select: USER_FIELDS },
  { path: "raisedBy", select: USER_FIELDS },
  { path: "reviewedBy", select: USER_FIELDS },
  { path: "payout", select: "payoutNo status" },
];

export const listDeductions = async (query: DeductionListQuery) => {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.employeeId) filter.employee = toObjectId(query.employeeId);
  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  const [items, total] = await Promise.all([
    SalaryDeduction.find(filter)
      .populate(DEDUCTION_POPULATE)
      .sort({ date: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    SalaryDeduction.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

export const createDeduction = async (
  user: AuthenticatedUser,
  input: CreateDeductionInput,
) => {
  const employee = await User.findById(input.employeeId).select("role branches").lean();
  if (!employee || employee.role === ROLES.HEAD) {
    throw new AppError("Employee not found", 404, "EMPLOYEE_NOT_FOUND");
  }

  const deduction = await SalaryDeduction.create({
    employee: employee._id,
    branch: employee.branches?.[0],
    date: input.date,
    source: SALARY_DEDUCTION_SOURCE.MANUAL,
    amount: input.amount ?? null,
    days: input.days ?? null,
    reason: input.reason,
    status: SALARY_DEDUCTION_STATUS.PENDING,
    raisedBy: toObjectId(user.id),
  });

  return SalaryDeduction.findById(deduction._id).populate(DEDUCTION_POPULATE).lean();
};

const findOpenDeduction = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid deduction ID", 400, "INVALID_DEDUCTION_ID");
  }
  const deduction = await SalaryDeduction.findById(id);
  if (!deduction) {
    throw new AppError("Deduction not found", 404, "DEDUCTION_NOT_FOUND");
  }
  if (deduction.payout) {
    throw new AppError(
      "This deduction is part of a payout and can't be changed",
      409,
      "DEDUCTION_LOCKED",
    );
  }
  return deduction;
};

export const reviewDeduction = async (
  user: AuthenticatedUser,
  id: string,
  status: "approved" | "rejected",
  remark?: string,
) => {
  const deduction = await findOpenDeduction(id);
  if (deduction.status !== SALARY_DEDUCTION_STATUS.PENDING) {
    throw new AppError("This deduction has already been reviewed", 409, "DEDUCTION_ALREADY_REVIEWED");
  }
  deduction.status = status;
  deduction.reviewedBy = toObjectId(user.id);
  deduction.reviewedAt = new Date();
  deduction.reviewRemark = remark || null;
  await deduction.save();
  return SalaryDeduction.findById(id).populate(DEDUCTION_POPULATE).lean();
};

export const deleteDeduction = async (id: string) => {
  const deduction = await findOpenDeduction(id);
  if (deduction.source !== SALARY_DEDUCTION_SOURCE.MANUAL) {
    throw new AppError("Only manual deductions can be deleted", 409, "DEDUCTION_NOT_MANUAL");
  }
  if (deduction.status === SALARY_DEDUCTION_STATUS.APPROVED) {
    throw new AppError("An approved deduction can't be deleted", 409, "DEDUCTION_APPROVED");
  }
  await deduction.deleteOne();
};

// =========================================================================
// Employee self-service: own payslips
// =========================================================================

/**
 * What an employee may see of their own line. Head's internal notes stay
 * out: edit reasons, calculated-vs-final values, warnings, adjustment notes
 * and waived suggestions.
 */
const toPayslipLine = (line: ComputedLine | Record<string, any>) => ({
  employeeCode: line.employeeCode,
  name: line.name,
  designation: line.designation ?? null,
  branch: line.branch ?? null,
  monthlyGross: line.salarySnapshot?.grossSalary ?? 0,
  perDayRate: line.perDayRate,
  days: line.days,
  lateCount: line.lateCount,
  earnings: line.earnings,
  deductions: line.deductions,
  deductionItems: [
    ...((line.suggestions ?? []) as PayoutSuggestion[])
      .filter((s) => s.decision === "approved")
      .map((s) => ({ date: s.date, description: s.description, amount: s.amount })),
    ...((line.manualDeductions ?? []) as PayoutManualDeduction[])
      .filter((d) => d.decision === "approved")
      .map((d) => ({ date: d.date, description: d.reason, amount: d.computedAmount })),
  ],
  adjustments: ((line.adjustments ?? []) as IPayoutAdjustment[]).map((a) => ({
    label: a.label,
    amount: a.amount,
  })),
  net: line.net,
});

const MY_PAYOUT_FIELDS = "payoutNo from to status generatedAt paidAt";

export const listMyPayouts = async (userId: string, page: number, limit: number) => {
  const me = toObjectId(userId);
  const filter = {
    status: { $ne: SALARY_PAYOUT_STATUS.CANCELLED },
    "lines.employee": me,
  };

  const [items, total] = await Promise.all([
    SalaryPayout.find(filter)
      .select(MY_PAYOUT_FIELDS)
      .select({ lines: { $elemMatch: { employee: me } } })
      .sort({ from: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SalaryPayout.countDocuments(filter),
  ]);

  return {
    items: items.map(({ lines, ...payout }) => {
      const line = lines?.[0];
      return {
        ...payout,
        net: line?.net ?? 0,
        gross: line?.earnings?.gross ?? 0,
        deductions: line?.deductions?.total ?? 0,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getMyPayout = async (userId: string, id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid payout ID", 400, "INVALID_PAYOUT_ID");
  }
  const me = toObjectId(userId);
  const payout = await SalaryPayout.findOne({
    _id: toObjectId(id),
    status: { $ne: SALARY_PAYOUT_STATUS.CANCELLED },
    "lines.employee": me,
  })
    .select(MY_PAYOUT_FIELDS)
    .select({ lines: { $elemMatch: { employee: me } } })
    .lean();

  // Someone else's payout reads as missing, not forbidden.
  const line = payout?.lines?.[0];
  if (!payout || !line) throw new AppError("Payslip not found", 404, "PAYSLIP_NOT_FOUND");

  const { lines: _lines, ...meta } = payout;
  return { ...meta, line: toPayslipLine(line) };
};
