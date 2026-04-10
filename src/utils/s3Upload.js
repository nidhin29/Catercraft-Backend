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

        const fileName = `${folder}/${Date.now()}-${file.originalname}`;
        let buffer = file.buffer;

        // Thumbnail Generation if requested
        if (generateThumbnail) {
            buffer = await sharp(file.buffer)
                .resize(200, 200, { fit: 'cover' })
                .toBuffer();
        }

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: file.mimetype,
        };

        const command = new PutObjectCommand(params);
        await s3Client.send(command);

        // Construct public URL (assuming bucket is public or using CloudFront)
        return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    } catch (error) {
        console.error("S3 Upload Error: ", error);
        throw new ApiError(500, "Error uploading file to S3");
    }
};

export { uploadToS3 };
