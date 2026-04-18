import { Router } from "express";
import { updatePublicKey, getPublicKey } from "../controllers/security.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT); // All security routes require authentication

router.route("/update-public-key").patch(updatePublicKey);
router.route("/get-public-key/:userId").get(getPublicKey);

export default router;
