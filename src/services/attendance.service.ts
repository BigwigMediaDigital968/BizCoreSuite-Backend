import mongoose from "mongoose";

import { Attendance } from "../models/Attendance.js";
import { User } from "../models/User.js";
import { Branch } from "../models/Branch.js";

import {
  ATTENDANCE_STATUS,
  ATTENDANCE_WORK_MODE,
} from "../constants/attendance.js";

import { calculateDistanceMeters } from "../utils/geo.js";
import { AppError } from "../utils/AppError.js";

import type {
  AttendanceCheckInInput,
  AttendanceCheckOutInput,
} from "../validators/attendance.validator.js";

import { calculateLateMinutes } from "../utils/attendanceTime.js";
import { calculateCheckoutDetails } from "../utils/attendanceTime.js";
import { Holiday } from "../models/Holiday.js";
import {
  getDateInTimezone,
  getDayOfWeekInTimezone,
} from "../utils/timezone.js";

export const getEmployeeBranch = async (employeeId: string) => {
  const user = await User.findById(employeeId)
    .select("_id name email role branches isActive")
    .lean();

  if (!user) {
    throw new AppError("Employee account not found", 404, "EMPLOYEE_NOT_FOUND");
  }

  if (!user.isActive) {
    throw new AppError(
      "Employee account is inactive",
      403,
      "EMPLOYEE_INACTIVE",
    );
  }

  const primaryBranchId = user.branches?.[0];

  if (!user.branches?.length || !primaryBranchId) {
    throw new AppError(
      "Employee is not assigned to a branch",
      400,
      "EMPLOYEE_BRANCH_NOT_ASSIGNED",
    );
  }

  /*
   * Employee attendance currently operates
   * against the employee's first assigned branch.
   */
  const branchId = primaryBranchId.toString();

  const branch = await Branch.findById(branchId).lean();

  if (!branch) {
    throw new AppError("Employee branch not found", 404, "BRANCH_NOT_FOUND");
  }

  if (!branch.isActive) {
    throw new AppError("Employee branch is inactive", 403, "BRANCH_INACTIVE");
  }

  return {
    user,
    branch,
  };
};

const validateAttendanceConfiguration = (branch: any) => {
  const config = branch?.attendanceConfig;

  if (!config?.enabled) {
    throw new AppError(
      "Attendance is disabled for this branch",
      403,
      "ATTENDANCE_DISABLED",
    );
  }

  if (
    !config.location ||
    typeof config.location.latitude !== "number" ||
    typeof config.location.longitude !== "number" ||
    typeof config.location.radiusMeters !== "number"
  ) {
    throw new AppError(
      "Branch attendance location is not configured",
      500,
      "ATTENDANCE_LOCATION_NOT_CONFIGURED",
    );
  }

  return config;
};

const validateWorkingDay = (timezone: string, workingDays: number[]) => {
  const currentDay = getDayOfWeekInTimezone(timezone);

  if (!workingDays.includes(currentDay)) {
    throw new AppError("Today is not a working day", 400, "NON_WORKING_DAY");
  }
};

const validateOfficeLocation = (
  latitude: number,
  longitude: number,
  branchLatitude: number,
  branchLongitude: number,
  radiusMeters: number,
) => {
  const distance = calculateDistanceMeters(
    latitude,
    longitude,
    branchLatitude,
    branchLongitude,
  );

  if (distance > radiusMeters) {
    throw new AppError(
      `You are outside the office attendance area. Distance: ${Math.round(
        distance,
      )} meters.`,
      403,
      "OUTSIDE_ATTENDANCE_RADIUS",
    );
  }

  return distance;
};

export const findHolidayForBranch = async (
  branchId: mongoose.Types.ObjectId | string,
  formattedDateStr: string, // Expected format: "YYYY-MM-DD"
) => {
  // Convert "YYYY-MM-DD" string bounds to Date objects for querying
  const startOfDay = new Date(`${formattedDateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${formattedDateStr}T23:59:59.999Z`);

  return Holiday.findOne({
    branch: branchId,
    isActive: true,
    date: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  }).lean();
};

// export const checkInEmployee = async ({
//   employeeId,
//   latitude,
//   longitude,
// }: {
//   employeeId: string;
// } & AttendanceCheckInInput) => {
//   if (!mongoose.Types.ObjectId.isValid(employeeId)) {
//     throw new AppError("Invalid employee ID", 400, "INVALID_EMPLOYEE_ID");
//   }

