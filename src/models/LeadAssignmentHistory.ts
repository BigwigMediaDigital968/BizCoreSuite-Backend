import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface ILeadAssignmentHistory
  extends Document {
  lead: mongoose.Types.ObjectId;

  /** Absent for a branch-only assignment (no specific representative). */
  assignedTo?: mongoose.Types.ObjectId;

  assignedBy: mongoose.Types.ObjectId;

  branch: mongoose.Types.ObjectId;

  previousAssignee?: mongoose.Types.ObjectId;

  assignedAt: Date;

  createdAt: Date;
}

const leadAssignmentHistorySchema =
  new Schema<ILeadAssignmentHistory>(
    {
      lead: {
        type:
          Schema.Types.ObjectId,
        ref: "Lead",
        required: true,
        index: true,
      },

      assignedTo: {
        type:
          Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },

      assignedBy: {
        type:
          Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },

      branch: {
        type:
          Schema.Types.ObjectId,
        ref: "Branch",
        required: true,
        index: true,
      },

      previousAssignee: {
        type:
          Schema.Types.ObjectId,
        ref: "User",
      },

      assignedAt: {
        type: Date,
        required: true,
        default: Date.now,
      },
    },
    {
      timestamps: true,
    },
  );

leadAssignmentHistorySchema.index({
  lead: 1,
  createdAt: -1,
});

leadAssignmentHistorySchema.index({
  assignedTo: 1,
  createdAt: -1,
});

export const LeadAssignmentHistory =
  mongoose.model<ILeadAssignmentHistory>(
    "LeadAssignmentHistory",
    leadAssignmentHistorySchema,
  );