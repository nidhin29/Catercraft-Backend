import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Customer } from "../models/customer.model.js";
import { redisClient } from "../db/redis.js";
import { sendEmail } from "../utils/sendEmail.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (customerId) => {
    try {
        const customer = await Customer.findById(customerId)
        const accessToken = customer.generateAccessToken()
        const refreshToken = customer.generateRefreshToken()

        customer.refreshToken = refreshToken
        await customer.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating tokens")
    }
}

const loginCustomer = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const customer = await Customer.findOne({ email })

    if (!customer) {
        throw new ApiError(404, "Customer does not exist")
    }

    const isPasswordValid = await customer.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(customer._id)

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { customer, accessToken, refreshToken }, "Logged in successfully")
        )
})

const sendOtpCustomer = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    await redisClient.setEx(`otp:customer:${email}`, 900, otp.toString());

    try {
        await sendEmail({
            email,
            subject: "Your Catering Verification OTP",
            message: `Your verification code is ${otp}. It will expire in 15 minutes.`
        });
    } catch (error) {
        throw new ApiError(500, "Failed to send OTP email");
    }

    return res.status(200).json(new ApiResponse(200, null, "OTP sent successfully"));
});

const verifyOtpCustomer = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ApiError(400, "Email and OTP are required");
    }

    const cachedOtp = await redisClient.get(`otp:customer:${email}`);
    if (!cachedOtp || cachedOtp !== otp.toString()) {
        throw new ApiError(400, "Invalid or expired OTP");
    }

    let customer = await Customer.findOne({ email });

    if (!customer) {
        // Handle pending registration if we implement the 'signup:data' pattern later
        // For now, let's assume they might be creating an account via OTP directly
        throw new ApiError(404, "Customer not found. Please register first.");
    }

    customer.isEmailVerified = true;
    await customer.save();

    await redisClient.del(`otp:customer:${email}`);

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(customer._id);

    return res.status(200).json(new ApiResponse(200, { customer, accessToken, refreshToken }, "Email verified successfully"));
});

const googleLoginCustomer = asyncHandler(async (req, res) => {
    const { tokenID } = req.body;
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID_WEB);

    const ticket = await client.verifyIdToken({
        idToken: tokenID,
        audience: [process.env.GOOGLE_CLIENT_ID_WEB, process.env.GOOGLE_CLIENT_ID_APP]
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    let customer = await Customer.findOne({ email });

    if (!customer) {
        // Create new customer if not exists
        customer = await Customer.create({
            email,
            fullName: name,
            password: Math.random().toString(36).slice(-10),
            role: 3,
            isEmailVerified: true
        });
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(customer._id);

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { customer, accessToken, refreshToken }, "Logged in via Google successfully"));
});

const registerCustomer = asyncHandler(async (req, res) => {
    const { fullName, email, password } = req.body;

    if ([fullName, email, password].some(field => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await Customer.findOne({ email })
    if (existedUser) {
        throw new ApiError(409, "User with email already exists")
    }

    const customer = await Customer.create({
        fullName,
        email,
        password,
        role: 3
    })

    const createdUser = await Customer.findById(customer._id).select("-password -refreshToken")

    return res.status(201).json(new ApiResponse(200, createdUser, "Registered successfully"))
})

const logoutCustomer = asyncHandler(async (req, res) => {
    const email = req.user?.email || req.body?.email;

    if (email) {
        await Customer.findOneAndUpdate(
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

export {
    loginCustomer,
    registerCustomer,
    logoutCustomer,
    sendOtpCustomer,
    verifyOtpCustomer,
    googleLoginCustomer
}
