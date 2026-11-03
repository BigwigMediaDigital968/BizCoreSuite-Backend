import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { ChatMessage, ChatRoom } from "../models/Chat.js";
import { Notification, NOTIFICATION_TYPES } from "../models/Notification.js";
import { User } from "../models/User.js";
import { verifyAccessToken } from "../utils/jwt.js";
import {
  findAccessibleRoom,
  isDirectRoomWritable,
  markRoomRead,
  otherParticipantId,
} from "../services/chatAccess.service.js";
import { notify } from "../services/notification.service.js";
import {
  roomIdPayloadSchema,
  sendMessageSchema,
} from "../validators/chat.validator.js";

let io: Server | null = null;

interface SocketUser {
  id: string;
  name: string;
  role: string;
}

type Ack = (response: { ok: boolean; message?: string; data?: unknown }) => void;

// Per-socket send limit: at most SEND_LIMIT messages per SEND_WINDOW_MS.
const SEND_LIMIT = 10;
const SEND_WINDOW_MS = 5000;
// Ignore typing pings for the same room more often than this.
const TYPING_MIN_INTERVAL_MS = 1000;
const NOTIFICATION_PREVIEW_LENGTH = 120;

const isOnline = async (userId: string) =>
  ((await io?.in(`user:${userId}`).fetchSockets()) ?? []).length > 0;

/**
 * Bell notification for a DM recipient who has no open tab. Only one unread
 * notification per conversation, so a burst of messages doesn't flood the bell.
 */
const notifyOfflineRecipient = async (
  roomId: string,
  recipientId: string,
  sender: SocketUser,
  content: string,
) => {
  if (await isOnline(recipientId)) return;

  const pending = await Notification.exists({
    recipient: recipientId,
    entityId: roomId,
    type: NOTIFICATION_TYPES.CHAT_MESSAGE,
    isRead: false,
  } as any);
  if (pending) return;

  await notify({
    userIds: [recipientId],
    senderId: sender.id,
    type: NOTIFICATION_TYPES.CHAT_MESSAGE,
    title: `New message from ${sender.name}`,
    message:
      content.length > NOTIFICATION_PREVIEW_LENGTH
        ? `${content.slice(0, NOTIFICATION_PREVIEW_LENGTH)}…`
        : content,
    entityId: roomId,
    entityType: "ChatRoom",
  });
};

export const initSocket = (server: HttpServer): Server => {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // Identity comes only from the access token — never from the handshake
  // query, which any client can set to impersonate another user.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) {
        return next(new Error("unauthorized"));
      }

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub)
        .select("_id name role isActive")
        .lean();

      if (!user || !user.isActive) return next(new Error("unauthorized"));

      socket.data.user = {
        id: user._id.toString(),
        name: user.name,
        role: user.role,
      } satisfies SocketUser;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser;
    const userId = user.id;

    socket.join(`user:${userId}`);
    socket.join(`role:${user.role}`);

    // --- CHAT MODULE EVENTS ---
    //
    // Delivery: DM events go to both people's personal `user:<id>` rooms, so
    // they arrive on any page (unread badge, new conversations). Channel
    // events go to `chat:<roomId>`, which the Chat page joins.

    // Rooms this socket has proven membership of (cheap check for typing).
    const memberOf = new Map<string, { type: string; participants: string[] }>();

    const loadRoom = async (roomId: string) => {
      const room = await findAccessibleRoom(roomId, userId);
      if (room) {
        memberOf.set(roomId, {
          type: room.type,
          participants: room.participants.map(String),
        });
      }
      return room;
    };

    // Join a room's broadcast channel — members only.
    socket.on("chat:join", async (roomId: unknown, ack?: Ack) => {
      const room = typeof roomId === "string" ? await loadRoom(roomId) : null;

      if (!room) {
        ack?.({ ok: false, message: "Chat not found" });
        return;
      }

      socket.join(`chat:${room._id.toString()}`);
      ack?.({ ok: true });
    });

    socket.on("chat:leave", (roomId: unknown) => {
      if (typeof roomId === "string") socket.leave(`chat:${roomId}`);
    });

    let sendWindowStart = 0;
    let sendCount = 0;

    socket.on("chat:send_message", async (data: unknown, ack?: Ack) => {
      const fail = (message: string) => {
        socket.emit("chat:error", { message });
        ack?.({ ok: false, message });
      };

      try {
        const now = Date.now();
        if (now - sendWindowStart > SEND_WINDOW_MS) {
          sendWindowStart = now;
          sendCount = 0;
        }
        if (++sendCount > SEND_LIMIT) {
          return fail("You're sending messages too quickly. Slow down a little.");
        }

        const parsed = sendMessageSchema.safeParse(data);
        if (!parsed.success) {
          return fail(parsed.error.issues[0]?.message || "Invalid message");
        }
        const { roomId, content, clientId } = parsed.data;

        const room = await loadRoom(roomId);
        if (!room) return fail("You're not a member of this chat");

        const isDirect = room.type === "DIRECT";
        if (isDirect && !(await isDirectRoomWritable(room.participants))) {
          return fail("Direct messages are turned off for this conversation");
        }

        const message = await ChatMessage.create({
          roomId,
          senderId: userId,
          content,
          readBy: [userId],
        });

        await Promise.all([
          ChatRoom.updateOne({ _id: roomId } as any, {
            $set: {
              lastMessage: {
                content: content.slice(0, 200),
                senderId: userId,
                createdAt: message.createdAt,
              },
              lastMessageAt: message.createdAt,
            },
          }),
          // Sending implies you've read the conversation up to here.
          markRoomRead(roomId, userId, message.createdAt),
        ]);

        const populated = await message.populate("senderId", "name email role");
        const payload = { ...populated.toObject(), clientId };

        if (isDirect) {
          room.participants.forEach((p) =>
            io?.to(`user:${p.toString()}`).emit("chat:new_message", payload),
          );
        } else {
          io?.to(`chat:${roomId}`).emit("chat:new_message", payload);
        }
        ack?.({ ok: true, data: payload });

        if (isDirect) {
          const recipientId = otherParticipantId(room.participants, userId);
          if (recipientId) {
            notifyOfflineRecipient(roomId, recipientId, user, content).catch(
              (err) => console.error("[CHAT] offline notification failed", err),
            );
          }
        }
      } catch {
        fail("Failed to send message");
      }
    });

    // Ephemeral "typing…" signal — never stored.
    const lastTypingAt = new Map<string, number>();
    socket.on("chat:typing", async (data: unknown) => {
      const parsed = roomIdPayloadSchema.safeParse(data);
      if (!parsed.success) return;
      const { roomId } = parsed.data;

      const now = Date.now();
      if (now - (lastTypingAt.get(roomId) ?? 0) < TYPING_MIN_INTERVAL_MS) return;
      lastTypingAt.set(roomId, now);

      if (!memberOf.has(roomId)) await loadRoom(roomId);
      const room = memberOf.get(roomId);
      if (!room) return;

      const payload = { roomId, userId, name: user.name };
      if (room.type === "DIRECT") {
        const otherId = otherParticipantId(room.participants, userId);
        if (otherId) io?.to(`user:${otherId}`).emit("chat:typing", payload);
      } else {
        socket.to(`chat:${roomId}`).emit("chat:typing", payload);
      }
    });

    socket.on("disconnect", () => {});
  });

  return io;
};

export const getIO = (): Server | null => io;
