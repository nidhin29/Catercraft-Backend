import mongoose, { Schema } from "mongoose";

const serviceSchema = new Schema(
    {
        service_name: {
            type: String,
            required: true,
            trim: true,
        },
        rate: {
            type: Number,
            required: true,
        },
        duration: {
            type: String, // e.g. "4 hours"
        },
        description: {
            type: String,
        },
        owner_email: {
            type: String,
            required: true,
            index: true
        },
        imageUrl: {
            type: String, // AWS S3 URL
        }
    },
    {
        timestamps: true
    }
)

export const Service = mongoose.model("Service", serviceSchema)
