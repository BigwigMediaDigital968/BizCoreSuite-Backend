import mongoose, {
  Document,
  Schema,
} from "mongoose";

export const LEAD_ACTIVITY_TYPE = {
  CREATED: "created",
  ASSIGNED: "assigned",
  STATUS_CHANGED: "status_changed",
  REMARK_ADDED: "remark_added",
  FOLLOW_UP: "follow_up",
  CALL_LOGGED: "call_logged",
  WHATSAPP_IN: "whatsapp_in",
  WHATSAPP_OUT: "whatsapp_out",
} as const;

export type LeadActivityType =
  (typeof LEAD_ACTIVITY_TYPE)[keyof typeof LEAD_ACTIVITY_TYPE];

export interface ILeadActivity
  extends Document {
  lead: mongoose.Types.ObjectId;

  activityType: LeadActivityType;

  performedBy: mongoose.Types.ObjectId;

  previousStatus?: string;

  newStatus?: string;

  remark?: string;

  metadata?: Record<string, unknown>;

  createdAt: Date;

  updatedAt: Date;
}

const leadActivitySchema =
  new Schema<ILeadActivity>(
    {
      lead: {
        type: Schema.Types.ObjectId,
        ref: "Lead",
        required: true,
        index: true,
      },

      activityType: {
        type: String,
        enum: Object.values(
          LEAD_ACTIVITY_TYPE,
        ),
        required: true,
        index: true,
      },

      performedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      previousStatus: {
        type: String,
        default: null,
      },

      newStatus: {
        type: String,
        default: null,
      },

      remark: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: null,
      },

      metadata: {
        type: Schema.Types.Mixed,
        default: null,
      },
    },
    {
      timestamps: true,
    },
  );

leadActivitySchema.index({
  lead: 1,
  createdAt: -1,
});

export const LeadActivity =
  mongoose.model<ILeadActivity>(
    "LeadActivity",
    leadActivitySchema,
  );