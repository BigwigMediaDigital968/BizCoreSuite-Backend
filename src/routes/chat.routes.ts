import { Router } from "express";
import {
  createChannelController,
  getOrCreateDirectRoomController,
  getRoomMessagesController,
  getUserChatSettingsController,
  getUserRoomsController,
  listChatUsersController,
  markRoomReadController,
  updateUserChatSettingsController,
} from "../controllers/chat.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/authorize.middleware.js";
import { PERMISSIONS } from "../constants/permissions.js";

const router = Router();

// Chat is open to every signed-in user; access to each room is decided by
// room membership inside the controllers, not by role permissions.
router.use(authenticate);

// Rooms the current user is a member of
router.get("/rooms", getUserRoomsController);

// Messages for a room (members only)
router.get("/rooms/:roomId/messages", getRoomMessagesController);

// Mark a room as read (members only)
router.post("/rooms/:roomId/read", markRoomReadController);

// People the current user can start a direct message with
router.get("/users", listChatUsersController);

// Head / admin: a user's direct-message switch
router.get(
  "/users/:userId/settings",
  authorize(PERMISSIONS.CHAT_MANAGE),
  getUserChatSettingsController,
);
router.patch(
  "/users/:userId/settings",
  authorize(PERMISSIONS.CHAT_MANAGE),
  updateUserChatSettingsController,
);

// Open or get direct message room
router.post("/direct", getOrCreateDirectRoomController);

// Head / Management: Create channels
router.post(
  "/channel",
  authorize(PERMISSIONS.CHAT_MANAGE),
  createChannelController,
);

export default router;
