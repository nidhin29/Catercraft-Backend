import { Router } from "express";
import { 
    loginUser, 
    registerCustomer, 
    registerOwner, 
    addService, 
    logoutUser 
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.route("/login").post(loginUser);
router.route("/register-customer").post(registerCustomer);
router.route("/register-owner").post(
    upload.single("license_document"), 
    registerOwner
);

// Protected routes
router.route("/api/UserLogout").post(logoutUser); // Support body email

router.route("/User/add-service").post(
    verifyJWT, 
    authorizeRoles(1), // Only Owner
    upload.single("image"), 
    addService
);

export default router;
