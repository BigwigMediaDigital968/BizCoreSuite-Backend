import mongoose, { Document, Schema } from "mongoose";

import {
  LEAD_MESSAGE_DIRECTION,
  LEAD_MESSAGE_STATUS,
  type LeadMessageDirection,
  type LeadMessageStatus,
} from "../constants/integration.js";

/** One WhatsApp message on a lead. Reachable only through the lead (see INTEGRATIONS_PLAN §1). */
export interface ILeadMessage extends Document {
  lead: mongoose.Types.ObjectId;
  integration: mongoose.Types.ObjectId;
  direction: LeadMessageDirection;
  type: string;
  text?: string | null;
  templateName?: string | null;
  mediaUrl?: string | null;
  /** WhatsApp wamid, when known. */
  externalMessageId?: string | null;
  /** WATI's own message id. */
  providerMessageId?: string | null;
  status: LeadMessageStatus;
  error?: string | null;
  /** CRM user who sent it; null for inbound or messages sent from the WATI app. */
  sentBy?: mongoose.Types.ObjectId | null;
  /** Sent from the provider's own app rather than the CRM. */
  sentFromProvider: boolean;
  senderName?: string | null;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const leadMessageSchema = new Schema<ILeadMessage>(
  {
    lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true },
    integration: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    direction: {
      type: String,
      enum: Object.values(LEAD_MESSAGE_DIRECTION),
      required: true,
    },
    type: { type: String, default: "text" },
    text: { type: String, maxlength: 10000, default: null },
    templateName: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    externalMessageId: { type: String, default: null },
    providerMessageId: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(LEAD_MESSAGE_STATUS),
      required: true,
    },
    error: { type: String, default: null },
    sentBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    sentFromProvider: { type: Boolean, default: false },
    senderName: { type: String, default: null },
    sentAt: { type: Date, required: true },
  },
  { timestamps: true },
);

leadMessageSchema.index({ lead: 1, sentAt: -1 });
leadMessageSchema.index({ externalMessageId: 1 }, { sparse: true });
leadMessageSchema.index({ providerMessageId: 1 }, { sparse: true });

export const LeadMessage = mongoose.model<ILeadMessage>("LeadMessage", leadMessageSchema);
