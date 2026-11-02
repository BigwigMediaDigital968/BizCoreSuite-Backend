import { Router } from "express";
import {
  createChannelController,
  getOrCreateDirectRoomController,
  getRoomMessagesController,
  getUserRoomsController,
} from "../controllers/chat.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

router.use(authenticate);

// Get all accessible channels and DMs
router.get("/rooms", getUserRoomsController);

// Get messages for a channel/room
router.get("/rooms/:roomId/messages", getRoomMessagesController);

// Open or get direct message room
router.post("/direct", getOrCreateDirectRoomController);

// Head / Management: Create channels
router.post(
  "/channel",
  authorize(PERMISSIONS.CHAT_MANAGE),
  createChannelController,
);

export default router;
