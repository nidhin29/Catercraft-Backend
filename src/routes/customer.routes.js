import { Router } from "express";
import { 
    registerCustomer, 
    loginCustomer, 
    logoutCustomer,
    sendOtpCustomer,
    verifyOtpCustomer,
    googleLoginCustomer
} from "../controllers/customer.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.route("/register").post(registerCustomer);
router.route("/login").post(loginCustomer);
router.route("/send-otp").post(sendOtpCustomer);
router.route("/verify-otp").post(verifyOtpCustomer);
router.route("/google-login").post(googleLoginCustomer);

// Protected routes
router.route("/logout").post(verifyJWT, logoutCustomer);

export default router;
