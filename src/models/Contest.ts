import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IContestMedia {
  url: string;
  publicId: string;
  resourceType: "image" | "video" | "raw"; // 'raw' is used by Cloudinary for PDFs/docs
  format?: string;
  originalName?: string;
}

export interface IContest extends Document {
  title: string;
  description: string;
  branches: Types.ObjectId[]; // Target branches
  media?: IContestMedia;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contestSchema = new Schema<IContest>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    branches: [
      {
        type: Schema.Types.ObjectId,
        ref: "Branch",
        required: true,
        index: true,
      },
    ],
    media: {
      url: { type: String },
      publicId: { type: String },
      resourceType: { type: String, enum: ["image", "video", "raw"] },
      format: { type: String },
      originalName: { type: String },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

contestSchema.index({ branches: 1, isActive: 1, endDate: 1 });

export const Contest: Model<IContest> =
  mongoose.models.Contest || mongoose.model<IContest>("Contest", contestSchema);
