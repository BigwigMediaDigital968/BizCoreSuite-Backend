import { Server, Socket } from "socket.io";
import { ChatMessage } from "../models/Chat.js";

export const registerChatSocketHandlers = (io: Server, socket: Socket) => {
  const userId = socket.handshake.query.userId as string;

  socket.on("chat:join", (roomId: string) => {
    socket.join(`chat:${roomId}`);
  });

  socket.on("chat:leave", (roomId: string) => {
    socket.leave(`chat:${roomId}`);
  });

  socket.on(
    "chat:send_message",
    async (data: { roomId: string; content: string; attachments?: any[] }) => {
      try {
        if (!userId) return;

        const message = await ChatMessage.create({
          roomId: data.roomId,
          senderId: userId,
          content: data.content,
          attachments: data.attachments || [],
          readBy: [userId],
        });

        const populatedMsg = await message.populate(
          "senderId",
          "name email role",
        );

        io.to(`chat:${data.roomId}`).emit("chat:new_message", populatedMsg);
      } catch (error) {
        socket.emit("chat:error", { message: "Failed to send message" });
      }
    },
  );
};
