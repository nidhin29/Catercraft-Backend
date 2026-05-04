import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Service } from "../models/service.model.js";
import { Booking } from "../models/booking.model.js";
import { Owner } from "../models/owner.model.js";
import { Staff } from "../models/staff.model.js";
import { publishToQueue } from "../config/rabbitmq.js";
import Razorpay from "razorpay";

const viewAllServices = asyncHandler(async (req, res) => {
    const services = await Service.find()
    return res.status(200).json(new ApiResponse(200, services, "All services fetched"))
})

const bookService = asyncHandler(async (req, res) => {
    const { service_id, email_id_customer, datetime } = req.body;

    if (!service_id || !email_id_customer || !datetime) {
        throw new ApiError(400, "Service ID, customer email and datetime are required")
    }

    const service = await Service.findById(service_id)
    if (!service) {
        throw new ApiError(404, "Service not found")
    }

    const booking = await Booking.create({
        service: service_id,
        customer_email: email_id_customer,
        owner_email: service.owner_email,
        datetime: new Date(datetime)
    })

    // Real-time notification to owner
    const io = req.app.get("io")
    io.emit(`new_booking_${service.owner_email}`, {
        message: "New booking received!",
        booking_id: booking._id
    })

    return res.status(201).json(new ApiResponse(200, booking, "Service booked successfully"))
})

const viewUserBookings = asyncHandler(async (req, res) => {
    // Support email in body even on GET for legacy app compatibility
    const email = req.body?.owner_email || req.query?.owner_email || req.body?.customer_email || req.query?.customer_email || req.user?.email;

    if (!email) {
        throw new ApiError(400, "Email identifier is missing")
    }

    const bookings = await Booking.find({
        $or: [
            { owner_email: email },
            { customer_email: email }
        ]
    }).populate("service").populate("assignedStaff", "fullName email role profileImageThumbnail");

    return res.status(200).json(new ApiResponse(200, bookings, "Bookings fetched successfully"))
})

const generateRazorpayOrder = asyncHandler(async (req, res) => {
    const { booking_id } = req.body;

    const booking = await Booking.findById(booking_id).populate("service")
    if (!booking) {
        throw new ApiError(404, "Booking not found")
    }

    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
        amount: booking.service.rate * 100, // Amount in paise
        currency: "INR",
        receipt: `receipt_${booking._id}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        booking.razorpay_order_id = order.id;
        await booking.save();

        return res.status(200).json(new ApiResponse(200, order, "Razorpay order generated"));
    } catch (error) {
        throw new ApiError(500, "Error generating Razorpay order");
    }
})

const updateBookingStatus = asyncHandler(async (req, res) => {
    const { booking_id, new_status } = req.body;

    if (!booking_id || !new_status) {
        throw new ApiError(400, "Booking ID and new status are required");
    }

    const booking = await Booking.findById(booking_id);
    if (!booking) {
        throw new ApiError(404, "Booking not found");
    }

    // Role-Based Authorization
    const role = req.user.role;
    
    if (role === 1) { // Owner
        if (req.user.email !== booking.owner_email) {
            throw new ApiError(403, "You are not authorized to update this booking");
        }
    } else if (role === 2) { // Staff
        // Verify staff belongs to the owner of this booking
        const bookingOwner = await Owner.findOne({ email: booking.owner_email });
        if (!bookingOwner || req.user.owner?.toString() !== bookingOwner._id.toString()) {
            throw new ApiError(403, "You do not have permission to manage this owner's bookings");
        }
    } else {
        throw new ApiError(403, "Access denied");
    }

    // Update Status with Normalization
    let normalizedStatus = new_status === "Accepted" ? "Approved" : new_status;
    if (normalizedStatus === "Completed") normalizedStatus = "Finished";
    
    booking.work_status = normalizedStatus;
    await booking.save();

    // Customer Email on Approval
    if (normalizedStatus === "Approved") {
        try {
            const bookingForEmail = await Booking.findById(booking_id).populate("service");
            await publishToQueue('email_queue', {
                email: booking.customer_email,
                subject: "Booking Approved! | CaterCraft",
                message: `Hello,\n\nYour booking for ${bookingForEmail.service.service_name} has been approved. You can now complete your payment through the customer dashboard.\n\nThank you for choosing CaterCraft!`
            });
        } catch (emailError) {
            console.error("Non-critical Email Error:", emailError);
        }
    }

    // Real-time Notification to Customer
    const io = req.app.get("io");
    if (io) {
        io.emit(`booking_status_updated_${booking.customer_email}`, {
            booking_id: booking._id,
            status: new_status,
            message: `Your booking status has been updated to ${new_status}`
        });
    }

    return res.status(200).json(
        new ApiResponse(200, booking, `Booking status successfully updated to ${new_status}`)
    );
});

const assignStaffToBooking = asyncHandler(async (req, res) => {
    const { booking_id, staffIds } = req.body;

    if (!booking_id || !Array.isArray(staffIds)) {
        throw new ApiError(400, "Booking ID and an array of Staff IDs are required");
    }

    const booking = await Booking.findById(booking_id);
    if (!booking) {
        throw new ApiError(404, "Booking not found");
    }

    // Authorization: Only the owner of this booking can assign staff
    if (req.user.email !== booking.owner_email) {
        throw new ApiError(403, "You are not authorized to assign staff to this booking");
    }

    // Verify all staffIds belong to this owner
    const staffCount = await Staff.countDocuments({
        _id: { $in: staffIds },
        owner: req.user._id
    });

    if (staffCount !== staffIds.length) {
        throw new ApiError(400, "One or more selected staff members do not belong to your business");
    }

    booking.assignedStaff = staffIds;
    await booking.save();

    // Notify staff via Socket.io & Push
    const io = req.app.get("io");
    staffIds.forEach(staffId => {
        // Socket.io
        if (io) {
            io.emit(`new_assignment_${staffId}`, {
                booking_id: booking._id,
                message: "You have been assigned to a new task!"
            });
        }
        
        // FCM Push Notification
        publishToQueue('push_queue', {
            userId: staffId, 
            userType: "Staff", 
            payload: {
                title: "New Assignment",
                body: `You have been assigned to a new task: ${booking.service?.service_name || 'Event Assignment'}`,
                data: { 
                    booking_id: booking._id?.toString(),
                    type: "assignment"
                }
            }
        }).catch(err => console.error("RabbitMQ Push Error:", err));
    });

    return res.status(200).json(
        new ApiResponse(200, booking, "Staff successfully assigned to booking")
    );
});

const getStaffTasks = asyncHandler(async (req, res) => {
    const tasks = await Booking.find({
        assignedStaff: req.user._id
    })
    .populate("service")
    .sort({ datetime: 1 });

    return res.status(200).json(
        new ApiResponse(200, tasks, "Assigned tasks fetched successfully")
    );
});

export {
    viewAllServices,
    bookService,
    viewUserBookings,
    generateRazorpayOrder,
    updateBookingStatus,
    assignStaffToBooking,
    getStaffTasks
}
