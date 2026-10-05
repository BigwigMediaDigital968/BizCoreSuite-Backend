import mongoose from "mongoose";

import { LeaveBalance } from "../models/LeaveBalance.js";

import { LeaveBalanceTransaction } from "../models/LeaveBalanceTransaction.js";

import {
  LEAVE_BALANCE_TRANSACTION_TYPE,
  LEAVE_BALANCE_TRANSACTION_SOURCE,
} from "../constants/leaveBalance.js";

export const getEmployeeLeaveBalances = async ({
  employeeId,
  year,
}: {
  employeeId: string;
  year: number;
}) => {
  return LeaveBalance.find({
    employee: new mongoose.Types.ObjectId(employeeId),
    year,
  })
    .populate("policy")
    .sort({
      leaveType: 1,
    });
};

export const reserveLeaveBalance = async ({
  employeeId,
  leaveBalanceId,
  amount,
  leaveRequestId,
  session,
}: {
  employeeId: string;
  leaveBalanceId: string;
  amount: number;
  leaveRequestId: string;
  session?: mongoose.ClientSession;
}) => {
  const balance = await LeaveBalance.findOne({
    _id: leaveBalanceId,
    employee: new mongoose.Types.ObjectId(employeeId),
  }).session(session ?? null);

  if (!balance) {
    throw new Error("Leave balance not found");
  }

  if (balance.available < amount) {
    throw new Error("Insufficient leave balance");
  }

  const before = balance.available;

  balance.pending += amount;

  balance.available -= amount;

  await balance.save({
    session,
  });

  await LeaveBalanceTransaction.create(
    [
      {
        employee: balance.employee,

        leaveBalance: balance._id,

        leaveRequest: new mongoose.Types.ObjectId(leaveRequestId),

        leaveType: balance.leaveType,

        transactionType: LEAVE_BALANCE_TRANSACTION_TYPE.RESERVE,

        source: LEAVE_BALANCE_TRANSACTION_SOURCE.LEAVE_APPLICATION,

        amount,

        balanceBefore: before,

        balanceAfter: balance.available,

        remarks: "Leave balance reserved",
      },
    ],
    {
      session,
    },
  );

  return balance;
};

const getAvailableBalance = (balance: {
  allocated: number;
  carriedForward: number;
  adjusted: number;
  used: number;
  pending: number;
}) => {
  return Math.max(
    0,
    balance.allocated +
      balance.carriedForward +
      balance.adjusted -
      balance.used -
      balance.pending,
  );
};

export const releaseLeaveBalance = async ({
  employeeId,
  leaveBalanceId,
  amount,
  leaveRequestId,
  performedBy,
  session,
}: {
  employeeId: string;
  leaveBalanceId: string;
  amount: number;
  leaveRequestId: string;
  performedBy: string;
  session?: mongoose.ClientSession;
}) => {
  const balance = await LeaveBalance.findOne({
    _id: leaveBalanceId,
    employee: new mongoose.Types.ObjectId(employeeId),
  }).session(session ?? null);

  if (!balance) {
    throw new Error("Leave balance not found");
  }

  if (balance.pending < amount) {
    throw new Error("Pending leave balance is insufficient");
  }

  const before = balance.available;

  balance.pending -= amount;

  balance.available = getAvailableBalance(balance);

  await balance.save({
    session,
  });

  await LeaveBalanceTransaction.create(
    [
      {
        employee: balance.employee,

        leaveBalance: balance._id,

        leaveRequest: new mongoose.Types.ObjectId(leaveRequestId),

        leaveType: balance.leaveType,

        transactionType: LEAVE_BALANCE_TRANSACTION_TYPE.RELEASE,

        source: LEAVE_BALANCE_TRANSACTION_SOURCE.LEAVE_REJECTION,

        amount,

        balanceBefore: before,

        balanceAfter: balance.available,

        performedBy: new mongoose.Types.ObjectId(performedBy),

        remarks: "Reserved leave balance released",
      },
    ],
    {
      session,
    },
  );

  return balance;
};

export const debitLeaveBalance = async ({
  employeeId,
  leaveBalanceId,
  amount,
  leaveRequestId,
  performedBy,
  session,
}: {
  employeeId: string;
  leaveBalanceId: string;
  amount: number;
  leaveRequestId: string;
  performedBy: string;
  session?: mongoose.ClientSession;
}) => {
  const balance = await LeaveBalance.findOne({
    _id: leaveBalanceId,
    employee: new mongoose.Types.ObjectId(employeeId),
  }).session(session ?? null);

  if (!balance) {
    throw new Error("Leave balance not found");
  }

  if (balance.pending < amount) {
    throw new Error("Pending leave balance is insufficient");
  }

  const before = balance.available;

  balance.pending -= amount;

  balance.used += amount;

  balance.available = getAvailableBalance(balance);

  await balance.save({
    session,
  });

  await LeaveBalanceTransaction.create(
    [
      {
        employee: balance.employee,

        leaveBalance: balance._id,

        leaveRequest: new mongoose.Types.ObjectId(leaveRequestId),

        leaveType: balance.leaveType,

        transactionType: LEAVE_BALANCE_TRANSACTION_TYPE.DEBIT,

        source: LEAVE_BALANCE_TRANSACTION_SOURCE.LEAVE_APPROVAL,

        amount,

        balanceBefore: before,

        balanceAfter: balance.available,

        performedBy: new mongoose.Types.ObjectId(performedBy),

        remarks: "Leave balance deducted after approval",
      },
    ],
    {
      session,
    },
  );

  return balance;
};

