import { Request, Response } from "express";
import { Types } from "mongoose";
import { ChatRoom, ChatMessage } from "../models/Chat.js";
import { User } from "../models/User.js";

// Fetch or create a 1-on-1 Direct Message room
export const getOrCreateDirectRoomController = async (
  req: Request,
  res: Response
) => {
  try {
    const currentUserId = (req as any).user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ success: false, message: "targetUserId is required" });
    }

    let room = await ChatRoom.findOne({
      type: "DIRECT",
      participants: { $all: [currentUserId, targetUserId] },
    } as any).populate("participants", "name email role isActive");

    if (!room) {
      room = await ChatRoom.create({
        type: "DIRECT",
        participants: [currentUserId, targetUserId],
        createdBy: currentUserId,
      });
      room = await room.populate("participants", "name email role isActive");
    }

    return res.status(200).json({ success: true, data: room });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create Channel (Head / Admin access)
export const createChannelController = async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user.id;
    const { name, type, branchId, allowedRoles, participants } = req.body;

    const room = await ChatRoom.create({
      name,
      type,
      branchId,
      allowedRoles: allowedRoles || [],
      participants: participants || [currentUserId],
      createdBy: currentUserId,
    });

    return res.status(201).json({ success: true, data: room });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// List available chat rooms for logged in user
export const getUserRoomsController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await User.findById(userId);

    const rooms = await ChatRoom.find({
      $or: [
        { participants: userId },
        { type: "GLOBAL" },
        { branchId: { $in: (user as any)?.branches || [] } },
      ],
      isArchived: false,
    } as any)
      .populate("participants", "name email role")
      .populate("branchId", "name")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, data: rooms });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Fetch message history for a specific room
export const getRoomMessagesController = async (
  req: Request,
  res: Response
) => {
  try {
    const roomIdParam = req.params.roomId;

    // Ensure roomId is passed as a string
    if (!roomIdParam || typeof roomIdParam !== "string") {
      return res.status(400).json({ success: false, message: "Valid roomId parameter is required" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const messages = await ChatMessage.find({
      roomId: new Types.ObjectId(roomIdParam),
    } as any)
      .populate("senderId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: messages.reverse(),
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};