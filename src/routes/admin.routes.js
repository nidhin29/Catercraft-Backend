import { Router } from "express";
import { 
    login, 
    viewAllBookings, 
    viewAllOwners, 
    getAllCustomers, 
    deleteOwner, 
    getRevenueAnalytics 
} from "../controllers/admin.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";

const router = Router();

// Public route
router.route("/login").post(login);

// Protected routes (Only Admin - role 0)
router.use(verifyJWT, authorizeRoles(0));

router.route("/view_all_bookings").get(viewAllBookings);
router.route("/view_all_owners").get(viewAllOwners);
router.route("/get_all_customers").get(getAllCustomers);
router.route("/delete_owner").delete(deleteOwner);
router.route("/analytics/revenue").get(getRevenueAnalytics);

export default router;
