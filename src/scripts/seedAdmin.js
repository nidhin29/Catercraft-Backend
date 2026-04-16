import dotenv from "dotenv"
import { Admin } from "../models/admin.model.js"
import { connectDB } from "../db/index.js"

import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log("✅ .env file found and loaded.");
} else {
    console.warn("⚠️  .env file not found at:", envPath);
}

const seedAdmin = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.error("❌ ERROR: MONGODB_URI is not defined in environment variables.");
            console.log("Current Directory:", process.cwd());
            process.exit(1);
        }

        await connectDB()
        console.log("Connected to MongoDB for seeding...");

        const adminExists = await Admin.findOne({ email: "admin@catering.com" })

        if (adminExists) {
            console.log("Admin already exists")
            process.exit(0)
        }

        const admin = new Admin({
            email: "admin@catering.com",
            fullName: "Platform Admin",
            password: "password123",
            role: 0
        })

        await admin.save()
        console.log("Admin seeded successfully")
        process.exit(0)
    } catch (error) {
        console.error("❌ Error seeding admin.");
        const errorMessage = `MESSAGE: ${error.message}\nSTACK: ${error.stack}`;
        fs.writeFileSync("seed_error.txt", errorMessage);
        console.log("Detailed error written to seed_error.txt");
        process.exit(1)
    }
}

seedAdmin()
