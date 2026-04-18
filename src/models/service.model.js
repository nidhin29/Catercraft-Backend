import mongoose, { Schema } from "mongoose";

const serviceSchema = new Schema(
    {
        service_name: {
            type: String,
            required: true,
            trim: true,
        },
        service_group: {
            type: String,
            required: true,
            enum: ["wedding","corporate","parties","global"]
        },
        rate: {
            type: Number,
            required: true,
        },
        duration: {
            type: String, 
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
            type: String, 
        },
        menu: {
            starters: [String],
            main_course: [String],
            desserts: [String]
        },
        whats_included: [String]
    },
    {
        timestamps: true
    }
)

export const Service = mongoose.model("Service", serviceSchema)
