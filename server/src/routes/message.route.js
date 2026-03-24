import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { 
  getMessages, 
  getUsersForSidebar, 
  sendMessage,
  deleteMessage,
  editMessage,
  reactToMessage
} from "../controllers/message.controller.js";

const router = express.Router();

router.get("/users", protectRoute, getUsersForSidebar);
router.get("/:id", protectRoute, getMessages);
router.post("/send/:id", protectRoute, sendMessage);

// NEW ENDPOINTS
router.delete("/delete/:id", protectRoute, deleteMessage);
router.put("/edit/:id", protectRoute, editMessage);
router.post("/react/:id", protectRoute, reactToMessage);

export default router;