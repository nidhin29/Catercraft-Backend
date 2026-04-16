import nodemailer from "nodemailer";

const sendEmail = async (options) => {
    try {
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false, // Port 587 requires secure: false
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
            tls: {
                rejectUnauthorized: false // Helps avoid local certificate issues
            }
        });

        const mailOptions = {
            from: `Catering Services <${process.env.EMAIL_USER}>`,
            to: options.email,
            subject: options.subject,
            text: options.message,
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("DEBUG: Nodemailer Error Detail:", error);
        throw error;
    }
};

export { sendEmail };
