import { Request, Response } from "express";
import { Types } from "mongoose";
import { ChatRoom, ChatMessage, ChatMember } from "../models/Chat.js";
import { User } from "../models/User.js";
import { Branch } from "../models/Branch.js";
import { NOTIFICATION_TYPES } from "../models/Notification.js";
import { notify } from "../services/notification.service.js";
import { getIO } from "../socket/index.js";
import {
  canUserDirectMessage,
  dmKeyFor,
  findAccessibleRoom,
  isDirectRoomWritable,
  markRoomRead,
} from "../services/chatAccess.service.js";
import {
  chatSettingsSchema,
  roomMessagesQuerySchema,
} from "../validators/chat.validator.js";

const CHANNEL_TYPES = ["GLOBAL", "BRANCH"];
const MAX_CHANNEL_NAME_LENGTH = 60;
const MAX_CHANNEL_MEMBERS = 2000;
const PARTICIPANT_FIELDS = "name email role isActive chatSettings";

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const publicUser = (u: any) => ({
  _id: u._id.toString(),
  name: u.name,
  email: u.email,
  role: u.role,
});

/**
 * Adds the per-user view of each room: unread count, and for DMs the other
 * person, whether the DM is read-only, and when the other person last read it.
 * `rooms` must be lean with participants populated with PARTICIPANT_FIELDS.
 */
const buildRoomViews = async (rooms: any[], userId: string) => {
  if (!rooms.length) return [];

  const roomIds = rooms.map((r) => r._id);
  const members = await ChatMember.find({ roomId: { $in: roomIds } } as any)
    .select("roomId userId lastReadAt")
    .lean();

  const myReadAt = new Map<string, Date | undefined>();
  const othersReadAt = new Map<string, Date | undefined>();
  for (const m of members) {
    const key = m.roomId.toString();
    if (m.userId.toString() === userId) myReadAt.set(key, m.lastReadAt);
    else othersReadAt.set(key, m.lastReadAt);
  }

  // One aggregation for all unread counts.
  const unreadRows = await ChatMessage.aggregate([
    {
      $match: {
        senderId: { $ne: new Types.ObjectId(userId) },
        $or: rooms.map((r) => ({
          roomId: r._id,
          createdAt: { $gt: myReadAt.get(r._id.toString()) ?? new Date(0) },
        })),
      },
    },
    { $group: { _id: "$roomId", count: { $sum: 1 } } },
  ]);
  const unread = new Map(unreadRows.map((r) => [r._id.toString(), r.count]));

  return rooms.map((room) => {
    const id = room._id.toString();
    const participants = (room.participants || []).filter(Boolean);
    const view: Record<string, unknown> = {
      _id: id,
      name: room.name,
      type: room.type,
      branchId: room.branchId,
      isArchived: room.isArchived,
      createdBy: room.createdBy?.toString(),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      lastMessage: room.lastMessage?.content ? room.lastMessage : undefined,
      lastMessageAt: room.lastMessageAt,
      participants: participants.map(publicUser),
      unreadCount: unread.get(id) ?? 0,
    };

    if (room.type === "DIRECT") {
      const other = participants.find((p: any) => p._id.toString() !== userId);
      view.otherUser = other ? publicUser(other) : null;
      view.readOnly = !(
        participants.length === 2 &&
        participants.every((p: any) => canUserDirectMessage(p))
      );
      view.otherLastReadAt = othersReadAt.get(id) ?? null;
    }

    return view;
  });
};

