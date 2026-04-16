import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const ownerSchema = new Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        companyName: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        password: {
            type: String,
            required: [true, 'Password is required']
        },
        role: {
            type: Number,
            default: 1 // Owner
        },
        isEmailVerified: {
            type: Boolean,
            default: false
        },
        verificationStatus: {
            type: String,
            enum: ['pending', 'verified', 'rejected'],
            default: 'pending'
        },
        adminRemarks: {
            type: String,
            default: ""
        },
        license_document: {
            type: String, // AWS S3 URL
        },
        staffs: [
            {
                type: Schema.Types.ObjectId,
                ref: "Staff"
            }
        ],
        companyLogo: {
            type: String, // AWS S3 URL
            default: "https://cdn-icons-png.flaticon.com/512/149/149071.png" // Default avatar
        },
        companyLogoThumbnail: {
            type: String, // AWS S3 URL
            default: "https://cdn-icons-png.flaticon.com/512/149/149071.png" // Default avatar
        },
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true
        },
        refreshToken: {
            type: String
        },
        fcmToken: {
            type: String
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
)

// Virtual field for "Member Since: Month YYYY"
ownerSchema.virtual("memberSince").get(function () {
    if (!this.createdAt) return null;
    return this.createdAt.toLocaleString('default', { month: 'long', year: 'numeric' });
});

ownerSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10)
})

ownerSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password)
}

ownerSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            role: this.role
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY
        }
    )
}

ownerSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        {
            _id: this._id,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY
        }
    )
}

export const Owner = mongoose.model("Owner", ownerSchema)
