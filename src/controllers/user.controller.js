import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Service } from "../models/service.model.js";
import { uploadToS3 } from "../utils/s3Upload.js";

const loginUser = asyncHandler(async (req, res) => {
    const { email, password, user_type } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const user = await User.findOne({ email, role: Number(user_type) })

    if (!user) {
        throw new ApiError(404, "User does not exist")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials")
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
            new ApiResponse(200, { user, accessToken, refreshToken }, "User logged in successfully")
        )


})

const registerCustomer = asyncHandler(async (req, res) => {
    const { fullName, email, password } = req.body;

    if ([fullName, email, password].some(field => field?.trim() === "")) {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser = await User.findOne({ email })
    if (existedUser) {
        throw new ApiError(409, "User with email already exists")
    }

    const user = await User.create({
        fullName,
        email,
        password,
        role: 3 // Customer
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering user")
    }

    return res.status(201).json(new ApiResponse(200, createdUser, "Customer registered successfully"))
})

const registerOwner = asyncHandler(async (req, res) => {
    const { name, email_id_owner, password } = req.body;

    if (!email_id_owner || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const existedUser = await User.findOne({ email: email_id_owner })
    if (existedUser) {
        throw new ApiError(409, "Owner with email already exists")
    }

    let licenseUrl = "";
    if (req.file) {
        licenseUrl = await uploadToS3(req.file, "licenses");
    }

    const user = await User.create({
        fullName: name,
        email: email_id_owner,
        password,
        role: 1, // Owner
        license_document: licenseUrl
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    return res.status(201).json(new ApiResponse(200, createdUser, "Owner registered successfully"))
})

const addService = asyncHandler(async (req, res) => {
    const { name, rate, duration, description } = req.body;
    const owner_email = req.user.email;

    let imageUrl = "";
    if (req.file) {
        // Generate thumbnail for service images
        imageUrl = await uploadToS3(req.file, "services", true);
    }

    const service = await Service.create({
        service_name: name,
        rate,
        duration,
        description,
        owner_email,
        imageUrl
    })

    return res.status(201).json(new ApiResponse(200, service, "Service added successfully"))
})

const logoutUser = asyncHandler(async (req, res) => {
    // Standardized logout by email/token
    const email = req.body?.email || req.user?.email;

    if (email) {
        await User.findOneAndUpdate(
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
    loginUser,
    registerCustomer,
    registerOwner,
    addService,
    logoutUser
}
