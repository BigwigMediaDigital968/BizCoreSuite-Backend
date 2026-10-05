// import mongoose from "mongoose";
// import {
//   LateCheckInRequest,
//   LATE_CHECKIN_STATUS,
// } from "../models/LateCheckInRequest.js";
// import { User } from "../models/User.js";
// import { ROLES } from "../constants/roles.js";
// import { AppError } from "../utils/AppError.js";
// import {
//   isAfterWorkingHours,
//   getUtcNormalizedDate,
// } from "../utils/workingHours.js";
// import type { AuthenticatedUser } from "../types/auth.js";
// import { Holiday } from "../models/Holiday.js";

// export const submitLateCheckInReason = async (
//   userId: string,
//   reason: string,
// ) => {
//   const user = await User.findById(userId)
//     .select("branches role isActive")
//     .lean();
//   if (!user || !user.isActive) {
//     throw new AppError("Active account required", 403, "INACTIVE_USER");
//   }

//   const primaryBranch = user.branches?.[0];
//   if (!primaryBranch) {
//     throw new AppError("No branch assigned to user", 400, "NO_BRANCH");
//   }

//   const isAfter = await isAfterWorkingHours(primaryBranch.toString());
//   if (!isAfter) {
//     throw new AppError(
//       "Regular check-in allowed; you are within working hours",
//       400,
//       "REGULAR_HOURS",
//     );
//   }

//   const today = getUtcNormalizedDate();

//   const existingRequest = await LateCheckInRequest.findOne({
//     employee: userId,
//     requestDate: today,
//   });

//   if (existingRequest) {
//     if (existingRequest.status === LATE_CHECKIN_STATUS.PENDING) {
//       throw new AppError(
//         "A late check-in request is already pending approval",
//         400,
//         "REQUEST_PENDING",
//       );
//     }
//     if (existingRequest.status === LATE_CHECKIN_STATUS.APPROVED) {
//       throw new AppError(
//         "Late check-in already approved for today",
//         400,
//         "ALREADY_APPROVED",
//       );
//     }
//   }

//   return LateCheckInRequest.create({
//     employee: userId,
//     branch: primaryBranch,
//     requestDate: today,
//     reason,
//     status: LATE_CHECKIN_STATUS.PENDING,
//   });
// };

// export const reviewLateCheckIn = async (
//   reviewer: AuthenticatedUser,
//   requestId: string,
//   status:
//     | typeof LATE_CHECKIN_STATUS.APPROVED
//     | typeof LATE_CHECKIN_STATUS.REJECTED,
//   remarks?: string,
// ) => {
//   if (
//     ![ROLES.HEAD, ROLES.ADMIN, ROLES.MANAGER].includes(reviewer.role as any)
//   ) {
//     throw new AppError("Access denied", 403, "ACCESS_DENIED");
//   }

//   const request = await LateCheckInRequest.findById(requestId);
//   if (!request) {
//     throw new AppError("Late check-in request not found", 404, "NOT_FOUND");
//   }

//   // Branch access check for Manager/Admin
//   if (reviewer.role !== ROLES.HEAD) {
//     const reviewerBranchIds = (reviewer.branches || []).map((b) =>
//       b.toString(),
//     );
//     if (!reviewerBranchIds.includes(request.branch.toString())) {
//       throw new AppError(
//         "Unauthorized for this branch",
//         403,
//         "BRANCH_ACCESS_DENIED",
//       );
//     }
//   }

//   request.status = status;
//   request.reviewedBy = new mongoose.Types.ObjectId(reviewer.id);
//   request.reviewedAt = new Date();
//   if (remarks) request.reviewRemarks = remarks;

//   await request.save();
//   return request;
// };

// export const checkAccessPermission = async (
//   userId: string,
//   userRole: string,
//   branchId?: string,
// ) => {
//   // Head/Admin/Manager can bypass late checks
//   if (userRole !== ROLES.EMPLOYEE) {
//     return { allowed: true };
//   }

//   if (branchId) {
//     // Standardize to start and end of today's date in local time/UTC
//     const startOfDay = new Date();
//     startOfDay.setHours(0, 0, 0, 0);

//     const endOfDay = new Date();
//     endOfDay.setHours(23, 59, 59, 999);

//     // Check if today is registered as an active holiday for the user's branch
//     const holiday = await Holiday.findOne({
//       branch: branchId,
//       isActive: true,
//       date: { $gte: startOfDay, $lte: endOfDay },
//     }).lean();

//     if (holiday) {
//       return {
//         allowed: false,
//         reasonRequired: true,
//         code: "HOLIDAY_LOCKOUT",
//         message: `Branch is closed today due to holiday: ${holiday.name}. Admin approval required for access.`,
//       };
//     }
//   }

//   if (!branchId) return { allowed: true };

//   const isAfter = await isAfterWorkingHours(branchId);
//   if (!isAfter) {
//     return { allowed: true }; // Normal working hours
//   }

