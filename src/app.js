import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"

const app = express()

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

import userRouter from './routes/user.routes.js'
import adminRouter from './routes/admin.routes.js'
import bookingRouter from './routes/booking.routes.js'

// Route declarations
app.use("/", userRouter)
app.use("/", bookingRouter)
app.use("/api/v1/admin", adminRouter)

// Global Error Handler
app.use((err, req, res, next) => {
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
