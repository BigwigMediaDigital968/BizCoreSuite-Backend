import mongoose, { Document, Schema } from "mongoose";

import {
  INTEGRATION_ASSIGNMENT,
  INTEGRATION_PROVIDER,
  INTEGRATION_STATUS,
  type IntegrationAssignment,
  type IntegrationProvider,
  type IntegrationStatus,
} from "../constants/integration.js";

export interface IIntegration extends Document {
  provider: IntegrationProvider;
  name: string;
  status: IntegrationStatus;
  /** Provider credentials, AES-GCM encrypted JSON. Never sent to the client. */
  credentialsEncrypted: string;
  /** Last 4 characters of the token, for display only. */
  credentialsHint: string;
  /** Random secret embedded in the webhook URL (providers like WATI don't sign webhooks). */
  webhookSecret: string;
  /** Provider-specific, non-secret settings discovered at connect time (e.g. the resolved API base). */
  providerConfig: Record<string, unknown>;
  routing: {
    branch?: mongoose.Types.ObjectId | null;
    assignment: IntegrationAssignment;
    fixedUser?: mongoose.Types.ObjectId | null;
    roundRobinCursor: number;
  };
  leadDefaults: { sourceLabel: string };
  createLeadOn: { newContact: boolean; messageFromUnknown: boolean };
  stats: {
    leadsCreated: number;
    eventsReceived: number;
    lastEventAt?: Date | null;
    lastErrorAt?: Date | null;
    lastError?: string | null;
    consecutiveFailures: number;
  };
  createdBy: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const integrationSchema = new Schema<IIntegration>(
  {
    provider: {
      type: String,
      enum: Object.values(INTEGRATION_PROVIDER),
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: Object.values(INTEGRATION_STATUS),
      default: INTEGRATION_STATUS.ACTIVE,
      index: true,
    },
    credentialsEncrypted: { type: String, required: true, select: false },
    credentialsHint: { type: String, default: "" },
    webhookSecret: { type: String, required: true, select: false },
    providerConfig: { type: Schema.Types.Mixed, default: {} },
    routing: {
      branch: { type: Schema.Types.ObjectId, ref: "Branch", default: null },
      assignment: {
        type: String,
        enum: Object.values(INTEGRATION_ASSIGNMENT),
        default: INTEGRATION_ASSIGNMENT.UNASSIGNED,
      },
      fixedUser: { type: Schema.Types.ObjectId, ref: "User", default: null },
      roundRobinCursor: { type: Number, default: 0 },
    },
    leadDefaults: {
      sourceLabel: { type: String, trim: true, maxlength: 100, default: "WATI" },
    },
    createLeadOn: {
      newContact: { type: Boolean, default: true },
      messageFromUnknown: { type: Boolean, default: true },
    },
    stats: {
      leadsCreated: { type: Number, default: 0 },
      eventsReceived: { type: Number, default: 0 },
      lastEventAt: { type: Date, default: null },
      lastErrorAt: { type: Date, default: null },
      lastError: { type: String, default: null },
      consecutiveFailures: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const Integration = mongoose.model<IIntegration>("Integration", integrationSchema);
