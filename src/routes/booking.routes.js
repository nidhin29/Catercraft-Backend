import { Router } from "express";
import { 
    viewAllServices, 
    bookService, 
    viewUserBookings, 
    generateRazorpayOrder,
    updateBookingStatus,
    assignStaffToBooking,
    getStaffTasks
} from "../controllers/booking.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Customer specific
router.route("/Customer/view-all-services").get(viewAllServices);
router.route("/Customer/book-service").post(verifyJWT, bookService);

// Common User specific
// Backward compatibility: GET route supporting BODY via controller logic
router.route("/User/view-bookings").get(verifyJWT, viewUserBookings).post(verifyJWT, viewUserBookings);

// Premium Features
router.route("/booking/pay-deposit").post(verifyJWT, generateRazorpayOrder);

// Management Features
router.route("/update-status").patch(
    verifyJWT,
    authorizeRoles(1, 2), // Owner or Staff
    updateBookingStatus
);

router.route("/assign-staff").patch(
    verifyJWT,
    authorizeRoles(1), // Only Owner can assign
    assignStaffToBooking
);

router.route("/staff-tasks").get(
    verifyJWT,
    authorizeRoles(2), // Only Staff
    getStaffTasks
);

export default router;
