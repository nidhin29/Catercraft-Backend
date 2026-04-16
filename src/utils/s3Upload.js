import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { ApiError } from "./ApiError.js";

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const uploadToS3 = async (file, folder = "uploads", generateThumbnail = false) => {
    try {
        if (!file) return null;

        const root = process.env.S3_ROOT_FOLDER ? `${process.env.S3_ROOT_FOLDER}/` : "";
        const baseFileName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
        const cloudFrontUrl = process.env.CLOUDFRONT_URL?.trim();
        const bucket = process.env.AWS_BUCKET_NAME;

        const getFullUrl = (key) => {
            if (cloudFrontUrl && cloudFrontUrl !== "your_cloudfront_domain.net") {
                const cleanDomain = cloudFrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
                return `https://${cleanDomain}/${key}`;
            }
            return `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        };

        // 1. Upload Original File
        const originalKey = `${root}${folder}/${baseFileName}`;
        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: originalKey,
            Body: file.buffer,
            ContentType: file.mimetype,
        }));

        const originalUrl = getFullUrl(originalKey);

        // 2. Handle Thumbnail if requested
        if (generateThumbnail) {
            const thumbnailKey = `${root}${folder}/thumb-${baseFileName}`;
            const thumbnailBuffer = await sharp(file.buffer)
                .resize(200, 200, { fit: 'cover' })
                .toBuffer();

            await s3Client.send(new PutObjectCommand({
                Bucket: bucket,
                Key: thumbnailKey,
                Body: thumbnailBuffer,
                ContentType: file.mimetype,
            }));

            return {
                url: originalUrl,
                thumbnailUrl: getFullUrl(thumbnailKey)
            };
        }

        return originalUrl;
    } catch (error) {
        console.error("S3 Upload Error: ", error);
        throw new ApiError(500, "Error uploading file to S3");
    }
};

export { uploadToS3 };
