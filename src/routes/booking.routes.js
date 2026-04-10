import { Router } from "express";
import { 
    viewAllServices, 
    bookService, 
    viewUserBookings, 
    generateRazorpayOrder 
} from "../controllers/booking.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// Customer specific
router.route("/Customer/view-all-services").get(viewAllServices);
router.route("/Customer/book-service").post(bookService);

// Common User specific
// Backward compatibility: GET route supporting BODY via controller logic
router.route("/User/view-bookings").get(viewUserBookings).post(viewUserBookings);

// Premium Features
router.route("/booking/pay-deposit").post(verifyJWT, generateRazorpayOrder);

export default router;
