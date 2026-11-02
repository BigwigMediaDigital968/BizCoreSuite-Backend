// import { Server as HttpServer } from "http";
// import { Server, Socket } from "socket.io";

// let io: Server | null = null;

// export const initSocket = (server: HttpServer): Server => {
//   io = new Server(server, {
//     cors: { origin: "*", methods: ["GET", "POST"] },
//   });

//   io.on("connection", (socket: Socket) => {
//     const userId = socket.handshake.query.userId as string;
//     const role = socket.handshake.query.role as string;

//     if (userId) socket.join(`user:${userId}`);
//     if (role) socket.join(`role:${role}`);

//     socket.on("disconnect", () => {});
//   });

//   return io;
// };

// export const getIO = (): Server | null => io;


import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { ChatMessage } from "../models/Chat.js";

let io: Server | null = null;

export const initSocket = (server: HttpServer): Server => {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.handshake.query.userId as string;
    const role = socket.handshake.query.role as string;

    if (userId) socket.join(`user:${userId}`);
    if (role) socket.join(`role:${role}`);

    // --- CHAT MODULE EVENTS ---
    
    // Join a specific chat room (Channel or Direct Message)
    socket.on("chat:join", (roomId: string) => {
      socket.join(`chat:${roomId}`);
    });

    // Leave a chat room
    socket.on("chat:leave", (roomId: string) => {
      socket.leave(`chat:${roomId}`);
    });

    // Send and broadcast chat message
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
            "name email role"
          );

          // Broadcast to everyone currently in the chat room
          io?.to(`chat:${data.roomId}`).emit("chat:new_message", populatedMsg);
        } catch (error) {
          socket.emit("chat:error", { message: "Failed to send message" });
        }
      }
    );

    socket.on("disconnect", () => {});
  });

  return io;
};

export const getIO = (): Server | null => io;