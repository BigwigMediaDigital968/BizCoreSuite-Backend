import { z } from "zod";
import { Types } from "mongoose";

export const MAX_MESSAGE_LENGTH = 4000;

export const objectIdSchema = z
  .string()
  .refine((value) => Types.ObjectId.isValid(value), "Invalid id");

export const sendMessageSchema = z.object({
  roomId: objectIdSchema,
  content: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(
      MAX_MESSAGE_LENGTH,
      `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
    ),
  // Client-generated id echoed back so the sender can match its optimistic
  // "sending…" message to the saved one.
  clientId: z.string().max(64).optional(),
});

export const roomIdPayloadSchema = z.object({ roomId: objectIdSchema });

export const roomMessagesQuerySchema = z.object({
  // Cursor: return messages older than this message id.
  before: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const chatSettingsSchema = z
  .object({ canDirectMessage: z.boolean() })
  .strict();
