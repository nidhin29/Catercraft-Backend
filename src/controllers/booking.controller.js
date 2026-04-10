import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Service } from "../models/service.model.js";
import { Booking } from "../models/booking.model.js";
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
    }).populate("service")

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

export {
    viewAllServices,
    bookService,
    viewUserBookings,
    generateRazorpayOrder
}
