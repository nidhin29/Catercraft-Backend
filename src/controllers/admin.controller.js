import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Admin } from "../models/admin.model.js";
import { Staff } from "../models/staff.model.js";
import { Owner } from "../models/owner.model.js";
import { Customer } from "../models/customer.model.js";
import { Booking } from "../models/booking.model.js";
import { publishToQueue } from "../config/rabbitmq.js";

const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const admin = await Admin.findOne({ email })

    if (!admin) {
        throw new ApiError(404, "Admin does not exist")
    }

    const isPasswordValid = await admin.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials")
    }

    const accessToken = admin.generateAccessToken()
    const refreshToken = admin.generateRefreshToken()

    admin.refreshToken = refreshToken
    await admin.save({ validateBeforeSave: false })

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { admin, accessToken, refreshToken }, "Admin logged in successfully")
        )
})

const viewAllBookings = asyncHandler(async (req, res) => {
    const bookings = await Booking.find().populate("service")
    return res.status(200).json(new ApiResponse(200, bookings, "All bookings fetched"))
})

const viewAllOwners = asyncHandler(async (req, res) => {
    const owners = await Owner.find().select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, owners, "All owners fetched"))
})

const getPendingOwners = asyncHandler(async (req, res) => {
    const owners = await Owner.find({ verificationStatus: "pending" }).select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, owners, "Pending owners fetched"))
})

const updateOwnerVerification = asyncHandler(async (req, res) => {
    const { ownerId } = req.params;
    const { status, remarks } = req.body; // status: 'verified' or 'rejected'

    if (!['verified', 'rejected'].includes(status)) {
        throw new ApiError(400, "Invalid status. Use 'verified' or 'rejected'")
    }

    const owner = await Owner.findByIdAndUpdate(
        ownerId,
        {
            $set: {
                verificationStatus: status,
                adminRemarks: remarks || ""
            }
        },
        { new: true }
    ).select("-password -refreshToken")

    if (!owner) {
        throw new ApiError(404, "Owner not found")
    }

    // Notify Owner of verification update via Push
    if (status === "verified") {
        try {
            await publishToQueue('push_queue', {
                userId: ownerId, 
                userType: "Owner", 
                payload: {
                    title: "License Verified! ✅",
                    body: "Your catering license has been approved. You can now start receiving bookings.",
                    data: { type: "verification_success" }
                }
            });
        } catch (notifyError) {
            console.error("Non-critical Verification Notification Error:", notifyError);
        }
    } else if (status === "rejected") {
        try {
            await publishToQueue('push_queue', {
                userId: ownerId, 
                userType: "Owner", 
                payload: {
                    title: "Verification Update",
                    body: "There was an issue with your license verification. Please check the app for details.",
                    data: { type: "verification_rejected" }
                }
            });
        } catch (notifyError) {
            console.error("Non-critical Verification Notification Error:", notifyError);
        }
    }

    return res.status(200).json(new ApiResponse(200, owner, `Owner status updated to ${status}`))
})

const getAllCustomers = asyncHandler(async (req, res) => {
    const customers = await Customer.find().select("-password -refreshToken")
    return res.status(200).json(new ApiResponse(200, customers, "All customers fetched"))
})

const deleteOwner = asyncHandler(async (req, res) => {
    const { email_id_owner } = req.body;

    if (!email_id_owner) {
        throw new ApiError(400, "Owner email is required")
    }

    const owner = await Owner.findOne({ email: email_id_owner });
    if (!owner) {
        throw new ApiError(404, "Owner not found")
    }

    // 1. Handle Staff Accounts
    const staffMembers = await Staff.find({ owner: owner._id });
    for (const staff of staffMembers) {
        // Send push notification to trigger staff app logout
        try {
            await publishToQueue('push_queue', {
                userId: staff._id, 
                userType: "Staff", 
                payload: {
                    title: "Account Terminated",
                    body: "Your staff account has been removed as the associated partner account was terminated.",
                    data: { type: "account_deleted", action: "force_logout" }
                }
            });
        } catch (notifyError) {
            console.error(`Failed to send logout push to staff ${staff.email}:`, notifyError);
        }

        // Send email to staff
        try {
            await publishToQueue('email_queue', {
                email: staff.email,
                subject: "Account Terminated - Catering Partners",
                message: `Hello ${staff.fullName || 'Staff Member'},\n\nYour staff account on our platform has been removed because the main catering partner account you were associated with has been terminated.\n\nIf you have any questions, please contact your employer or our support team.\n\nRegards,\nThe Catering Admin Team`
            });
        } catch (emailError) {
            console.error(`Failed to send termination email to staff ${staff.email}:`, emailError);
        }
    }
    
    // Delete all associated staff records
    await Staff.deleteMany({ owner: owner._id });

    // 2. Send push notification to trigger owner app logout
    try {
        await publishToQueue('push_queue', {
            userId: owner._id, 
            userType: "Owner", 
            payload: {
                title: "Account Terminated",
                body: "Your account has been removed by the administration.",
                data: { type: "account_deleted", action: "force_logout" }
            }
        });
    } catch (notifyError) {
        console.error("Non-critical Notification Error:", notifyError);
    }

    // 3. Send email notification to owner
    try {
        await publishToQueue('email_queue', {
            email: owner.email,
            subject: "Account Terminated - Catering Partners",
            message: `Hello ${owner.companyName || owner.username || 'Partner'},\n\nYour catering partner account has been removed from our platform by the administration. You will no longer be able to log in or receive new bookings. All associated staff accounts have also been removed.\n\nIf you believe this is an error or wish to appeal, please contact support.\n\nRegards,\nThe Catering Admin Team`
        });
    } catch (emailError) {
        console.error("Non-critical Email Error:", emailError);
    }

    await Owner.findByIdAndDelete(owner._id);

    return res.status(200).json(new ApiResponse(200, {}, "Owner and associated staff deleted successfully"))
})

const getRevenueAnalytics = asyncHandler(async (req, res) => {
    // Premium Analytics: Group admin commission (revenue) by month
    const analytics = await Booking.aggregate([
        {
            $match: { payment_status: "Paid" }
        },
        {
            $group: {
                _id: { $month: "$createdAt" },
                totalRevenue: { $sum: "$admin_commission" },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ])

    return res.status(200).json(new ApiResponse(200, analytics, "Revenue analytics fetched"))
})

const getDashboardStats = asyncHandler(async (req, res) => {
    const totalOwners = await Owner.countDocuments();
    const totalBookings = await Booking.countDocuments();
    
    // Monthly Revenue Trend (Admin Commission only)
    const revenueTrend = await Booking.aggregate([
        {
            $match: { payment_status: "Paid" }
        },
        {
            $group: {
                _id: { $month: "$createdAt" },
                totalRevenue: { $sum: "$admin_commission" },
                bookingCount: { $sum: 1 }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    const totalRevenue = revenueTrend.reduce((acc, curr) => acc + curr.totalRevenue, 0);

    return res.status(200).json(
        new ApiResponse(200, {
            totalOwners,
            totalBookings,
            totalRevenue,
            revenueTrend
        }, "Dashboard stats fetched successfully")
    );
})

export {
    login,
    viewAllBookings,
    viewAllOwners,
    getPendingOwners,
    updateOwnerVerification,
    getAllCustomers,
    deleteOwner,
    getRevenueAnalytics,
    getDashboardStats
}
