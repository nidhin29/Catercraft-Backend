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

    // Check if user exists OR if there's a pending registration
    const customer = await Customer.findOne({ email });
    const signupData = await redisClient.get(`signup:data:customer:${email}`);

    if (!customer && !signupData) {
        throw new ApiError(404, "No account or pending registration found for this email.");
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await redisClient.setEx(`otp:customer:${email}`, 900, otp);

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

    // 1. Check if it's a new registration finalization
    const signupDataJson = await redisClient.get(`signup:data:customer:${email}`);
    let customer;

    if (signupDataJson) {
        const signupData = JSON.parse(signupDataJson);
        
        // Finalize Registration
        customer = await Customer.create({
            fullName: signupData.fullName,
            email: signupData.email,
            password: signupData.password,
            role: 3,
            isEmailVerified: true
        });

        // Cleanup signup data
        await redisClient.del(`signup:data:customer:${email}`);
    } else {
        // 2. Handle standard email verification for existing users
        customer = await Customer.findOne({ email });

        if (!customer) {
            throw new ApiError(404, "Customer not found and no pending registration exists.");
        }

        customer.isEmailVerified = true;
        await customer.save();
    }

    // Cleanup OTP
    await redisClient.del(`otp:customer:${email}`);

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(customer._id);

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { customer, accessToken, refreshToken }, "Email verified successfully"));
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

    // 1. Store Registration Data in Redis temporarily (15 mins)
    await redisClient.setEx(
        `signup:data:customer:${email}`, 
        900, 
        JSON.stringify({ fullName, email, password })
    );

    // 2. Generate and Send OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redisClient.setEx(`otp:customer:${email}`, 900, otp);

    try {
        await sendEmail({
            email,
            subject: "Verify Your Catering Account",
            message: `Hello ${fullName}! Thank you for joining CaterCraft. Your verification code is: ${otp}. Please verify your email to activate your account.`
        });
    } catch (error) {
        console.error("❌ Customer Signup Email Error:", error);
        // We continue because they can resend OTP later if needed
    }

    return res.status(200).json(
        new ApiResponse(200, { email }, "Registration initiated. OTP sent to your email.")
    );
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

const getCurrentCustomerProfile = asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.user._id).select("-password -refreshToken");
    
    if (!customer) {
        throw new ApiError(404, "Customer not found");
    }

    return res.status(200).json(new ApiResponse(200, customer, "Customer profile fetched successfully"));
});

const updateCustomerProfile = asyncHandler(async (req, res) => {
    const { fullName } = req.body;
    
    if (!fullName) {
        throw new ApiError(400, "FullName is required");
    }

    const customer = await Customer.findByIdAndUpdate(
        req.user._id,
        { $set: { fullName } },
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json(new ApiResponse(200, customer, "Profile updated successfully"));
});

export {
    loginCustomer,
    registerCustomer,
    logoutCustomer,
    sendOtpCustomer,
    verifyOtpCustomer,
    googleLoginCustomer,
    getCurrentCustomerProfile,
    updateCustomerProfile
}
