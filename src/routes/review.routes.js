import { Router } from "express";
import { 
    addReview, 
    getFeaturedReviews, 
    getServiceReviews 
} from "../controllers/review.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Public routes
router.route("/featured").get(getFeaturedReviews);
router.route("/service/:serviceId").get(getServiceReviews);

// Protected routes
router.route("/add").post(verifyJWT, addReview);

export default router;
