import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Booking } from "../models/booking.model.js";
import { Owner } from "../models/owner.model.js";
import { publishToQueue } from "../config/rabbitmq.js";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const createOrder = asyncHandler(async (req, res) => {
    const { booking_id } = req.body;

    if (!booking_id) {
        throw new ApiError(400, "Booking ID is required");
    }

    const booking = await Booking.findById(booking_id).populate("service");
    if (!booking) {
        throw new ApiError(404, "Booking not found");
    }

    const options = {
        amount: booking.service.rate * 100, // Amount in paise
        currency: "INR",
        receipt: `receipt_${booking._id}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        
        // Update booking with the order ID
        booking.razorpay_order_id = order.id;
        await booking.save();

        return res.status(200).json(
            new ApiResponse(200, order, "Razorpay order generated successfully")
        );
    } catch (error) {
        console.error("Razorpay Error:", error);
        throw new ApiError(500, error.message || "Error generating Razorpay order");
    }
});

const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new ApiError(400, "All payment details are required for verification");
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

    const isMatch = expectedSignature === razorpay_signature;

    if (isMatch) {
        // Find booking and update status
        const booking = await Booking.findOne({ razorpay_order_id }).populate("service");
        if (!booking) {
            throw new ApiError(404, "Booking linked to this order not found");
        }

        // Calculate Commission Split (10% Admin, 90% Owner)
        const total = booking.service?.rate || 0;
        const commission = total * 0.10;
        const payout = total - commission;

        booking.razorpay_payment_id = razorpay_payment_id;
        booking.payment_status = "Paid";
        booking.total_amount = total;
        booking.admin_commission = commission;
        booking.owner_payout = payout;
        
        await booking.save();

        // Notify Owner via Push Notification
        try {
            const owner = await Owner.findOne({ email: booking.owner_email });
            if (owner) {
                await publishToQueue('push_queue', {
                    userId: owner._id, 
                    userType: "Owner", 
                    payload: {
                        title: "Payment Received! 💰",
                        body: `Customer paid ₹${total} for ${booking.service?.service_name || 'Booking'}.`,
                        data: {
                            booking_id: booking._id.toString(),
                            type: "payment_received"
                        }
                    }
                });
            }
        } catch (notifyError) {
            console.error("Non-critical Owner Notification Error:", notifyError);
        }

        return res.status(200).json(
            new ApiResponse(200, booking, "Payment verified and updated successfully")
        );
    } else {
        throw new ApiError(400, "Invalid payment signature. Verification failed.");
    }
});

export {
    createOrder,
    verifyPayment
}
