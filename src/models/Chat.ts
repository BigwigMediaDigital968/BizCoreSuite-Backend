import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatRoom extends Document {
  name?: string;
  type: "DIRECT" | "BRANCH" | "GLOBAL" | "LEAD";
  participants: mongoose.Types.ObjectId[];
  branchId?: mongoose.Types.ObjectId;
  leadId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  isArchived: boolean;
  allowedRoles?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatMessage extends Document {
  roomId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  content: string;
  attachments?: { url: string; fileType: string }[];
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ChatRoomSchema = new Schema<IChatRoom>(
  {
    name: { type: String, trim: true },
    type: {
      type: String,
      enum: ["DIRECT", "BRANCH", "GLOBAL", "LEAD"],
      required: true,
    },
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isArchived: { type: Boolean, default: false },
    allowedRoles: [{ type: String }],
  },
  { timestamps: true }
);

const ChatMessageSchema = new Schema<IChatMessage>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
    attachments: [
      {
        url: { type: String, required: true },
        fileType: { type: String, required: true },
      },
    ],
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const ChatRoom: Model<IChatRoom> =
  mongoose.models.ChatRoom || mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);

export const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);