import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema(
    {
        customer: {
            type: Schema.Types.ObjectId,
            ref: "Customer",
            required: true
        },
        service: {
            type: Schema.Types.ObjectId,
            ref: "Service",
            required: true
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "Owner",
            required: true
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        message: {
            type: String,
            required: true
        },
        isFeatured: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

export const Review = mongoose.model("Review", reviewSchema);
