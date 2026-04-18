import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Owner } from "../models/owner.model.js";
import { Staff } from "../models/staff.model.js";
import { Service } from "../models/service.model.js";
import { uploadToS3 } from "../utils/s3Upload.js";
import { redisClient } from "../db/redis.js";
import { sendEmail } from "../utils/sendEmail.js";
import { OAuth2Client } from "google-auth-library";

const generateAccessAndRefreshToken = async (ownerId) => {
    try {
        const owner = await Owner.findById(ownerId)
        const accessToken = owner.generateAccessToken()
        const refreshToken = owner.generateRefreshToken()

        owner.refreshToken = refreshToken
        await owner.save({ validateBeforeSave: false })

        return { accessToken, refreshToken }
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating tokens")
    }
}

const loginOwner = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const owner = await Owner.findOne({ email, role: 1 })

    if (!owner) {
        throw new ApiError(404, "Owner account does not exist")
    }

    const isPasswordValid = await owner.isPasswordCorrect(password)

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(owner._id)

    const options = {
        httpOnly: true,
        secure: true
    }

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, { owner, accessToken, refreshToken }, "Logged in successfully")
        )
})

const sendOtpOwner = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new ApiError(400, "Email is required");
    }

    const otp = Math.floor(100000 + Math.random() * 900000);

    await redisClient.setEx(`otp:owner:${email}`, 900, otp.toString());

    try {
        await sendEmail({
            email,
            subject: "Your Catering Owner Verification OTP",
            message: `Your verification code is ${otp}. It will expire in 15 minutes.`
        });
    } catch (error) {
        throw new ApiError(500, "Failed to send OTP email");
    }

    return res.status(200).json(new ApiResponse(200, null, "OTP sent successfully"));
});

const verifyOtpOwner = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        throw new ApiError(400, "Email and OTP are required");
    }

    const cachedOtp = await redisClient.get(`otp:owner:${email}`);
    if (!cachedOtp || cachedOtp !== otp.toString()) {
        throw new ApiError(400, "Invalid or expired OTP");
    }

    let owner = await Owner.findOne({ email });

    if (!owner) {
        throw new ApiError(404, "Owner account not found.");
    }

    owner.isEmailVerified = true;
    await owner.save();

    await redisClient.del(`otp:owner:${email}`);

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(owner._id);

    return res.status(200).json(new ApiResponse(200, { owner, accessToken, refreshToken }, "Email verified successfully"));
});

const googleLoginOwner = asyncHandler(async (req, res) => {
    const { tokenID } = req.body;
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID_WEB);

    const ticket = await client.verifyIdToken({
        idToken: tokenID,
        audience: [
            (process.env.GOOGLE_CLIENT_ID_WEB || "").trim(),
            (process.env.GOOGLE_CLIENT_ID_ANDROID || "").trim()
        ]
    });

    const payload = ticket.getPayload();
    const { email } = payload;

    const owner = await Owner.findOne({ email });

    if (!owner) {
        // DISCOVERY: Return 404 so frontend knows to show Registration Form
        return res.status(404).json(new ApiResponse(404, { email }, "Owner not found. Please complete registration with business details."));
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(owner._id);

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(200, { owner, accessToken, refreshToken }, "Logged in via Google successfully"));
});

