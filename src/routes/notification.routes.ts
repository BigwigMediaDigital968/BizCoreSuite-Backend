import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";

import { Notification } from "../models/Notification.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { AppError } from "../utils/AppError.js";

// The signed-in user's own in-app notifications. Every query is scoped to
// `recipient: req.user.id`, so no permission beyond being signed in is needed.
const router = Router();

router.use(authenticate);

const me = (req: Request) => {
  if (!req.user) throw new AppError("Authentication required", 401, "AUTHENTICATION_REQUIRED");
  return new Types.ObjectId(req.user.id);
};

const listQuerySchema = z.object({
  unreadOnly: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

router.get("/", async (req: Request, res: Response) => {
  const { unreadOnly, page, limit } = listQuerySchema.parse(req.query);
  const filter: Record<string, unknown> = { recipient: me(req) };
  if (unreadOnly) filter.isRead = false;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter)
      .select("type title message entityId entityType isRead createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipient: me(req), isRead: false }),
  ]);

  return res.status(200).json({
    success: true,
    data: items,
    unread,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

router.get("/unread-count", async (req: Request, res: Response) => {
  const unread = await Notification.countDocuments({ recipient: me(req), isRead: false });
  return res.status(200).json({ success: true, data: { unread } });
});

router.patch("/read-all", async (req: Request, res: Response) => {
  await Notification.updateMany({ recipient: me(req), isRead: false }, { isRead: true, readAt: new Date() });
  return res.status(200).json({ success: true });
});

router.patch("/:id/read", async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || Array.isArray(id) || !Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid notification ID", 400, "INVALID_NOTIFICATION_ID");
  }
  await Notification.updateOne({ _id: id, recipient: me(req) }, { isRead: true, readAt: new Date() });
  return res.status(200).json({ success: true });
});

export default router;
