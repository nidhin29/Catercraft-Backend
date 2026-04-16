import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import morgan from "morgan"

const app = express()

app.use(morgan("dev"))

app.use(cors(
    {
        origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN?.split(","),
        credentials: true
    }
));

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static("public"))
app.use(cookieParser())

import customerRouter from './routes/customer.routes.js'
import adminRouter from './routes/admin.routes.js'
import staffRouter from './routes/staff.routes.js'
import ownerRouter from './routes/owner.routes.js'
import bookingRouter from './routes/booking.routes.js'
import chatRouter from './routes/chat.routes.js'

// Route declarations
app.use("/api/v1/customer", customerRouter)
app.use("/api/v1/staff", staffRouter)
app.use("/api/v1/owner", ownerRouter)
app.use("/api/v1/admin", adminRouter)
app.use("/api/v1/booking", bookingRouter)
app.use("/api/v1/chat", chatRouter)

// Global Error Handler
app.use((err, req, res, next) => {
    // Log the error for debugging
    console.error("❌ SERVER ERROR:", err);

    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const errors = err.errors || [];

    res.status(statusCode).json({
        success: false,
        message,
        errors,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
});

export { app }
