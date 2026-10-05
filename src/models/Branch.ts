import { Schema, model, Types, type Document } from "mongoose";

export interface IBranchLocation {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface IBranchWorkingHours {
  startTime: string;
  endTime: string;
}

export interface IBranchAttendanceConfig {
  enabled: boolean;
  timezone: string;

  location: IBranchLocation;

  workingDays: number[];

  workingHours: IBranchWorkingHours;

  gracePeriodMinutes: number;
}

export interface IBranch extends Document {
  name: string;
  code: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;

  attendanceConfig: IBranchAttendanceConfig;
}

const branchSchema = new Schema<IBranch>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 30,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    state: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "India",
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    attendanceConfig: {
      enabled: {
        type: Boolean,
        default: true,
      },

      timezone: {
        type: String,
        required: true,
        default: "Asia/Kolkata",
        trim: true,
      },

      location: {
        latitude: {
          type: Number,
          required: true,
          min: -90,
          max: 90,
        },

        longitude: {
          type: Number,
          required: true,
          min: -180,
          max: 180,
        },

        radiusMeters: {
          type: Number,
          required: true,
          min: 10,
          max: 5000,
          default: 200,
        },
      },

      workingDays: {
        type: [Number],
        required: true,
        default: [1, 2, 3, 4, 5, 6],
      },

      workingHours: {
        startTime: {
          type: String,
          required: true,
          default: "09:30",
        },

        endTime: {
          type: String,
          required: true,
          default: "18:30",
        },
      },

      gracePeriodMinutes: {
        type: Number,
        required: true,
        min: 0,
        max: 180,
        default: 15,
      },
    },
  },
  {
    timestamps: true,
  },
);

branchSchema.index({ code: 1 }, { unique: true });

branchSchema.index({
  name: 1,
});

export const Branch = model<IBranch>("Branch", branchSchema);
