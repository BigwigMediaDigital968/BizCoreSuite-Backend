import mongoose, {
  Document,
  Model,
  Schema,
  Types,
} from "mongoose";

import { ROLES } from "../constants/roles.js";

export type Role =
  | typeof ROLES.HEAD
  | typeof ROLES.ADMIN
  | typeof ROLES.MANAGER
  | typeof ROLES.EMPLOYEE;

export interface IUser extends Document {
  lastLoginAt: Date;
  name: string;
  email: string;
  password: string;
  role: Role;
  branches: Types.ObjectId[];
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },

    branches: [
      {
        type: Schema.Types.ObjectId,
        ref: "Branch",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

export const User: Model<IUser> =
  mongoose.models.User ||
  mongoose.model<IUser>("User", userSchema);