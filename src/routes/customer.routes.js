import { Router } from "express";
import { 
    registerCustomer, 
    loginCustomer, 
    logoutCustomer,
    sendOtpCustomer,
    verifyOtpCustomer,
    googleLoginCustomer,
    getCurrentCustomerProfile,
    updateCustomerProfile,
    refreshAccessToken
} from "../controllers/customer.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.route("/register").post(registerCustomer);
router.route("/login").post(loginCustomer);
router.route("/send-otp").post(sendOtpCustomer);
router.route("/verify-otp").post(verifyOtpCustomer);
router.route("/google-login").post(googleLoginCustomer);
router.route("/refresh-token").post(refreshAccessToken);

// Protected routes
router.route("/logout").post(verifyJWT, logoutCustomer);
router.route("/profile").get(verifyJWT, getCurrentCustomerProfile);
router.route("/update-profile").patch(verifyJWT, updateCustomerProfile);

export default router;
