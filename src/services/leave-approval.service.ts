import mongoose from "mongoose";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { LeaveBalance } from "../models/LeaveBalance.js";
import { LEAVE_REQUEST_STATUS } from "../constants/leaveRequest.js";
import {
  debitLeaveBalance,
  releaseLeaveBalance,
} from "./leave-balance.service.js";
import { AppError } from "../utils/AppError.js";

export interface ApproveLeaveRequestInput {
  leaveRequestId: string;
  approverId: string;
}

export const approveLeaveRequest = async ({
  leaveRequestId,
  approverId,
}: ApproveLeaveRequestInput) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const request =
      await LeaveRequest.findById(leaveRequestId).session(session);
    if (!request || request.status !== LEAVE_REQUEST_STATUS.PENDING) {
      throw new AppError(
        "Invalid or non-pending request",
        400,
        "INVALID_STATUS",
      );
    }

    const balance = await LeaveBalance.findOne({
      employee: request.employee,
      policy: request.leavePolicy,
      year: new Date(request.startDate).getFullYear(),
    }).session(session);

    if (!balance) throw new AppError("Balance not found", 404, "NOT_FOUND");

    // Debit reserved balance
    await debitLeaveBalance({
      employeeId: request.employee.toString(),
      leaveBalanceId: balance._id.toString(),
      amount: request.totalDays,
      leaveRequestId: request._id.toString(),
      performedBy: approverId,
      session,
    });

    request.status = LEAVE_REQUEST_STATUS.APPROVED;
    request.approvedBy = new mongoose.Types.ObjectId(approverId);
    request.approvedAt = new Date();

    await request.save({ session });
    await session.commitTransaction();
    return request;
  } catch (err: any) {
    await session.abortTransaction();
    throw err;
  } finally {
    await session.endSession();
  }
};

export interface RejectLeaveRequestInput {
  leaveRequestId: string;
  approverId: string;
  rejectionReason?: string;
}

export const rejectLeaveRequest = async ({
  leaveRequestId,
  approverId,
  rejectionReason,
}: RejectLeaveRequestInput) => {
  const executeReject = async (session?: mongoose.ClientSession) => {
    const request = await LeaveRequest.findById(leaveRequestId).session(
      session ?? null,
    );
    if (!request || request.status !== LEAVE_REQUEST_STATUS.PENDING) {
      throw new AppError(
        "Invalid or non-pending request",
        400,
        "INVALID_STATUS",
      );
    }

    const balance = await LeaveBalance.findOne({
      employee: request.employee,
      policy: request.leavePolicy,
      year: new Date(request.startDate).getFullYear(),
    }).session(session ?? null);

    if (!balance) throw new AppError("Balance not found", 404, "NOT_FOUND");

    // Release reserved balance back
    await releaseLeaveBalance({
      employeeId: request.employee.toString(),
      leaveBalanceId: balance._id.toString(),
      amount: request.totalDays,
      leaveRequestId: request._id.toString(),
      performedBy: approverId,
      session,
    });

    request.status = LEAVE_REQUEST_STATUS.REJECTED;
    request.rejectedBy = new mongoose.Types.ObjectId(approverId);
    request.rejectedAt = new Date();
    if (rejectionReason) request.rejectionReason = rejectionReason;

    await request.save({ session });
    return request;
  };

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await executeReject(session);
    await session.commitTransaction();
    return result;
  } catch (err: any) {
    await session.abortTransaction();

    // Fallback for standalone local MongoDB instances lacking replica set support
    if (err?.code === 20 || err?.message?.includes("replica set")) {
      return await executeReject();
    }

    throw err;
  } finally {
    await session.endSession();
  }
};
