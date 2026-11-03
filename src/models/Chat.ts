import mongoose, { Schema, Document, Model } from "mongoose";

export interface IChatRoom extends Document {
  name?: string;
  type: "DIRECT" | "BRANCH" | "GLOBAL" | "LEAD";
  participants: mongoose.Types.ObjectId[];
  /** DIRECT only: the two user ids sorted and joined — one DM per pair. */
  dmKey?: string;
  lastMessage?: {
    content: string;
    senderId: mongoose.Types.ObjectId;
    createdAt: Date;
  };
  lastMessageAt?: Date;
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
  /** Users tagged with @name in `content`. Derived by the server, never trusted from the client. */
  mentions: mongoose.Types.ObjectId[];
  readBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

/** Per-user state for a room. Unread = others' messages after lastReadAt. */
export interface IChatMember extends Document {
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  lastReadAt?: Date;
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
    dmKey: { type: String },
    lastMessage: {
      content: { type: String },
      senderId: { type: Schema.Types.ObjectId, ref: "User" },
      createdAt: { type: Date },
    },
    lastMessageAt: { type: Date },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isArchived: { type: Boolean, default: false },
    allowedRoles: [{ type: String }],
  },
  { timestamps: true }
);

// Race-safe DM creation: two simultaneous "open DM" calls can't both insert.
ChatRoomSchema.index({ dmKey: 1 }, { unique: true, sparse: true });
ChatRoomSchema.index({ participants: 1, lastMessageAt: -1 });

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
    mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

// History pagination and unread counts both scan a room by time.
ChatMessageSchema.index({ roomId: 1, createdAt: -1 });
// "Messages in this room that mention me" (mention badges, search).
ChatMessageSchema.index({ roomId: 1, mentions: 1, createdAt: -1 });

const ChatMemberSchema = new Schema<IChatMember>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastReadAt: { type: Date },
  },
  { timestamps: true }
);

ChatMemberSchema.index({ userId: 1, roomId: 1 }, { unique: true });
ChatMemberSchema.index({ roomId: 1 });

export const ChatRoom: Model<IChatRoom> =
  mongoose.models.ChatRoom || mongoose.model<IChatRoom>("ChatRoom", ChatRoomSchema);

export const ChatMessage: Model<IChatMessage> =
  mongoose.models.ChatMessage || mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);

export const ChatMember: Model<IChatMember> =
  mongoose.models.ChatMember || mongoose.model<IChatMember>("ChatMember", ChatMemberSchema);