// Fetch or create a 1-on-1 Direct Message room
export const getOrCreateDirectRoomController = async (
  req: Request,
  res: Response
) => {
  try {
    const currentUserId = (req as any).user.id;
    const { targetUserId } = req.body;

    const fail = (status: number, message: string) =>
      res.status(status).json({ success: false, message });

    if (typeof targetUserId !== "string" || !Types.ObjectId.isValid(targetUserId)) {
      return fail(400, "A valid targetUserId is required");
    }
    if (targetUserId === currentUserId) {
      return fail(400, "You can't start a direct message with yourself");
    }
    if (!(await User.exists({ _id: targetUserId, isActive: true } as any))) {
      return fail(404, "User not found");
    }
    if (!(await isDirectRoomWritable([currentUserId, targetUserId]))) {
      return fail(403, "Direct messages are turned off for you or this user");
    }

    const dmKey = dmKeyFor(currentUserId, targetUserId);

    // DMs created before dmKey existed: adopt the oldest one for this pair.
    await ChatRoom.findOneAndUpdate(
      {
        type: "DIRECT",
        dmKey: { $exists: false },
        participants: { $all: [currentUserId, targetUserId], $size: 2 },
      } as any,
      { $set: { dmKey } },
      { sort: { createdAt: 1 } },
    ).catch(() => null); // Another request adopted it first.

    let room;
    try {
      // Upsert on the unique dmKey: concurrent calls converge on one room.
      room = await ChatRoom.findOneAndUpdate(
        { dmKey } as any,
        {
          // dmKey itself comes from the filter on insert.
          $setOnInsert: {
            type: "DIRECT",
            participants: [currentUserId, targetUserId],
            createdBy: currentUserId,
            isArchived: false,
          },
        },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      room = await ChatRoom.findOne({ dmKey } as any);
    }

    // Remember that this user opened the DM so it stays in their list even
    // before anyone has written in it.
    await ChatMember.updateOne(
      { roomId: room!._id, userId: currentUserId } as any,
      { $setOnInsert: { roomId: room!._id, userId: currentUserId } },
      { upsert: true },
    );

    const populated = await ChatRoom.findById(room!._id)
      .populate("participants", PARTICIPANT_FIELDS)
      .lean();
    const [view] = await buildRoomViews([populated], currentUserId);

    return res.status(200).json({ success: true, data: view });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create Channel (Head / Admin access)
export const createChannelController = async (req: Request, res: Response) => {
  try {
    const currentUserId = (req as any).user.id;
    const { type, branchId, allowedRoles, participants } = req.body;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    const fail = (status: number, message: string) =>
      res.status(status).json({ success: false, message });

    if (!name) return fail(400, "Channel name is required");
    if (name.length > MAX_CHANNEL_NAME_LENGTH) {
      return fail(
        400,
        `Channel name must be at most ${MAX_CHANNEL_NAME_LENGTH} characters`,
      );
    }
    // DIRECT rooms go through /chat/direct; LEAD rooms need a lead and
    // have no creation flow yet.
    if (!CHANNEL_TYPES.includes(type)) {
      return fail(400, `Channel type must be one of: ${CHANNEL_TYPES.join(", ")}`);
    }

    if (type === "BRANCH") {
      if (!branchId || !Types.ObjectId.isValid(branchId)) {
        return fail(400, "A valid branchId is required for a branch channel");
      }
      if (!(await Branch.exists({ _id: branchId }))) {
        return fail(404, "Branch not found");
      }
    }

    if (
      participants !== undefined &&
      (!Array.isArray(participants) ||
        participants.length > MAX_CHANNEL_MEMBERS ||
        !participants.every(
          (id) => typeof id === "string" && Types.ObjectId.isValid(id),
        ))
    ) {
      return fail(400, "participants must be a list of valid user ids");
    }

    // An explicit list is the whole membership (plus the creator); only
    // active people can be added.
    const chosenIds = participants
      ? [...new Set<string>(participants.map(String))]
      : null;
    if (chosenIds) {
      const activeCount = await User.countDocuments({
        _id: { $in: chosenIds },
        isActive: true,
      } as any);
      if (activeCount !== chosenIds.length) {
        return fail(
          400,
          "Some of the selected people no longer exist or are inactive. Refresh the list and try again.",
        );
      }
    }

    const duplicate = await ChatRoom.exists({
      type,
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
      branchId: type === "BRANCH" ? branchId : { $exists: false },
      isArchived: false,
    } as any);
    if (duplicate) {
      return fail(409, "A channel with this name already exists");
    }

    // Access is membership-only. With an explicit list, that list is the
    // membership. Without one, "company-wide" / "branch" decide who is added
    // now: every active user, or the branch's active members.
    let memberIds: Set<string>;
    if (chosenIds) {
      memberIds = new Set<string>([currentUserId, ...chosenIds]);
    } else {
      const memberFilter: Record<string, unknown> = { isActive: true };
      if (type === "BRANCH") memberFilter.branches = branchId;
      const members = await User.find(memberFilter as any).select("_id").lean();
      memberIds = new Set<string>([
        currentUserId,
        ...members.map((m) => m._id.toString()),
      ]);
    }

    const created = await ChatRoom.create({
      name,
      type,
      ...(type === "BRANCH" ? { branchId } : {}),
      allowedRoles: allowedRoles || [],
      participants: [...memberIds],
      createdBy: currentUserId,
    });

    // First line of the channel: who made it. It also gives every member an
    // unread message (so the sidebar badge lights up) and a preview in their
    // list, instead of an empty, unexplained row.
    const creator = await User.findById(currentUserId).select("name").lean();
    const creatorName = creator?.name ?? "Someone";
    const intro = await ChatMessage.create({
      roomId: created._id,
      senderId: currentUserId,
      kind: "SYSTEM",
      content: `${creatorName} created this channel`,
      readBy: [currentUserId],
    });
    const room = await ChatRoom.findByIdAndUpdate(
      created._id,
      {
        $set: {
          lastMessage: {
            content: intro.content,
            senderId: currentUserId,
            createdAt: intro.createdAt,
            isSystem: true,
          },
          lastMessageAt: intro.createdAt,
        },
      },
      { returnDocument: "after" },
    );
    // The creator has, of course, read their own channel's first line.
    await markRoomRead(created._id.toString(), currentUserId, intro.createdAt);

    // Tell every added member: a bell notification (the sender is left out by
    // notify()), then refresh their open tabs so the channel appears live.
    // Notifications are fire-and-forget: the channel already exists.
    notify({
      userIds: [...memberIds],
      senderId: currentUserId,
      type: NOTIFICATION_TYPES.CHAT_CHANNEL_ADDED,
      title: `Added to #${name}`,
      message: `${creatorName} added you to the channel “${name}”.`,
      entityId: created._id,
      entityType: "ChatRoom",
    }).catch((err) => console.error("[CHAT] channel notification failed", err));

    const io = getIO();
    memberIds.forEach((id) => io?.to(`user:${id}`).emit("chat:rooms_changed"));

    return res.status(201).json({ success: true, data: room });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Head / admin: everyone who can be added to a channel, with the branches and
// role the member picker filters by. Not limited by the DM switch.
export const listChannelCandidatesController = async (
  _req: Request,
  res: Response,
) => {
  try {
    const users = await User.find({ isActive: true } as any)
      .select("_id name email role branches")
      .populate("branches", "name")
      .sort({ name: 1 })
      .limit(MAX_CHANNEL_MEMBERS)
      .lean();

    const data = users.map((u: any) => ({
      ...publicUser(u),
      branches: (u.branches || [])
        .filter(Boolean)
        .map((b: any) => ({ _id: b._id.toString(), name: b.name })),
    }));

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// People the current user can start a direct message with: every active user
// who also has DMs on. Empty when the caller's own DMs are off.
export const listChatUsersController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const me = await User.findById(userId).select("isActive chatSettings").lean();
    const canDirectMessage = !!me && canUserDirectMessage(me as any);
    if (!canDirectMessage) {
      return res.status(200).json({ success: true, data: [], canDirectMessage });
    }

    const filter: Record<string, unknown> = {
      isActive: true,
      _id: { $ne: userId },
      "chatSettings.canDirectMessage": { $ne: false },
    };

    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ name: pattern }, { email: pattern }];
    }

    const users = await User.find(filter as any)
      .select("_id name email role")
      .sort({ name: 1 })
      .limit(50)
      .lean();

    return res.status(200).json({ success: true, data: users, canDirectMessage });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Rooms the logged-in user is a member of, most recently active first.
export const getUserRoomsController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Membership is the only rule: no implicit company-wide or branch access.
    // An empty DM is listed only for whoever opened it; the other person
    // sees it once it has a message.
    const openedRoomIds = await ChatMember.distinct("roomId", { userId } as any);
    const rooms = await ChatRoom.find({
      participants: userId,
      isArchived: false,
      $or: [
        { type: { $ne: "DIRECT" } },
        { lastMessageAt: { $exists: true } },
        { _id: { $in: openedRoomIds } },
      ],
    } as any)
      .populate("participants", PARTICIPANT_FIELDS)
      .populate("branchId", "name")
      .lean();

    const views = await buildRoomViews(rooms, userId);
    const activity = (r: any) =>
      new Date(r.lastMessageAt ?? r.createdAt).getTime();
    views.sort((a, b) => activity(b) - activity(a));

    return res.status(200).json({ success: true, data: views });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Message history for a room, newest page first. `?before=<messageId>` loads
// the page older than that message.
export const getRoomMessagesController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user.id;
    const roomIdParam = req.params.roomId;

    if (typeof roomIdParam !== "string" || !Types.ObjectId.isValid(roomIdParam)) {
      return res.status(400).json({ success: false, message: "Valid roomId parameter is required" });
    }

    const query = roomMessagesQuerySchema.safeParse(req.query);
    if (!query.success) {
      return res.status(400).json({ success: false, message: "Invalid before or limit" });
    }
    const { before, limit } = query.data;

    // Same 404 for "doesn't exist" and "not a member" so room ids can't be probed.
    if (!(await findAccessibleRoom(roomIdParam, userId))) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    // Ids are generated server-side in insert order, so they double as a
    // stable cursor that new messages can't shift (unlike skip/offset).
    const filter: Record<string, unknown> = {
      roomId: new Types.ObjectId(roomIdParam),
    };
    if (before) filter._id = { $lt: new Types.ObjectId(before) };

    const messages = await ChatMessage.find(filter as any)
      .populate("senderId", "name email role")
      .sort({ _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = messages.length > limit;

    return res.status(200).json({
      success: true,
      data: messages.slice(0, limit).reverse(),
      hasMore,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Mark a room as read up to now. The other side of a DM gets a live "seen".
export const markRoomReadController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const roomId = String(req.params.roomId);

    const room = await findAccessibleRoom(roomId, userId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Chat not found" });
    }

    const readAt = new Date();
    await markRoomRead(roomId, userId, readAt);

    const payload = { roomId, userId, readAt };
    const io = getIO();
    // Own other tabs always; the other DM participant for "seen".
    const targets =
      room.type === "DIRECT" ? room.participants.map(String) : [userId];
    targets.forEach((id) => io?.to(`user:${id}`).emit("chat:read", payload));

    return res.status(200).json({ success: true, data: payload });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Head / admin: read a user's chat settings.
export const getUserChatSettingsController = async (
  req: Request,
  res: Response,
) => {
  try {
    const targetId = String(req.params.userId);
    if (!Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const user = await User.findById(targetId).select("chatSettings").lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        canDirectMessage: (user as any).chatSettings?.canDirectMessage !== false,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Head / admin: turn a user's direct messages on or off. Turning them off
// makes that user's existing DMs read-only for both sides.
export const updateUserChatSettingsController = async (
  req: Request,
  res: Response,
) => {
  try {
    const targetId = String(req.params.userId);
    if (!Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const parsed = chatSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "canDirectMessage must be true or false" });
    }

    const user = await User.findByIdAndUpdate(
      targetId,
      { $set: { "chatSettings.canDirectMessage": parsed.data.canDirectMessage } },
      { returnDocument: "after" },
    )
      .select("chatSettings")
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Everyone sharing a DM with this user re-fetches their room list so the
    // read-only state updates live.
    const dms = await ChatRoom.find({ type: "DIRECT", participants: targetId } as any)
      .select("participants")
      .lean();
    const affected = new Set<string>([targetId]);
    dms.forEach((r) => r.participants.forEach((p) => affected.add(p.toString())));
    const io = getIO();
    affected.forEach((id) => io?.to(`user:${id}`).emit("chat:rooms_changed"));

    return res.status(200).json({
      success: true,
      data: { canDirectMessage: parsed.data.canDirectMessage },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
