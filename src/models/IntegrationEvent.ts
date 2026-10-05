import mongoose, { Document, Schema } from "mongoose";

import {
  INTEGRATION_EVENT_OUTCOME,
  INTEGRATION_EVENT_TTL_SECONDS,
  type IntegrationEventOutcome,
} from "../constants/integration.js";

/** Raw inbound webhook log, for debugging, idempotency and retry. */
export interface IIntegrationEvent extends Document {
  integration: mongoose.Types.ObjectId;
  provider: string;
  eventType: string;
  /** Provider event id; unique per integration so retried deliveries are skipped. */
  externalEventId: string;
  payload: Record<string, unknown>;
  outcome: IntegrationEventOutcome | "processing";
  lead?: mongoose.Types.ObjectId | null;
  error?: string | null;
  attempts: number;
  receivedAt: Date;
}

const integrationEventSchema = new Schema<IIntegrationEvent>(
  {
    integration: { type: Schema.Types.ObjectId, ref: "Integration", required: true },
    provider: { type: String, required: true },
    eventType: { type: String, required: true },
    externalEventId: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    outcome: {
      type: String,
      enum: [...Object.values(INTEGRATION_EVENT_OUTCOME), "processing"],
      default: "processing",
      index: true,
    },
    lead: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    error: { type: String, default: null },
    attempts: { type: Number, default: 1 },
    receivedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

integrationEventSchema.index({ integration: 1, externalEventId: 1 }, { unique: true });
integrationEventSchema.index({ integration: 1, receivedAt: -1 });
integrationEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: INTEGRATION_EVENT_TTL_SECONDS });

export const IntegrationEvent = mongoose.model<IIntegrationEvent>(
  "IntegrationEvent",
  integrationEventSchema,
);
