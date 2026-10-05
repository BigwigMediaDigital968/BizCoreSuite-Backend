import mongoose from "mongoose";

import { Attendance } from "../models/Attendance.js";

import { buildAttendanceScope } from "./attendance-query.service.js";

import type { Role } from "../constants/roles.js";

export const getEmployeeAttendanceSummary = async ({
  userId,
  role,
  employeeId,
  dateFrom,
  dateTo,
}: {
  userId: string;
  role: Role;
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
}) => {
  const targetEmployeeId = role === "employee" ? userId : employeeId;

  const records = await Attendance.find({
    employee: new mongoose.Types.ObjectId(targetEmployeeId),

    date: {
      $gte: dateFrom,
      $lte: dateTo,
    },
  }).lean();

  const summary = {
    totalDays: records.length,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    leaveDays: 0,
    wfoDays: 0,
    wfhDays: 0,
    totalWorkingMinutes: 0,
  };

  for (const record of records) {
    if (record.status === "present") {
      summary.presentDays++;
    }

    if (record.status === "late") {
      summary.presentDays++;
      summary.lateDays++;
    }

    if (record.status === "absent") {
      summary.absentDays++;
    }

    if (record.status === "on_leave") {
      summary.leaveDays++;
    }

    if (record.workMode === "WFO") {
      summary.wfoDays++;
    }

    if (record.workMode === "WFH") {
      summary.wfhDays++;
    }

    if (record.totalWorkingMinutes) {
      summary.totalWorkingMinutes += record.totalWorkingMinutes;
    }
  }

  const attendancePercentage =
    summary.totalDays > 0
      ? Number(((summary.presentDays / summary.totalDays) * 100).toFixed(2))
      : 0;

  return {
    ...summary,
    attendancePercentage,
  };
};

export const getTeamAttendanceSummary = async ({
  userId,
  role,
  branchId,
  dateFrom,
  dateTo,
}: {
  userId: string;
  role: Role;
  branchId?: string;
  dateFrom: string;
  dateTo: string;
}) => {
  const scope = await buildAttendanceScope({
    userId,
    role,
    branchId,
  });

  const match: Record<string, unknown> = {
    date: {
      $gte: dateFrom,
      $lte: dateTo,
    },
  };

  if (scope.branchIds) {
    match.branch = {
      $in: scope.branchIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  if (scope.employeeId) {
    match.employee = new mongoose.Types.ObjectId(scope.employeeId);
  }

  const summary = await Attendance.aggregate([
    {
      $match: match,
    },

    {
      $group: {
        _id: "$employee",

        totalDays: {
          $sum: 1,
        },

        presentDays: {
          $sum: {
            $cond: [
              {
                $in: ["$status", ["present", "late"]],
              },
              1,
              0,
            ],
          },
        },

        lateDays: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", "late"],
              },
              1,
              0,
            ],
          },
        },

        absentDays: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", "absent"],
              },
              1,
              0,
            ],
          },
        },

        leaveDays: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", "leave"],
              },
              1,
              0,
            ],
          },
        },

        totalWorkingMinutes: {
          $sum: {
            $ifNull: ["$totalWorkingMinutes", 0],
          },
        },
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "employee",
      },
    },

    {
      $unwind: {
        path: "$employee",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $project: {
        _id: 0,

        employeeId: "$_id",

        name: "$employee.name",

        email: "$employee.email",

        totalDays: 1,

        presentDays: 1,

        lateDays: 1,

        absentDays: 1,

        leaveDays: 1,

        totalWorkingMinutes: 1,

        attendancePercentage: {
          $cond: [
            {
              $gt: ["$totalDays", 0],
            },

            {
              $multiply: [
                {
                  $divide: ["$presentDays", "$totalDays"],
                },
                100,
              ],
            },

            0,
          ],
        },
      },
    },

    {
      $sort: {
        attendancePercentage: -1,
      },
    },
  ]);

  return summary;
};
