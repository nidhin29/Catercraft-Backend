import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Review } from "../models/review.model.js";
import { Booking } from "../models/booking.model.js";
import { Owner } from "../models/owner.model.js";

const addReview = asyncHandler(async (req, res) => {
    const { booking_id, rating, message } = req.body;
    const customerId = req.user._id;

    if (!booking_id || !rating || !message) {
        throw new ApiError(400, "Booking ID, rating and message are required");
    }

    const booking = await Booking.findById(booking_id).populate("service");
    if (!booking) {
        throw new ApiError(404, "Booking not found");
    }

    // Only allow reviews for completed and paid bookings
    if (booking.work_status !== "Completed" || booking.payment_status !== "Paid") {
        throw new ApiError(400, "You can only review completed and paid bookings");
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ customer: customerId, service: booking.service._id });
    if (existingReview) {
        throw new ApiError(409, "You have already reviewed this service");
    }

    // Find the owner by their email
    const owner = await Owner.findOne({ email: booking.service.owner_email });
    if (!owner) {
        throw new ApiError(404, "Owner not found for this service");
    }

    const review = await Review.create({
        customer: customerId,
        service: booking.service._id,
        owner: owner._id,
        rating,
        message
    });

    return res.status(201).json(new ApiResponse(201, review, "Review added successfully"));
});

const getFeaturedReviews = asyncHandler(async (req, res) => {
    // For now, return top rated reviews or ones marked as featured
    // Later can implement more complex curation
    const reviews = await Review.find({ isFeatured: true })
        .populate("customer", "fullName")
        .populate("service", "service_name")
        .limit(10);

    // If no featured reviews, return latest top-rated ones
    if (reviews.length === 0) {
        const topReviews = await Review.find({ rating: { $gte: 4 } })
            .populate("customer", "fullName")
            .populate("service", "service_name")
            .sort({ createdAt: -1 })
            .limit(10);
        return res.status(200).json(new ApiResponse(200, topReviews, "Featured reviews fetched"));
    }

    return res.status(200).json(new ApiResponse(200, reviews, "Featured reviews fetched"));
});

const getServiceReviews = asyncHandler(async (req, res) => {
    const { serviceId } = req.params;
    const reviews = await Review.find({ service: serviceId })
        .populate("customer", "fullName")
        .sort({ createdAt: -1 });

    return res.status(200).json(new ApiResponse(200, reviews, "Service reviews fetched"));
});

export {
    addReview,
    getFeaturedReviews,
    getServiceReviews
};
