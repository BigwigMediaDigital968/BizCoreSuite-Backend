import mongoose, { Document, Schema } from "mongoose";

export interface ISession extends Document {
  user: mongoose.Types.ObjectId;
  refreshTokenHash: string;

  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;

  expiresAt: Date;
  revokedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    deviceName: {
      type: String,
      trim: true,
      maxlength: 100,
    },

    userAgent: {
      type: String,
      trim: true,
    },

    ipAddress: {
      type: String,
      trim: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

sessionSchema.index({
  user: 1,
  revokedAt: 1,
});

// sessionSchema.index(
//   { expiresAt: 1 },
//   {
//     expireAfterSeconds: 0,
//   },
// );

export const Session = mongoose.model<ISession>("Session", sessionSchema);
