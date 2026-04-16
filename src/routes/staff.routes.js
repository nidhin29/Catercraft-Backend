import { Router } from "express";
import { 
    loginStaff, 
    logoutStaff,
    getStaffProfile,
    updateStaffAccount,
    updateStaffPassword
} from "../controllers/staff.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

// Public routes
router.route("/login").post(loginStaff);

// Protected routes
router.route("/logout").post(verifyJWT, logoutStaff);
router.route("/get-profile").get(verifyJWT, getStaffProfile);
router.route("/update-profile").patch(
    verifyJWT,
    upload.fields([{ name: "profileImage", maxCount: 1 }]),
    updateStaffAccount
);
router.route("/update-password").patch(verifyJWT, updateStaffPassword);

export default router;
