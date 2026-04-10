import jwt from "jsonwebtoken"
import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.model.js"

const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");

        if (!token || token === "undefined" || token === "null" || token.trim() === "") {
            throw new ApiError(401, "Unauthorized User");
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        let user;
        user = await User.findById(decodedToken._id).select("-password -refreshToken");

        if (!user) {
            throw new ApiError(401, "Unauthorized User");
        }

        req.user = user;
        next();
    } catch (error) {
        console.log(error);
        throw new ApiError(401, error?.message || "Invalid Access Token");
    }
})


const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            throw new ApiError(
                403,
                `Role: ${req.user.role} is not allowed to access this resource`
            );
        }
        next();
    };
};

export { verifyJWT, authorizeRoles }