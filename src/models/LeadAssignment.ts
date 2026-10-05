import mongoose, {
  Document,
  Schema,
} from "mongoose";

export interface ILeadAssignment
  extends Document {
  lead: mongoose.Types.ObjectId;

  assignedTo: mongoose.Types.ObjectId;

  assignedBy: mongoose.Types.ObjectId;

  branch: mongoose.Types.ObjectId;

  previousAssignee?: mongoose.Types.ObjectId;

  reason?: string;

  createdAt: Date;

  updatedAt: Date;
}

const leadAssignmentSchema =
  new Schema<ILeadAssignment>(
    {
      lead: {
        type: Schema.Types.ObjectId,
        ref: "Lead",
        required: true,
        index: true,
      },

      assignedTo: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      assignedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },

      branch: {
        type: Schema.Types.ObjectId,
        ref: "Branch",
        required: true,
        index: true,
      },

      previousAssignee: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      reason: {
        type: String,
        trim: true,
        maxlength: 500,
      },
    },
    {
      timestamps: true,
    },
  );

leadAssignmentSchema.index({
  lead: 1,
  createdAt: -1,
});

leadAssignmentSchema.index({
  assignedTo: 1,
  createdAt: -1,
});

export const LeadAssignment =
  mongoose.model<ILeadAssignment>(
    "LeadAssignment",
    leadAssignmentSchema,
  );