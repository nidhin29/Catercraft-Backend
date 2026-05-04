import path from "path";
import admin from "firebase-admin";
import { Owner } from "../models/owner.model.js";
import { Staff } from "../models/staff.model.js";

// Initialize Firebase Admin (Wrapped in try-catch to avoid crashing if file is missing)
try {
    const serviceAccountPath = path.resolve(process.cwd(), "src/config/serviceAccountKey.json");
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath)
    });
    console.log("✅ Firebase Admin Initialized");
} catch (error) {
    console.log("⚠️ Firebase Admin not initialized (Missing serviceAccountKey.json)");
    console.error("Error details:", error.message);
}

/**
 * Send a push notification to a specific user
 * @param {string} userId - Database ID of the user
 * @param {string} userType - 'Owner' or 'Staff'
 * @param {object} payload - { title, body, data }
 */
const sendPushNotification = async (userId, userType, payload) => {
    try {
        let user;
        if (userType === "Owner") {
            user = await Owner.findById(userId);
        } else if (userType === "Staff") {
            user = await Staff.findById(userId);
        }

        if (!user || !user.fcmToken) {
            console.log(`📡 Skipping Push: No FCM Token found for ${userType} (${userId})`);
            return null;
        }

        const message = {
            data: {
                ...payload.data,
                click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
            token: user.fcmToken,
            android: {
                priority: "high",
            },
            apns: {
                payload: {
                    aps: {
                        contentAvailable: true,
                    },
                },
            },
        };

        // If not encrypted, we can include the standard notification block
        if (!payload.isEncrypted) {
            message.notification = {
                title: payload.title,
                body: payload.body,
            };
        } else {
            // Include E2EE info in data
            message.data.encryptedBody = payload.body;
            message.data.isEncrypted = "true";
            message.data.nonce = payload.nonce;
            message.data.senderPublicKey = payload.senderPublicKey;
            message.data.title = payload.title; // Title is safe to send plain
        }

        const response = await admin.messaging().send(message);
        console.log(`✅ Push Notification Sent! Message ID: ${response} | User: ${userId} (${userType})`);
        return response;
    } catch (error) {
        console.error(`❌ Firebase Send Error for User ${userId}:`, error.message);
        if (error.code) console.error(`Error Code: ${error.code}`);
        return null;
    }
};

export { sendPushNotification };
