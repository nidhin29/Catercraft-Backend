import { Router } from "express";
import { 
    getChatHistory, 
    getRecentConversations, 
    markMessagesAsRead,
    uploadChatMedia,
    deleteChatMessage
} from "../controllers/chat.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// All chat routes are protected
router.use(verifyJWT);

router.route("/history/:roomId").get(getChatHistory);
router.route("/recent").get(getRecentConversations);
router.route("/mark-as-read/:roomId").patch(markMessagesAsRead);
router.route("/upload").post(upload.single("image"), uploadChatMedia);
router.route("/delete/:messageId").delete(deleteChatMessage);

export default router;
