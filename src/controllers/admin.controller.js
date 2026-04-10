import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Booking } from "../models/booking.model.js";

const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const user = await User.findOne({ email })

    if (!user || user.role !== 0) {
        throw new ApiError(404, "Admin does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials")
    }

    const accessToken = user.generateAccessToken()
    const refreshToken = user.generateRefreshToken()

    user.refreshToken = refreshToken
    await user.save({ validateBeforeSave: false })

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { user, accessToken, refreshToken }, "Admin logged in successfully")
        )
})

const viewAllBookings = asyncHandler(async (req, res) => {
    const bookings = await Booking.find().populate("service")
    return res.status(200).json(new ApiResponse(200, bookings, "All bookings fetched"))
})

const viewAllOwners = asyncHandler(async (req, res) => {
    const owners = await User.find({ role: 1 }).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, owners, "All owners fetched"))
})

const getAllCustomers = asyncHandler(async (req, res) => {
    const customers = await User.find({ role: 3 }).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, customers, "All customers fetched"))
})

const deleteOwner = asyncHandler(async (req, res) => {
    const { email_id_owner } = req.body;

    if (!email_id_owner) {
        throw new ApiError(400, "Owner email is required")
    }

    const deletedOwner = await User.findOneAndDelete({ email: email_id_owner, role: 1 })

    if (!deletedOwner) {
        throw new ApiError(404, "Owner not found")
    }

    return res.status(200).json(new ApiResponse(200, {}, "Owner deleted successfully"))
})

const getRevenueAnalytics = asyncHandler(async (req, res) => {
    // Premium Analytics: Group revenue by month
    const analytics = await Booking.aggregate([
        {
            $match: { payment_status: "Paid" }
        },
        {
            $lookup: {
                from: "services",
                localField: "service",
                foreignField: "_id",
                as: "serviceDetails"
            }
        },
        { $unwind: "$serviceDetails" },
        {
            $group: {
                _id: { $month: "$createdAt" },
                totalRevenue: { $sum: "$serviceDetails.rate" },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ])

    return res.status(200).json(new ApiResponse(200, analytics, "Revenue analytics fetched"))
})

export {
    login,
    viewAllBookings,
    viewAllOwners,
    getAllCustomers,
    deleteOwner,
    getRevenueAnalytics
}