export const restoreLeaveBalance = async ({
  employeeId,
  leaveBalanceId,
  amount,
  leaveRequestId,
  performedBy,
  session,
}: {
  employeeId: string;
  leaveBalanceId: string;
  amount: number;
  leaveRequestId: string;
  performedBy: string;
  session?: mongoose.ClientSession;
}) => {
  const balance = await LeaveBalance.findOne({
    _id: leaveBalanceId,
    employee: new mongoose.Types.ObjectId(employeeId),
  }).session(session ?? null);

  if (!balance) {
    throw new Error("Leave balance not found");
  }

  if (balance.used < amount) {
    throw new Error("Used leave balance is insufficient");
  }

  const before = balance.available;

  balance.used -= amount;

  balance.available = getAvailableBalance(balance);

  await balance.save({
    session,
  });

  await LeaveBalanceTransaction.create(
    [
      {
        employee: balance.employee,

        leaveBalance: balance._id,

        leaveRequest: new mongoose.Types.ObjectId(leaveRequestId),

        leaveType: balance.leaveType,

        transactionType: LEAVE_BALANCE_TRANSACTION_TYPE.RESTORE,

        source: LEAVE_BALANCE_TRANSACTION_SOURCE.LEAVE_CANCELLATION,

        amount,

        balanceBefore: before,

        balanceAfter: balance.available,

        performedBy: new mongoose.Types.ObjectId(performedBy),

        remarks: "Approved leave balance restored after cancellation",
      },
    ],
    {
      session,
    },
  );

  return balance;
};

export const adjustLeaveBalance = async ({
  employeeId,
  leaveBalanceId,
  amount,
  performedBy,
  remarks,
  session,
}: {
  employeeId?: string;
  leaveBalanceId: string;
  amount: number;
  performedBy: string;
  remarks: string;
  session?: mongoose.ClientSession;
}) => {
  if (!mongoose.isValidObjectId(leaveBalanceId)) {
    throw new Error("Invalid leave balance ID");
  }

  if (!mongoose.isValidObjectId(performedBy)) {
    throw new Error("Invalid performedBy ID");
  }

  if (employeeId && !mongoose.isValidObjectId(employeeId)) {
    throw new Error("Invalid employee ID");
  }

  if (amount === 0) {
    throw new Error("Adjustment amount cannot be zero");
  }

  const query: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(leaveBalanceId),
  };

  if (employeeId) {
    query.employee = new mongoose.Types.ObjectId(employeeId);
  }

  const balance = await LeaveBalance.findOne(query).session(session ?? null);

  if (!balance) {
    // Debugging information
    const balanceById = await LeaveBalance.findById(leaveBalanceId)
      .select(
        "_id employee leaveType year allocated used pending available adjusted",
      )
      .lean();

    if (!balanceById) {
      throw new Error(`Leave balance not found for ID: ${leaveBalanceId}`);
    }

    if (employeeId && balanceById.employee.toString() !== employeeId) {
      throw new Error(
        `Leave balance belongs to employee ${balanceById.employee.toString()}, not ${employeeId}`,
      );
    }

    throw new Error("Leave balance not found");
  }

  const before = balance.available;

  balance.adjusted += amount;

  balance.available = getAvailableBalance(balance);

  if (balance.available < 0) {
    throw new Error("Adjustment would result in negative leave balance");
  }

  await balance.save({
    session,
  });

  await LeaveBalanceTransaction.create(
    [
      {
        employee: balance.employee,
        leaveBalance: balance._id,
        leaveType: balance.leaveType,

        transactionType: LEAVE_BALANCE_TRANSACTION_TYPE.ADJUSTMENT,

        source: LEAVE_BALANCE_TRANSACTION_SOURCE.ADMIN_ADJUSTMENT,

        amount: Math.abs(amount),

        balanceBefore: before,
        balanceAfter: balance.available,

        performedBy: new mongoose.Types.ObjectId(performedBy),

        remarks,
      },
    ],
    {
      session,
    },
  );

  return balance;
};

export const getLeaveBalanceTransactions = async ({
  employeeId,
  leaveBalanceId,
}: {
  employeeId: string;
  leaveBalanceId?: string;
}) => {
  const query: Record<string, unknown> = {
    employee: new mongoose.Types.ObjectId(employeeId),
  };

  if (leaveBalanceId) {
    query.leaveBalance = new mongoose.Types.ObjectId(leaveBalanceId);
  }

  return LeaveBalanceTransaction.find(query)
    .populate("leaveRequest")
    .populate("performedBy", "name email")
    .sort({
      createdAt: -1,
    });
};
