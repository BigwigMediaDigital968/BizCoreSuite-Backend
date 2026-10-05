import type { NextFunction, Request, Response } from "express";

import {
  attendanceCheckInSchema,
  attendanceCheckOutSchema,
  attendanceReportSchema,
} from "../validators/attendance.validator.js";

import {
  checkInEmployee,
  checkOutEmployee,
} from "../services/attendance.service.js";

import { attendanceQuerySchema } from "../validators/attendance.validator.js";

import { getAttendanceRecords } from "../services/attendance-query.service.js";
import { getTeamAttendanceSummary } from "../services/attendance-report.service.js";

// export const checkInController = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   try {
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: "Authentication required",
//         code: "AUTHENTICATION_REQUIRED",
//       });
//     }

//     const data = attendanceCheckInSchema.parse(req.body ?? {});

//     const attendance = await checkInEmployee({
//       employeeId: req.user.id,
//       latitude: data.latitude,
//       longitude: data.longitude,
//     });

//     return res.status(201).json({
//       success: true,
//       message: "Attendance checked in successfully",
//       data: {
//         attendance,
//       },
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const checkInController = async (
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

    // Parses and validates workMode + optional coordinates
    const data = attendanceCheckInSchema.parse(req.body ?? {});

    const attendance = await checkInEmployee({
      employeeId: req.user.id,
      workMode: data.workMode,
      latitude: data.latitude,
      longitude: data.longitude,
    });

    return res.status(201).json({
      success: true,
      message: "Attendance checked in successfully",
      data: {
        attendance,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const checkOutController = async (
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

    const data = attendanceCheckOutSchema.parse(req.body ?? {});

    const attendance = await checkOutEmployee({
      employeeId: req.user.id,
      latitude: data.latitude,
      longitude: data.longitude,
    });

    return res.status(200).json({
      success: true,
      message: "Attendance checked out successfully",
      data: {
        attendance,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceController = async (
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

    const filters = attendanceQuerySchema.parse(req.query);

    const result = await getAttendanceRecords({
      userId: req.user.id,
      role: req.user.role,
      filters,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAttendanceReportController = async (
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

    const filters = attendanceReportSchema.parse(req.query);

    const data = await getTeamAttendanceSummary({
      userId: req.user.id,
      role: req.user.role,
      branchId: filters.branchId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};
