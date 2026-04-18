import jwt from "jsonwebtoken";
import { Owner } from "../models/owner.model.js";
import { Staff } from "../models/staff.model.js";
import { Customer } from "../models/customer.model.js";
import { Admin } from "../models/admin.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const generateAccessAndRefreshToken = async (user, Model) => {
    try {
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating tokens");
    }
};

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthorized request");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        );

        let user;
        let Model;

        // Optimized Search based on Role in Token payload
        if (decodedToken.role !== undefined) {
            const role = decodedToken.role;
            if (role === 0) Model = Admin;
            else if (role === 1) Model = Owner;
            else if (role === 2) Model = Staff;
            else if (role === 3) Model = Customer;
            
            if (Model) {
                user = await Model.findById(decodedToken?._id);
            }
        } 
        
        // Fallback: Search all collections if role is missing (transition period)
        if (!user) {
            const models = [Admin, Owner, Staff, Customer];
            for (const M of models) {
                user = await M.findById(decodedToken?._id);
                if (user) {
                    Model = M;
                    break;
                }
            }
        }

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used");
        }

        const options = {
            httpOnly: true,
            secure: true
        };

        const { accessToken, refreshToken: newRefreshToken } = await generateAccessAndRefreshToken(user, Model);

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
            );

    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token");
    }
});

const validateToken = asyncHandler(async (req, res) => {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
        throw new ApiError(401, "No access token provided");
    }

    try {
        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        
        return res.status(200).json(
            new ApiResponse(200, { 
                valid: true, 
                user: {
                    _id: decodedToken._id,
                    role: decodedToken.role,
                    email: decodedToken.email
                } 
            }, "Token is valid")
        );
    } catch (error) {
        throw new ApiError(401, "Session expired or invalid token");
    }
});

export { refreshAccessToken, validateToken };