//   const today = getUtcNormalizedDate();
//   const request = await LateCheckInRequest.findOne({
//     employee: userId,
//     requestDate: today,
//   });

//   if (!request) {
//     return {
//       allowed: false,
//       reasonRequired: true,
//       message: "Working hours ended. Please submit a reason to log in.",
//     };
//   }

//   if (request.status === LATE_CHECKIN_STATUS.PENDING) {
//     return {
//       allowed: false,
//       reasonRequired: false,
//       message: "Late check-in request is pending Head/Manager approval.",
//     };
//   }

//   if (request.status === LATE_CHECKIN_STATUS.REJECTED) {
//     return {
//       allowed: false,
//       reasonRequired: false,
//       message: "Late check-in request was rejected.",
//     };
//   }

//   return { allowed: true }; // Approved
// };

import mongoose from "mongoose";
import {
  LateCheckInRequest,
  LATE_CHECKIN_STATUS,
} from "../models/LateCheckInRequest.js";
import { User } from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import {
  isAfterWorkingHours,
  getUtcNormalizedDate,
} from "../utils/workingHours.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { Holiday } from "../models/Holiday.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { LEAVE_REQUEST_STATUS } from "../constants/leaveRequest.js";

/**
 * The employee's pending or approved leave request covering today, if any.
 * Bounds are start/end-of-day rather than a normalized instant since
 * LeaveRequest.startDate/endDate are stored as whatever the applicant
 * picked, not necessarily midnight-normalized like LateCheckInRequest.
 */
const getLeaveForToday = async (userId: string) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  return LeaveRequest.findOne({
    employee: userId,
    status: {
      $in: [LEAVE_REQUEST_STATUS.PENDING, LEAVE_REQUEST_STATUS.APPROVED],
    },
    startDate: { $lte: endOfDay },
    endDate: { $gte: startOfDay },
  }).lean();
};

const hasApprovedLeaveToday = async (userId: string) => {
  const leave = await getLeaveForToday(userId);
  return leave?.status === LEAVE_REQUEST_STATUS.APPROVED;
};

export const submitLateCheckInReason = async (
  userId: string,
  reason: string,
) => {
  const user = await User.findById(userId)
    .select("branches role isActive")
    .lean();

  if (!user || !user.isActive) {
    throw new AppError(
      "Active account required to submit check-in requests.",
      403,
      "INACTIVE_USER",
    );
  }

  const primaryBranch = user.branches?.[0];
  if (!primaryBranch) {
    throw new AppError(
      "No primary branch assigned to your account. Please contact support.",
      400,
      "NO_BRANCH_ASSIGNED",
    );
  }

  // Check if today is a Holiday
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const isHoliday = await Holiday.exists({
    branch: primaryBranch,
    isActive: true,
    date: { $gte: startOfDay, $lte: endOfDay },
  });

  const isAfter = await isAfterWorkingHours(primaryBranch.toString());

  const isOnApprovedLeaveToday = await hasApprovedLeaveToday(userId);

  // Prevent request submission if user is attempting during standard work
  // hours with no other reason (holiday, after-hours, or an approved leave
  // covering today) that would actually require an override.
  if (!isHoliday && !isAfter && !isOnApprovedLeaveToday) {
    throw new AppError(
      "You are within normal working hours. Standard check-in is permitted without prior request.",
      400,
      "STANDARD_HOURS_ACTIVE",
    );
  }

  const today = getUtcNormalizedDate();

  const existingRequest = await LateCheckInRequest.findOne({
    employee: userId,
    requestDate: today,
  });

  if (existingRequest) {
    if (existingRequest.status === LATE_CHECKIN_STATUS.PENDING) {
      throw new AppError(
        "A special access request is already pending review for today.",
        400,
        "REQUEST_ALREADY_PENDING",
      );
    }
    if (existingRequest.status === LATE_CHECKIN_STATUS.APPROVED) {
      throw new AppError(
        "Special access has already been granted for today.",
        400,
        "REQUEST_ALREADY_APPROVED",
      );
    }
  }

  return LateCheckInRequest.create({
    employee: userId,
    branch: primaryBranch,
    requestDate: today,
    reason,
    status: LATE_CHECKIN_STATUS.PENDING,
  });
};

export const reviewLateCheckIn = async (
  reviewer: AuthenticatedUser,
  requestId: string,
  status:
    | typeof LATE_CHECKIN_STATUS.APPROVED
    | typeof LATE_CHECKIN_STATUS.REJECTED,
  remarks?: string,
) => {
  if (
    ![ROLES.HEAD, ROLES.ADMIN, ROLES.MANAGER].includes(reviewer.role as any)
  ) {
    throw new AppError(
      "You do not have permission to review check-in requests.",
      403,
      "ACCESS_DENIED",
    );
  }

  const request = await LateCheckInRequest.findById(requestId);
  if (!request) {
    throw new AppError(
      "The requested check-in record was not found.",
      404,
      "REQUEST_NOT_FOUND",
    );
  }

  if (reviewer.role !== ROLES.HEAD) {
    const reviewerBranchIds = (reviewer.branches || []).map((b) =>
      b.toString(),
    );
    if (!reviewerBranchIds.includes(request.branch.toString())) {
      throw new AppError(
        "You do not have authorization to review requests for this branch.",
        403,
        "BRANCH_ACCESS_DENIED",
      );
    }
  }

  request.status = status;
  request.reviewedBy = new mongoose.Types.ObjectId(reviewer.id);
  request.reviewedAt = new Date();
  if (remarks) request.reviewRemarks = remarks;

  await request.save();
  return request;
};

