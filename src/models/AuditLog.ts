import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface IAuditLog extends Document {
  actor: mongoose.Types.ObjectId;

  action: string;

  entity: string;

  entityId?: mongoose.Types.ObjectId;

  branch?: mongoose.Types.ObjectId;

  metadata?: Record<string, unknown>;

  ipAddress?: string;

  userAgent?: string;

  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema =
  new Schema<IAuditLog>(
    {
      actor: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      action: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      entity: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      entityId: {
        type: Schema.Types.ObjectId,
        index: true,
      },

      branch: {
        type: Schema.Types.ObjectId,
        ref: "Branch",
        index: true,
      },

      metadata: {
        type: Schema.Types.Mixed,
        default: {},
      },

      ipAddress: {
        type: String,
        trim: true,
      },

      userAgent: {
        type: String,
        trim: true,
      },
    },
    {
      timestamps: true,
    },
  );

auditLogSchema.index({
  createdAt: -1,
});

auditLogSchema.index({
  actor: 1,
  createdAt: -1,
});

auditLogSchema.index({
  entity: 1,
  entityId: 1,
  createdAt: -1,
});

auditLogSchema.index({
  branch: 1,
  createdAt: -1,
});

export const AuditLog =
  mongoose.model<IAuditLog>(
    "AuditLog",
    auditLogSchema,
  );