//   const { branch } = await getEmployeeBranch(employeeId);
//   const config = validateAttendanceConfiguration(branch);
//   const now = new Date();

//   const attendanceDate = getDateInTimezone(config.timezone, now);

//   validateWorkingDay(config.timezone, config.workingDays);

//   // 2. Validate holiday
//   const holiday = await findHolidayForBranch(branch._id, attendanceDate);
//   if (holiday) {
//     throw new AppError(
//       `Today is a holiday (${holiday.name}). Attendance cannot be marked.`,
//       400,
//       "HOLIDAY",
//     );
//   }

//   const existingAttendance = await Attendance.findOne({
//     employee: employeeId,
//     date: attendanceDate,
//   });

//   if (existingAttendance) {
//     throw new AppError(
//       "Attendance has already been marked for today",
//       409,
//       "ATTENDANCE_ALREADY_EXISTS",
//     );
//   }

//   const distance = validateOfficeLocation(
//     latitude,
//     longitude,
//     config.location.latitude,
//     config.location.longitude,
//     config.location.radiusMeters,
//   );

//   const lateDetails = calculateLateMinutes({
//     checkInTime: now,
//     officeStartTime: config.workingHours.startTime,
//     gracePeriodMinutes: config.gracePeriodMinutes,
//     timezone: config.timezone,
//   });

//   const attendance = await Attendance.create({
//     employee: new mongoose.Types.ObjectId(employeeId),

//     branch: branch._id,

//     date: attendanceDate,

//     status: lateDetails.isLate
//       ? ATTENDANCE_STATUS.LATE
//       : ATTENDANCE_STATUS.PRESENT,

//     workMode: ATTENDANCE_WORK_MODE.WFO,

//     checkInAt: now,

//     checkInLatitude: latitude,

//     checkInLongitude: longitude,

//     checkInDistanceMeters: Math.round(distance),

//     lateMinutes: lateDetails.lateMinutes,
//   });

//   return attendance;
// };

export const checkInEmployee = async ({
  employeeId,
  workMode,
  latitude,
  longitude,
}: {
  employeeId: string;
} & AttendanceCheckInInput) => {
  if (!mongoose.Types.ObjectId.isValid(employeeId)) {
    throw new AppError("Invalid employee ID", 400, "INVALID_EMPLOYEE_ID");
  }

  const { branch } = await getEmployeeBranch(employeeId);
  const config = validateAttendanceConfiguration(branch);
  const now = new Date();

  const attendanceDate = getDateInTimezone(config.timezone, now);

  validateWorkingDay(config.timezone, config.workingDays);

  const holiday = await findHolidayForBranch(branch._id, attendanceDate);
  if (holiday) {
    throw new AppError(
      `Today is a holiday (${holiday.name}). Attendance cannot be marked.`,
      400,
      "HOLIDAY",
    );
  }

  const existingAttendance = await Attendance.findOne({
    employee: employeeId,
    date: attendanceDate,
  });

  if (existingAttendance) {
    throw new AppError(
      "Attendance has already been marked for today",
      409,
      "ATTENDANCE_ALREADY_EXISTS",
    );
  }

  let distance: number | undefined;

  // Validate geofence ONLY if workMode is WFO
  if (workMode === ATTENDANCE_WORK_MODE.WFO) {
    if (latitude === undefined || longitude === undefined) {
      throw new AppError(
        "Location coordinates are required for WFO check-in",
        400,
        "LOCATION_REQUIRED",
      );
    }

    distance = validateOfficeLocation(
      latitude,
      longitude,
      config.location.latitude,
      config.location.longitude,
      config.location.radiusMeters,
    );
  }

  const lateDetails = calculateLateMinutes({
    checkInTime: now,
    officeStartTime: config.workingHours.startTime,
    gracePeriodMinutes: config.gracePeriodMinutes,
    timezone: config.timezone,
  });

  const attendance = await Attendance.create({
    employee: new mongoose.Types.ObjectId(employeeId),
    branch: branch._id,
    date: attendanceDate,
    status: lateDetails.isLate
      ? ATTENDANCE_STATUS.LATE
      : ATTENDANCE_STATUS.PRESENT,
    workMode, // Save dynamically selected work mode (WFO or WFH)
    checkInAt: now,
    checkInLatitude: latitude,
    checkInLongitude: longitude,
    checkInDistanceMeters:
      distance !== undefined ? Math.round(distance) : undefined,
    lateMinutes: lateDetails.lateMinutes,
  });

  return attendance;
};

