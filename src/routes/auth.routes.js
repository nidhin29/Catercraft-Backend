import { Router } from "express";
import { refreshAccessToken, validateToken } from "../controllers/auth.controller.js";

const router = Router();

router.route("/refresh-token").post(refreshAccessToken);
router.route("/validate-token").get(validateToken);

export default router;
