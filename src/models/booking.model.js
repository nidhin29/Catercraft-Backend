import mongoose, { Schema } from "mongoose";

const bookingSchema = new Schema(
    {
        service: {
            type: Schema.Types.ObjectId,
            ref: "Service",
            required: true
        },
        customer_email: {
            type: String,
            required: true,
            index: true
        },
        owner_email: {
            type: String,
            required: true,
            index: true
        },
        datetime: {
            type: Date,
            required: true
        },
        payment_status: {
            type: String,
            enum: ["Paid", "Unpaid"],
            default: "Unpaid"
        },
        work_status: {
            type: String,
            enum: ["Pending", "Accepted", "Approved", "In Kitchen", "Dispatched", "Completed", "Cancelled"],
            default: "Pending"
        },
        razorpay_order_id: {
            type: String,
        },
        razorpay_payment_id: {
            type: String,
        },
        total_amount: {
            type: Number,
        },
        admin_commission: {
            type: Number,
        },
        owner_payout: {
            type: Number,
        },
        assignedStaff: [
            {
                type: Schema.Types.ObjectId,
                ref: "Staff"
            }
        ]
    },
    {
        timestamps: true
    }
)

export const Booking = mongoose.model("Booking", bookingSchema)