// export const checkOutEmployee = async ({
//   employeeId,
//   latitude,
//   longitude,
// }: {
//   employeeId: string;
// } & AttendanceCheckOutInput) => {
//   if (!mongoose.Types.ObjectId.isValid(employeeId)) {
//     throw new AppError("Invalid employee ID", 400, "INVALID_EMPLOYEE_ID");
//   }

//   const { branch } = await getEmployeeBranch(employeeId);
//   const config = validateAttendanceConfiguration(branch);
//   const now = new Date();

//   const attendanceDate = getDateInTimezone(config.timezone, now);

//   const attendance = await Attendance.findOne({
//     employee: employeeId,
//     date: attendanceDate,
//   });

//   if (!attendance) {
//     throw new AppError(
//       "You have not checked in today",
//       400,
//       "ATTENDANCE_NOT_FOUND",
//     );
//   }

//   if (!attendance.checkInAt) {
//     throw new AppError(
//       "Check-in record is incomplete",
//       400,
//       "CHECK_IN_NOT_FOUND",
//     );
//   }

//   if (attendance.checkOutAt) {
//     throw new AppError(
//       "You have already checked out today",
//       409,
//       "ALREADY_CHECKED_OUT",
//     );
//   }

//   const distance = validateOfficeLocation(
//     latitude,
//     longitude,
//     config.location.latitude,
//     config.location.longitude,
//     config.location.radiusMeters,
//   );

//   const checkoutDetails = calculateCheckoutDetails({
//     checkInAt: attendance.checkInAt,
//     checkOutAt: now,
//     officeEndTime: config.workingHours.endTime,
//     timezone: config.timezone,
//   });

//   attendance.checkOutAt = now;

//   attendance.checkOutLatitude = latitude;

//   attendance.checkOutLongitude = longitude;

//   attendance.checkOutDistanceMeters = Math.round(distance);

//   attendance.totalWorkingMinutes = checkoutDetails.totalWorkingMinutes;

//   attendance.earlyCheckoutMinutes = checkoutDetails.earlyCheckoutMinutes;
//   await attendance.save();

//   return attendance;
// };

export const checkOutEmployee = async ({
  employeeId,
  latitude,
  longitude,
}: {
  employeeId: string;
} & AttendanceCheckOutInput) => {
  if (!mongoose.Types.ObjectId.isValid(employeeId)) {
    throw new AppError("Invalid employee ID", 400, "INVALID_EMPLOYEE_ID");
  }

  const { branch } = await getEmployeeBranch(employeeId);
  const config = validateAttendanceConfiguration(branch);
  const now = new Date();

  const attendanceDate = getDateInTimezone(config.timezone, now);

  const attendance = await Attendance.findOne({
    employee: employeeId,
    date: attendanceDate,
  });

  if (!attendance) {
    throw new AppError(
      "You have not checked in today",
      400,
      "ATTENDANCE_NOT_FOUND",
    );
  }

  if (!attendance.checkInAt) {
    throw new AppError(
      "Check-in record is incomplete",
      400,
      "CHECK_IN_NOT_FOUND",
    );
  }

  if (attendance.checkOutAt) {
    throw new AppError(
      "You have already checked out today",
      409,
      "ALREADY_CHECKED_OUT",
    );
  }

  let distance: number | undefined;

  // Only validate location if the employee checked in under WFO
  if (attendance.workMode === ATTENDANCE_WORK_MODE.WFO) {
    if (latitude === undefined || longitude === undefined) {
      throw new AppError(
        "Location coordinates are required for WFO check-out",
        400,
        "LOCATION_REQUIRED",
      );
    }

    distance = validateOfficeLocation(
      latitude,
      longitude,
      config.location.latitude,
      config.location.longitude,
      config.location.radiusMeters,
    );

    attendance.checkOutLatitude = latitude;
    attendance.checkOutLongitude = longitude;
    attendance.checkOutDistanceMeters = Math.round(distance);
  }

  const checkoutDetails = calculateCheckoutDetails({
    checkInAt: attendance.checkInAt,
    checkOutAt: now,
    officeEndTime: config.workingHours.endTime,
    timezone: config.timezone,
  });

  attendance.checkOutAt = now;
  attendance.totalWorkingMinutes = checkoutDetails.totalWorkingMinutes;
  attendance.earlyCheckoutMinutes = checkoutDetails.earlyCheckoutMinutes;

  await attendance.save();

  return attendance;
};