const googleRegisterOwner = asyncHandler(async (req, res) => {
    const { tokenID, companyName } = req.body;

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID_WEB);
    const ticket = await client.verifyIdToken({
        idToken: tokenID,
        audience: [
            (process.env.GOOGLE_CLIENT_ID_WEB || "").trim(),
            (process.env.GOOGLE_CLIENT_ID_ANDROID || "").trim()
        ]
    });

    const payload = ticket.getPayload();
    const { email } = payload;

    const existingOwner = await Owner.findOne({ email });
    if (existingOwner) {
        throw new ApiError(409, "An owner with this Google account already exists. Please login instead.");
    }

    // --- MULTI-FILE UPLOAD (LICENSE & LOGO) ---
    const licenseFile = req.files?.license?.[0];
    const logoFile = req.files?.logo?.[0];

    if (!licenseFile) {
        throw new ApiError(400, "License document is required for registration");
    }

    // Upload License to S3
    const licenseUrl = await uploadToS3(licenseFile, "licenses");

    // Upload Logo to S3 (optional)
    let logoUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; // default
    let logoThumbUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

    if (logoFile) {
        const s3Result = await uploadToS3(logoFile, "logos", true);
        logoUrl = s3Result.url;
        logoThumbUrl = s3Result.thumbnailUrl;
    }

    // Generate Username
    const baseUsername = companyName.toLowerCase().replace(/\s+/g, "");
    const randomNum = Math.floor(100 + Math.random() * 900);
    const username = `${baseUsername}_${randomNum}`;

    // Create Owner
    const owner = await Owner.create({
        email,
        companyName, 
        username,
        license_document: licenseUrl,
        companyLogo: logoUrl,
        companyLogoThumbnail: logoThumbUrl,
        password: Math.random().toString(36).slice(-10),
        role: 1,
        isEmailVerified: true,
        verificationStatus: 'pending'
    });

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(owner._id);

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(201)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse(201, { owner, accessToken, refreshToken }, "Business registered successfully via Google. Waiting for admin approval."));
});

const registerOwner = asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required")
    }

    const existedUser = await Owner.findOne({ email: email })
    if (existedUser) {
        throw new ApiError(409, "Account with this email already exists")
    }

    // --- MULTI-FILE UPLOAD (LICENSE & LOGO) ---
    const licenseFile = req.files?.license?.[0];
    const logoFile = req.files?.logo?.[0];

    if (!licenseFile) {
        throw new ApiError(400, "License document is required");
    }

    const licenseUrl = await uploadToS3(licenseFile, "licenses");

    let logoUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    let logoThumbUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

    if (logoFile) {
        const s3Result = await uploadToS3(logoFile, "logos", true);
        logoUrl = s3Result.url;
        logoThumbUrl = s3Result.thumbnailUrl;
    }

    // Generate Username
    const baseUsername = name.toLowerCase().replace(/\s+/g, "");
    const randomNum = Math.floor(100 + Math.random() * 900);
    const username = `${baseUsername}_${randomNum}`;

    const owner = await Owner.create({
        companyName: name, 
        email: email,
        username,
        password,
        role: 1, // Owner
        license_document: licenseUrl,
        companyLogo: logoUrl,
        companyLogoThumbnail: logoThumbUrl,
        isEmailVerified: false,
        verificationStatus: 'pending'
    })

    // --- Automatic OTP Generation & Email Trigger ---
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await redisClient.set(`otp:owner:${email}`, otp, { EX: 900 });

    try {
        await sendEmail({
            email,
            subject: "Verify Your Catering Account",
            message: `Hello ${name}! Your registration was successful. Your verification code is: ${otp}. Please verify your email to activate your account.`
        });
    } catch (error) {
        console.error("❌ Sign up Email Error:", error);
        // We don't throw here to avoid failing the whole registration, but user will need to resend OTP
    }

    const createdUser = await Owner.findById(owner._id).select("-password -refreshToken")

    return res.status(201).json(new ApiResponse(201, createdUser, "Owner registered successfully. OTP sent to your email."))
})

const addService = asyncHandler(async (req, res) => {
    // Verification Check
    if (req.user.verificationStatus !== "verified") {
        throw new ApiError(403, "Your account is not verified. Please wait for admin approval before adding services.")
    }

    const { name, rate, duration, description, service_group, menu_starters, menu_main, menu_desserts, whats_included } = req.body;
    const owner_email = req.user.email;

    let imageUrl = "";
    if (req.file) {
        const s3Result = await uploadToS3(req.file, "services", true);
        imageUrl = s3Result.url; 
    }

    // Parse list fields if they come as JSON strings or ensure they are arrays
    const parseList = (val) => {
        if (!val) return [];
        if (Array.isArray(val)) return val;
        try {
            const parsed = JSON.parse(val);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
            return val.split(',').map(s => s.trim()).filter(s => s !== "");
        }
    };

    const service = await Service.create({
        service_name: name,
        rate,
        duration,
        description,
        service_group,
        owner_email,
        imageUrl,
        menu: {
            starters: parseList(menu_starters),
            main_course: parseList(menu_main),
            desserts: parseList(menu_desserts)
        },
        whats_included: parseList(whats_included)
    })

    return res.status(201).json(new ApiResponse(200, service, "Service added successfully"))
})

