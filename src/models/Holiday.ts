import mongoose, { Document, Schema } from "mongoose";

import { HOLIDAY_TYPE, type HolidayType } from "../constants/holiday.js";

export interface IHoliday extends Document {
  branch: mongoose.Types.ObjectId;

  date: Date;

  name: string;

  description?: string;

  type: HolidayType;

  isActive: boolean;

  createdBy: mongoose.Types.ObjectId;

  updatedBy?: mongoose.Types.ObjectId;

  createdAt: Date;

  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>(
  {
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    type: {
      type: String,
      enum: Object.values(HOLIDAY_TYPE),
      required: true,
      default: HOLIDAY_TYPE.COMPANY,
      index: true,
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
  },
  {
    timestamps: true,
  },
);

holidaySchema.index(
  {
    branch: 1,
    date: 1,
  },
  {
    unique: true,
  },
);

holidaySchema.index({
  branch: 1,
  date: -1,
});

export const Holiday = mongoose.model<IHoliday>("Holiday", holidaySchema);
