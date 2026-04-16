import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Message } from "../models/message.model.js";
import { redisClient } from "../db/redis.js";
import { uploadToS3 } from "../utils/s3Upload.js";

/**
 * Fetch chat history for a specific room with pagination
 */
const getChatHistory = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const { limit = 50, page = 1 } = req.query;

    if (!roomId) {
        throw new ApiError(400, "Room ID is required");
    }

    const messages = await Message.find({ room: roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments({ room: roomId });

    return res.status(200).json(
        new ApiResponse(200, {
            messages: messages.reverse(),
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalMessages / limit),
            totalMessages
        }, "Chat history fetched successfully")
    );
});

/**
 * Fetch list of recent conversations for the logged-in user with user details
 */
const getRecentConversations = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Aggregate to find unique rooms with user details and unread counts
    const conversations = await Message.aggregate([
        {
            $match: {
                $or: [{ senderId: userId }, { receiverId: userId }]
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            $group: {
                _id: "$room",
                lastMessage: { $first: "$message" },
                lastMessageTime: { $first: "$createdAt" },
                unreadCount: {
                    $sum: {
                        $cond: [
                            { 
                                $and: [
                                    { $eq: ["$receiverId", userId] },
                                    { $eq: ["$isRead", false] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                },
                otherUserId: {
                    $first: {
                        $cond: [
                            { $eq: ["$senderId", userId] },
                            "$receiverId",
                            "$senderId"
                        ]
                    }
                },
                otherUserType: {
                    $first: {
                        $cond: [
                            { $eq: ["$senderId", userId] },
                            "$receiverType",
                            "$senderType"
                        ]
                    }
                }
            }
        },
        {
            $lookup: {
                from: "owners",
                localField: "otherUserId",
                foreignField: "_id",
                as: "ownerInfo"
            }
        },
        {
            $lookup: {
                from: "staffs",
                localField: "otherUserId",
                foreignField: "_id",
                as: "staffInfo"
            }
        },
        {
            $addFields: {
                userDetails: {
                    $cond: [
                        { $eq: ["$otherUserType", "Owner"] },
                        { $arrayElemAt: ["$ownerInfo", 0] },
                        { $arrayElemAt: ["$staffInfo", 0] }
                    ]
                }
            }
        },
        {
            $project: {
                roomId: "$_id",
                lastMessage: 1,
                lastMessageTime: 1,
                unreadCount: 1,
                otherUser: {
                    id: "$otherUserId",
                    type: "$otherUserType",
                    name: {
                        $setUnion: [
                            [ "$userDetails.fullName" ],
                            [ "$userDetails.companyName" ]
                        ] // Handle different name fields
                    },
                    image: {
                        $setUnion: [
                            [ "$userDetails.profileImageThumbnail" ],
                            [ "$userDetails.companyLogoThumbnail" ]
                        ]
                    }
                }
            }
        },
        {
            $addFields: {
                "otherUser.name": { $arrayElemAt: [ { $filter: { input: "$otherUser.name", as: "n", cond: { $ne: [ "$$n", null ] } } }, 0 ] },
                "otherUser.image": { $arrayElemAt: [ { $filter: { input: "$otherUser.image", as: "i", cond: { $ne: [ "$$i", null ] } } }, 0 ] }
            }
        },
        {
            $sort: { lastMessageTime: -1 }
        }
    ]);

    // Enrich with Online Status from Redis
    const enrichedConversations = await Promise.all(
        conversations.map(async (conv) => {
            const isOnline = await redisClient.sIsMember("online_users", conv.otherUser.id.toString());
            return {
                ...conv,
                isOnline: !!isOnline
            };
        })
    );

    return res.status(200).json(new ApiResponse(200, enrichedConversations, "Recent conversations fetched"));
});

/**
 * Mark all messages in a room as read for the current user
 */
const markMessagesAsRead = asyncHandler(async (req, res) => {
    const { roomId } = req.params;
    const userId = req.user._id;

    if (!roomId) {
        throw new ApiError(400, "Room ID is required");
    }

    await Message.updateMany(
        { 
            room: roomId, 
            receiverId: userId, 
            isRead: false 
        },
        { 
            $set: { isRead: true } 
        }
    );

    return res.status(200).json(new ApiResponse(200, null, "Messages marked as read"));
});

/**
 * Upload chat media to S3
 */
const uploadChatMedia = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new ApiError(400, "Media file is required");
    }

    const imageUrl = await uploadToS3(req.file, "chat_media");

    return res.status(200).json(
        new ApiResponse(200, { imageUrl }, "Media uploaded successfully")
    );
});

/**
 * Delete a chat message (For Me or For Everyone)
 */
const deleteChatMessage = asyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { type } = req.query; // 'me' or 'everyone'
    const userId = req.user._id;

    const message = await Message.findById(messageId);

    if (!message) {
        throw new ApiError(404, "Message not found");
    }

    if (type === "everyone") {
        // Only the sender can delete for everyone
        if (message.senderId.toString() !== userId.toString()) {
            throw new ApiError(403, "You can only delete your own messages for everyone");
        }
        message.isEveryoneDeleted = true;
    } else {
        // Delete for Me
        if (!message.deletedBy.includes(userId)) {
            message.deletedBy.push(userId);
        }
    }

    await message.save();

    return res.status(200).json(
        new ApiResponse(200, { messageId, type }, "Message deleted successfully")
    );
});

export {
    getChatHistory,
    getRecentConversations,
    markMessagesAsRead,
    uploadChatMedia,
    deleteChatMessage
};
