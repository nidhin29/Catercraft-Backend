import { createClient } from "redis";
import { config } from "dotenv";

config(); // Ensure our env vars are loaded

const redisURL = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;

const redisClient = createClient({
    url: redisURL,
    password: (process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD !== '""') ? process.env.REDIS_PASSWORD : undefined
});

redisClient.on("error", (err) => {
    console.error("Redis Client Error", err);
});

redisClient.on("connect", () => {
    console.log("Connected to Redis");
});

const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error("Failed to connect to Redis:", error);
    }
};

export { redisClient, connectRedis };
