import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Owner } from "../models/owner.model.js";
import { Staff } from "../models/staff.model.js";

const updatePublicKey = asyncHandler(async (req, res) => {
    const { publicKey } = req.body;

    if (!publicKey) {
        throw new ApiError(400, "Public key is required");
    }

    const role = req.user.role;
    let user;

    if (role === 1) {
        user = await Owner.findByIdAndUpdate(
            req.user._id,
            { $set: { chatPublicKey: publicKey } },
            { new: true }
        );
    } else {
        user = await Staff.findByIdAndUpdate(
            req.user._id,
            { $set: { chatPublicKey: publicKey } },
            { new: true }
        );
    }

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(200, { publicKey: user.chatPublicKey }, "Public key updated successfully")
    );
});

const getPublicKey = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        throw new ApiError(400, "User ID is required");
    }

    // Try finding in both collections
    let user = await Owner.findById(userId).select("chatPublicKey fullName");
    if (!user) {
        user = await Staff.findById(userId).select("chatPublicKey fullName");
    }

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    return res.status(200).json(
        new ApiResponse(200, { 
            publicKey: user.chatPublicKey,
            fullName: user.fullName || user.companyName 
        }, "Public key fetched successfully")
    );
});

export {
    updatePublicKey,
    getPublicKey
}
