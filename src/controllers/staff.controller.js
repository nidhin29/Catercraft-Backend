import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Staff } from "../models/staff.model.js";
import { uploadToS3 } from "../utils/s3Upload.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (staffId) => {
    try {
        const staff = await Staff.findById(staffId)
        const accessToken = staff.generateAccessToken()
        const refreshToken = staff.generateRefreshToken()

        staff.refreshToken = refreshToken
        await staff.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating tokens")
    }
}

const loginStaff = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const staff = await Staff.findOne({ email, role: 2 })

    if (!staff) {
        throw new ApiError(404, "Staff account does not exist")
    }

    const isPasswordValid = await staff.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(staff._id)

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { staff, accessToken, refreshToken }, "Logged in successfully")
        )
})





const logoutStaff = asyncHandler(async (req, res) => {
    const email = req.user?.email || req.body?.email;

    if (email) {
        await Staff.findOneAndUpdate(
            { email },
            { $unset: { refreshToken: 1 } },
            { new: true }
        )
    }

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "Logged out successfully"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )

        const staff = await Staff.findById(decodedToken?._id)

        if (!staff) {
            throw new ApiError(401, "Invalid refresh token")
        }

        if (incomingRefreshToken !== staff?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshToken(staff._id)

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed"
                )
            )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const getStaffProfile = asyncHandler(async (req, res) => {
    const staff = await Staff.findById(req.user._id).select("-password -refreshToken").populate("owner", "companyName companyLogo");

    if (!staff) {
        throw new ApiError(404, "Staff profile not found");
    }

    return res.status(200).json(new ApiResponse(200, staff, "Staff profile fetched successfully"));
});

const updateStaffAccount = asyncHandler(async (req, res) => {
    const { fullName, fcmToken } = req.body;
    const updateData = {};

    if (fullName) updateData.fullName = fullName;
    if (fcmToken) updateData.fcmToken = fcmToken;

    // Handle Profile Image Upload
    const profileImageFile = req.files?.profileImage?.[0];
    if (profileImageFile) {
        const s3Result = await uploadToS3(profileImageFile, "staff-profiles", true);
        updateData.profileImage = s3Result.url;
        updateData.profileImageThumbnail = s3Result.thumbnailUrl;
    }

    if (Object.keys(updateData).length === 0) {
        throw new ApiError(400, "No changes provided");
    }

    const staff = await Staff.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json(new ApiResponse(200, staff, "Profile updated successfully"));
});

const updateStaffPassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old and new passwords are required");
    }

    const staff = await Staff.findById(req.user._id);

    const isPasswordCorrect = await staff.isPasswordCorrect(oldPassword);
    if (!isPasswordCorrect) {
        throw new ApiError(401, "Invalid old password");
    }

    staff.password = newPassword;
    await staff.save();

    return res.status(200).json(new ApiResponse(200, {}, "Password updated successfully"));
});

export {
    loginStaff,
    logoutStaff,
    getStaffProfile,
    updateStaffAccount,
    updateStaffPassword,
    refreshAccessToken
}
