import { Router } from "express";
import {
    registerOwner,
    loginOwner,
    addService,
    logoutOwner,
    sendOtpOwner,
    verifyOtpOwner,
    googleLoginOwner,
    googleRegisterOwner,
    getOwnerStaff,
    getOwnerServices,
    getOwnerDetails,
    updateOwnerProfile,
    addStaff,
    refreshAccessToken
} from "../controllers/owner.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.route("/login").post(loginOwner);
router.route("/register-owner").post(
    upload.fields([
        { name: "license", maxCount: 1 },
        { name: "logo", maxCount: 1 }
    ]), 
    registerOwner
);
router.route("/send-otp").post(sendOtpOwner);
router.route("/verify-otp").post(verifyOtpOwner);
router.route("/google-login").post(googleLoginOwner);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/google-register").post(
    upload.fields([
        { name: "license", maxCount: 1 },
        { name: "logo", maxCount: 1 }
    ]),
    googleRegisterOwner
);

// Protected routes
router.route("/logout").post(verifyJWT, logoutOwner);
router.route("/view-staff").get(verifyJWT, getOwnerStaff);
router.route("/view-services").get(verifyJWT, getOwnerServices);
router.route("/get-details").get(verifyJWT, getOwnerDetails);

router.route("/update-profile").patch(
    verifyJWT,
    upload.fields([{ name: "logo", maxCount: 1 }]),
    updateOwnerProfile
);

router.route("/add-service").post(
    verifyJWT,
    authorizeRoles(1), // Only Owner
    upload.single("image"),
    addService
);

router.route("/add-staff").post(
    verifyJWT,
    authorizeRoles(1), // Only Owner
    addStaff
);

export default router;