export const checkAccessPermission = async (
  userId: string,
  userRole: string,
  branchId?: string,
) => {
  // Non-employee roles bypass all time/holiday restrictions
  if (userRole !== ROLES.EMPLOYEE) {
    return { allowed: true };
  }

  if (!branchId) return { allowed: true };

  const today = getUtcNormalizedDate();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 0. Check Leave Lockout — takes priority over holiday/after-hours since
  // it's specific to this employee rather than the whole branch.
  const leave = await getLeaveForToday(userId);

  if (leave) {
    // A pending leave request has nothing to override — login stays
    // blocked until the leave itself is approved or rejected, same as
    // waiting on a pending holiday/after-hours request below.
    if (leave.status === LEAVE_REQUEST_STATUS.PENDING) {
      return {
        allowed: false,
        reasonRequired: false,
        code: "LEAVE_REQUEST_PENDING",
        message:
          "Your leave request for today is pending approval. Login is blocked until it is decided.",
      };
    }

    // Approved leave can still be overridden with Head/Manager approval,
    // via the same LateCheckInRequest flow used for holiday/after-hours.
    const overrideRequest = await LateCheckInRequest.findOne({
      employee: userId,
      requestDate: today,
    });

    if (!overrideRequest) {
      return {
        allowed: false,
        reasonRequired: true,
        code: "LEAVE_DAY_LOCKOUT",
        message:
          "You are on approved leave today. Submit a reason to request login access.",
      };
    }

    if (overrideRequest.status === LATE_CHECKIN_STATUS.PENDING) {
      return {
        allowed: false,
        reasonRequired: false,
        code: "LEAVE_OVERRIDE_APPROVAL_PENDING",
        message:
          "Your request to log in during your approved leave is pending manager approval.",
      };
    }

    if (overrideRequest.status === LATE_CHECKIN_STATUS.REJECTED) {
      return {
        allowed: false,
        reasonRequired: false,
        code: "LEAVE_OVERRIDE_ACCESS_DENIED",
        message:
          "Your request to log in during your approved leave was rejected.",
      };
    }

    // Approved override — fall through to the holiday/after-hours checks
    // below, same as any other day.
  }

  // 1. Check Holiday Lockout
  const holiday = await Holiday.findOne({
    branch: branchId,
    isActive: true,
    date: { $gte: startOfDay, $lte: endOfDay },
  }).lean();

  if (holiday) {
    const request = await LateCheckInRequest.findOne({
      employee: userId,
      requestDate: today,
    });

    if (!request) {
      return {
        allowed: false,
        reasonRequired: true,
        code: "HOLIDAY_LOCKOUT",
        message: `Branch is closed today for "${holiday.name}". Access requires admin approval.`,
      };
    }

    if (request.status === LATE_CHECKIN_STATUS.PENDING) {
      return {
        allowed: false,
        reasonRequired: false,
        code: "HOLIDAY_APPROVAL_PENDING",
        message: `Holiday access request for "${holiday.name}" is pending approval.`,
      };
    }

    if (request.status === LATE_CHECKIN_STATUS.REJECTED) {
      return {
        allowed: false,
        reasonRequired: false,
        code: "HOLIDAY_ACCESS_DENIED",
        message: `Holiday access request for "${holiday.name}" was rejected.`,
      };
    }

    return { allowed: true }; // Approved for Holiday Access
  }

  // 2. Check After-Hours Lockout
  const isAfter = await isAfterWorkingHours(branchId);
  if (!isAfter) {
    return { allowed: true }; // Normal working hours
  }

  const request = await LateCheckInRequest.findOne({
    employee: userId,
    requestDate: today,
  });

  if (!request) {
    return {
      allowed: false,
      reasonRequired: true,
      code: "AFTER_HOURS_LOCKOUT",
      message:
        "Regular working hours have ended. Please provide a reason to request login access.",
    };
  }

  if (request.status === LATE_CHECKIN_STATUS.PENDING) {
    return {
      allowed: false,
      reasonRequired: false,
      code: "AFTER_HOURS_APPROVAL_PENDING",
      message:
        "Your late check-in request is currently pending manager approval.",
    };
  }

  if (request.status === LATE_CHECKIN_STATUS.REJECTED) {
    return {
      allowed: false,
      reasonRequired: false,
      code: "AFTER_HOURS_ACCESS_DENIED",
      message: "Your late check-in request was rejected.",
    };
  }

  return { allowed: true }; // Approved for After-Hours Access
};