const logoutOwner = asyncHandler(async (req, res) => {
    const email = req.user?.email || req.body?.email;

    if (email) {
        await Owner.findOneAndUpdate(
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

const getOwnerStaff = asyncHandler(async (req, res) => {
    const owner = await Owner.findById(req.user._id).populate("staffs", "-password -refreshToken");

    if (!owner) {
        throw new ApiError(404, "Owner not found");
    }

    return res.status(200).json(new ApiResponse(200, owner.staffs, "Owner staff fetched successfully"));
});

const getOwnerServices = asyncHandler(async (req, res) => {
    const services = await Service.find({ owner_email: req.user.email });

    return res.status(200).json(new ApiResponse(200, services, "Owner services fetched successfully"));
});

const getOwnerDetails = asyncHandler(async (req, res) => {
    const owner = await Owner.findById(req.user._id).select("-password -refreshToken");

    if (!owner) {
        throw new ApiError(404, "Owner not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200, 
            owner, 
            "Owner details fetched successfully"
        )
    );
});

const updateOwnerProfile = asyncHandler(async (req, res) => {
    const { companyName, fcmToken } = req.body;
    const updateData = {};

    if (companyName) updateData.companyName = companyName;
    if (fcmToken) updateData.fcmToken = fcmToken;
    
    // Handle Logo Update
    const logoFile = req.files?.logo?.[0];
    if (logoFile) {
        const s3Result = await uploadToS3(logoFile, "logos", true);
        updateData.companyLogo = s3Result.url;
        updateData.companyLogoThumbnail = s3Result.thumbnailUrl;
    }

    if (Object.keys(updateData).length === 0) {
        throw new ApiError(400, "No data provided to update");
    }

    const owner = await Owner.findByIdAndUpdate(
        req.user._id,
        { $set: updateData },
        { new: true }
    ).select("-password -refreshToken");

    return res.status(200).json(
        new ApiResponse(200, owner, "Profile updated successfully")
    );
});

const addStaff = asyncHandler(async (req, res) => {
    const { fullName, email, password, designation } = req.body;

    if ([fullName, email, password, designation].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All fields (FullName, Email, Password, Designation) are required");
    }

    const existedStaff = await Staff.findOne({ email });
    if (existedStaff) {
        throw new ApiError(409, "Staff with this email already exists");
    }

    const ownerId = req.user?._id;

    if (!ownerId) {
        throw new ApiError(401, "Session expired or owner not authenticated");
    }

    // 1. Create Staff
    const staff = await Staff.create({
        fullName,
        email,
        password,
        designation,
        owner: ownerId,
        isEmailVerified: true // Assuming owner verification is sufficient for creation
    });

    if (!staff) {
        throw new ApiError(500, "Something went wrong while creating the staff account");
    }

    // 2. Link to Owner - we also fetch companyName for the email
    const owner = await Owner.findByIdAndUpdate(
        ownerId,
        {
            $push: { staffs: staff._id }
        },
        { new: true }
    );

    if (!owner) {
        throw new ApiError(404, "Staff created, but Owner business record not found for linking");
    }

    // 3. Send Welcome Email
    try {
        await sendEmail({
            email: staff.email,
            subject: `Welcome to ${owner.companyName}!`,
            message: `Hello ${staff.fullName},\n\nYou have been added as a ${staff.designation} at ${owner.companyName}.\n\nYou can now log in to the Staff App using:\nEmail: ${staff.email}\nPassword: ${password}\n\nPlease change your password after logging in for the first time.`
        });
    } catch (error) {
        console.error("❌ Staff Welcome Email Error:", error);
        // We don't throw here to avoid failing the creation if email fails
    }

    return res.status(201).json(
        new ApiResponse(201, staff, "Staff member added and welcome email sent successfully")
    );
});

export {
    loginOwner,
    registerOwner,
    addService,
    logoutOwner,
    sendOtpOwner,
    verifyOtpOwner,
    googleLoginOwner,
    googleRegisterOwner,
    getOwnerStaff,
    getOwnerServices,
    getOwnerDetails,
    updateOwnerProfile,
    addStaff
}
