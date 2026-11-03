import { Types } from "mongoose";
import { ChatMember, ChatRoom } from "../models/Chat.js";
import { User } from "../models/User.js";

/**
 * Chat access is membership-based: a user can see, read and post in a room
 * only if they are in its `participants`. Roles play no part here.
 */

/** Returns the room if `userId` is a participant and it isn't archived. */
export const findAccessibleRoom = async (roomId: string, userId: string) => {
  if (!Types.ObjectId.isValid(roomId)) return null;

  return ChatRoom.findOne({
    _id: roomId,
    participants: userId,
    isArchived: false,
  } as any).lean();
};

/** Missing `chatSettings` (users created before the switch) counts as on. */
export const canUserDirectMessage = (user: {
  isActive?: boolean;
  chatSettings?: { canDirectMessage?: boolean };
}) => !!user.isActive && user.chatSettings?.canDirectMessage !== false;

/**
 * A DM is writable only while both people are active and have direct
 * messages enabled. Otherwise it stays readable (history kept) but read-only.
 */
export const isDirectRoomWritable = async (
  participantIds: (Types.ObjectId | string)[],
): Promise<boolean> => {
  const users = await User.find({ _id: { $in: participantIds } } as any)
    .select("isActive chatSettings")
    .lean();

  return (
    users.length === participantIds.length &&
    users.every((u: any) => canUserDirectMessage(u))
  );
};

/** One key per pair of users, independent of who opened the DM. */
export const dmKeyFor = (a: string, b: string) => [a, b].sort().join("_");

/** Records that `userId` has read `roomId` up to `readAt`. */
export const markRoomRead = (roomId: string, userId: string, readAt: Date) =>
  ChatMember.updateOne(
    { roomId, userId } as any,
    // Never move the marker backwards (e.g. a late ack after a newer read).
    { $max: { lastReadAt: readAt } },
    { upsert: true },
  );

/** The other participant of a DM. */
export const otherParticipantId = (
  participants: (Types.ObjectId | string)[],
  userId: string,
) => participants.map(String).find((id) => id !== userId);
