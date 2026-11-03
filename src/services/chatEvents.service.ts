import { ChatMessage, ChatRoom } from "../models/Chat.js";
import { getIO } from "../socket/index.js";
import { markRoomRead } from "./chatAccess.service.js";

/**
 * Adds an event line ("X created this channel", "X left") to a room: it is
 * stored as a SYSTEM message, becomes the room's last message, and is pushed
 * live to everyone currently viewing the room. `actorId` is the person the
 * event is attributed to.
 */
export const postSystemMessage = async (
  roomId: string,
  actorId: string,
  content: string,
) => {
  const message = await ChatMessage.create({
    roomId,
    senderId: actorId,
    kind: "SYSTEM",
    content,
    readBy: [actorId],
  });

  await ChatRoom.updateOne({ _id: roomId } as any, {
    $set: {
      lastMessage: {
        content,
        senderId: actorId,
        createdAt: message.createdAt,
        isSystem: true,
      },
      lastMessageAt: message.createdAt,
    },
  });
  // The person who caused the event doesn't need it flagged as unread.
  await markRoomRead(roomId, actorId, message.createdAt);

  const populated = await message.populate("senderId", "name email role");
  getIO()?.to(`chat:${roomId}`).emit("chat:new_message", populated.toObject());

  return message;
};

/** Everyone's open tabs refetch their room list (and the room's info panel). */
export const refreshRoomsFor = (userIds: Iterable<string>) => {
  const io = getIO();
  for (const id of userIds) io?.to(`user:${id}`).emit("chat:rooms_changed");
};

/** Stops live delivery of a room's messages to a user who is no longer in it. */
export const removeFromRoomSockets = (roomId: string, userId: string) => {
  getIO()?.in(`user:${userId}`).socketsLeave(`chat:${roomId}`);
};

/** "A", "A and B", "A, B and C", "A, B and 3 others". */
export const joinNames = (names: string[], maxShown = 3) => {
  if (names.length <= maxShown) {
    return names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : (names[0] ?? "");
  }
  const rest = names.length - (maxShown - 1);
  return `${names.slice(0, maxShown - 1).join(", ")} and ${rest} others`;
};
