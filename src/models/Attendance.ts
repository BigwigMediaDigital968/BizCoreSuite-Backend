import mongoose, { Document, Schema } from "mongoose";

import {
  ATTENDANCE_STATUS,
  type AttendanceStatus,
  ATTENDANCE_WORK_MODE,
  type AttendanceWorkMode,
} from "../constants/attendance.js";

export interface IAttendance extends Document {
  employee: mongoose.Types.ObjectId;

  branch: mongoose.Types.ObjectId;

  date: string;

  status: AttendanceStatus;

  workMode: AttendanceWorkMode;

  checkInAt?: Date;

  checkOutAt?: Date;

  checkInLatitude?: number;

  checkInLongitude?: number;

  checkOutLatitude?: number;

  checkOutLongitude?: number;

  checkInDistanceMeters?: number;

  checkOutDistanceMeters?: number;

  lateMinutes: number;

  earlyCheckoutMinutes: number;

  totalWorkingMinutes?: number;

  remarks?: string;

  createdAt: Date;

  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendance>(
  {
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    date: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
      default: ATTENDANCE_STATUS.PRESENT,
      index: true,
    },

    workMode: {
      type: String,
      enum: Object.values(ATTENDANCE_WORK_MODE),
      required: true,
      index: true,
    },

    checkInAt: {
      type: Date,
    },

    checkOutAt: {
      type: Date,
    },

    checkInLatitude: {
      type: Number,
      min: -90,
      max: 90,
    },

    checkInLongitude: {
      type: Number,
      min: -180,
      max: 180,
    },

    checkOutLatitude: {
      type: Number,
      min: -90,
      max: 90,
    },

    checkOutLongitude: {
      type: Number,
      min: -180,
      max: 180,
    },

    checkInDistanceMeters: {
      type: Number,
      min: 0,
    },

    checkOutDistanceMeters: {
      type: Number,
      min: 0,
    },

    lateMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    earlyCheckoutMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalWorkingMinutes: {
      type: Number,
      min: 0,
    },

    remarks: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  },
);

attendanceSchema.index(
  {
    employee: 1,
    date: 1,
  },
  {
    unique: true,
  },
);

attendanceSchema.index({
  branch: 1,
  date: -1,
});

attendanceSchema.index({
  employee: 1,
  date: -1,
});

attendanceSchema.index({
  branch: 1,
  status: 1,
  date: -1,
});

export const Attendance = mongoose.model<IAttendance>(
  "Attendance",
  attendanceSchema,
);
