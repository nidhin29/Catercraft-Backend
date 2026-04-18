import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
    {
        senderId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'senderType' // Dynamic ref
        },
        senderType: {
            type: String,
            required: true,
            enum: ['Owner', 'Staff']
        },
        receiverId: {
            type: Schema.Types.ObjectId,
            required: true,
            refPath: 'receiverType'
        },
        receiverType: {
            type: String,
            required: true,
            enum: ['Owner', 'Staff']
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        room: {
            type: String,
            required: true,
            index: true
        },
        isRead: {
            type: Boolean,
            default: false
        },
        imageUrl: {
            type: String,
            default: null
        },
        isEveryoneDeleted: {
            type: Boolean,
            default: false
        },
        deletedBy: [
            {
                type: Schema.Types.ObjectId,
                refPath: 'senderType' // Use dynamic ref for both Owner and Staff
            }
        ],
        isEncrypted: {
            type: Boolean,
            default: false
        },
        encryptionNonce: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

export const Message = mongoose.model("Message", messageSchema);
