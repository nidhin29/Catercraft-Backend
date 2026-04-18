import dns from "dns"
dns.setServers(['8.8.8.8', '8.8.4.4']);
import dotenv from "dotenv"
import { connectDB } from "./db/index.js"
import { app } from "./app.js"
import { redisClient, connectRedis } from "./db/redis.js";
import { createServer } from "http";
import { Server } from "socket.io";

import { Message } from "./models/message.model.js";
import { sendPushNotification } from "./utils/notification.utils.js";

dotenv.config(
    {
        path: "./.env"
    }
)


const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true
    }
});


app.set("io", io);

io.on("connection", (socket) => {
    console.log(`🟢 Live Socket Connected: ${socket.id}`);

    // SUPER DEBUGGER: This will catch EVERY event sent by the phone
    socket.onAny((eventName, ...args) => {
        console.log(`🛡️  DEBUG: Received [${eventName}] from ${socket.id} | Args:`, args);
    });

    // Support both 'join_owner' (from mobile) and 'join_owner_room' (legacy/web)
    const handleJoinRoom = async (data) => {
        // Handle both string email and object { email, userId }
        const email = typeof data === 'string' ? data : data.email;
        const userId = typeof data === 'object' ? data.userId : null;

        if (!email) {
            console.log(`⚠️  Socket ${socket.id} tried to join a room without an Email`);
            return;
        }
        const roomName = `owner_${email}`;
        socket.join(roomName);
        console.log(`📡 Owner App (${socket.id}) joined Live Room: ${roomName}`);

        // Track Online Status
        if (userId) {
            socket.userId = userId; // Store on socket instance for disconnect cleanup
            await redisClient.sAdd("online_users", userId.toString());
            console.log(`🌐 User ${userId} is now ONLINE`);
        }
    };

    socket.on("join_owner", handleJoinRoom);
    socket.on("join_owner_room", handleJoinRoom);

    // Support for staff or generic user joining
    socket.on("register_user", async ({ userId }) => {
        if (!userId) return;
        socket.userId = userId;
        await redisClient.sAdd("online_users", userId.toString());
        console.log(`🌐 User ${userId} registered as ONLINE`);
    });

    // --- CHAT LOGIC ---
    socket.on("join_chat", ({ roomId }) => {
        socket.join(roomId);
        console.log(`💬 User (${socket.id}) joined Chat Room: ${roomId}`);
    });

    socket.on("send_private_message", async ({ 
        senderId, 
        senderType, 
        receiverId, 
        receiverType, 
        message, 
        room,
        imageUrl = null,
        isEncrypted = false,
        encryptionNonce = null
    }) => {
        try {
            // 1. Persist to MongoDB
            const newMessage = await Message.create({
                senderId,
                senderType,
                receiverId,
                receiverType,
                message,
                room,
                imageUrl,
                isEncrypted,
                encryptionNonce
            });

            // 2. Broadcast to the room (Real-time)
            io.to(room).emit("new_message", newMessage);
            
            // 3. Send Push Notification (Out-of-App)
            let notificationBody = imageUrl ? "📷 Image" : (message.length > 50 ? message.substring(0, 47) + "..." : message);
            
            // Fetch Sender Public Key for background decryption on receiver's device
            let sender = null;
            if (senderType === "Owner") sender = await Owner.findById(senderId);
            else sender = await Staff.findById(senderId);

            await sendPushNotification(receiverId, receiverType, {
                title: `New Message from ${sender?.companyName || sender?.fullName || senderType}`,
                body: message, // Send the ACTUAL message (encrypted if isEncrypted is true)
                isEncrypted,
                nonce: encryptionNonce,
                senderPublicKey: sender?.chatPublicKey,
                data: {
                    type: "chat",
                    room: room,
                    senderId: senderId.toString()
                }
            });

            console.log(`✉️ Message from ${senderId} to ${receiverId} in room ${room} ${isEncrypted ? "(🔒 E2EE)" : ""}`);
        } catch (error) {
            console.error("❌ Socket Error (send_message):", error);
        }
    });

    socket.on("typing", ({ room, userId, isTyping }) => {
        socket.to(room).emit("user_typing", { room, userId, isTyping });
    });

    socket.on("delete_message", ({ messageId, room, type }) => {
        // Broadcast to the room so they can update UI
        io.to(room).emit("message_deleted", { messageId, type });
        console.log(`🗑️ Message ${messageId} deleted (${type}) in room ${room}`);
    });

    socket.on("disconnect", async (reason) => {
        console.log(`🔴 Live Socket Disconnected: ${socket.id} | Reason: ${reason}`);
        if (socket.userId) {
            await redisClient.sRem("online_users", socket.userId.toString());
            console.log(`🌐 User ${socket.userId} is now OFFLINE`);
        }
    });
});


Promise.all([connectDB(), connectRedis()])
    .then(() => {    
        // IMPORTANT: Use httpServer.listen instead of app.listen!
        httpServer.listen(process.env.PORT || 8000, () => {
            console.log(`Server is running on port ${process.env.PORT}`);
        });
    })
    .catch((err) => {
        console.error("Database connection error: ", err);
        process.exit(1);
    });


