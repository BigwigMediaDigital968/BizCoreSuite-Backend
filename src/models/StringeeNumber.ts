import mongoose, { Document, Schema, Types } from "mongoose";

export interface IStringeeNumber extends Document {
  phoneNumber: string; // The virtual/purchased Stringee number (e.g., "917971730788")
  label?: string; // Optional description/tag (e.g., "Delhi Desk 1")
  branch?: Types.ObjectId; // Scoped to branch (required for Admin filtering)
  assignedTo?: Types.ObjectId; // User (Employee) assigned to this number
  assignedBy?: Types.ObjectId;
  stringeeUserId?: string; // Added: Stringee internal user ID or extension ID
  stringeePassword?: string; // Added: SIP/Stringee credentials password
  assignedAt?: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const stringeeNumberSchema = new Schema<IStringeeNumber>(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    label: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      sparse: true,
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    stringeeUserId: {
      type: String,
      trim: true,
    },
    stringeePassword: {
      type: String,
      trim: true,
    },
    assignedAt: {
      type: Date,
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
  },
  { timestamps: true },
);

export const StringeeNumber = mongoose.model<IStringeeNumber>(
  "StringeeNumber",
  stringeeNumberSchema,
);
