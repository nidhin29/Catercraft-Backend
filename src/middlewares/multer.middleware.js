import multer from "multer";
import { ApiError } from "../utils/ApiError.js";

// We use memoryStorage for AWS S3 uploads to avoid keeping files on the server disk.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    console.log(`[Multer] Receiving file: ${file.originalname} | MIME: ${file.mimetype}`);

    const isImage = file.mimetype.startsWith("image/");
    const isGenericBinary = file.mimetype === "application/octet-stream";
    const hasImageExt = /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file.originalname);

    if (isImage || (isGenericBinary && hasImageExt)) {
        cb(null, true);
    } else {
        cb(new ApiError(400, "Invalid file type. Please upload an image (JPG, PNG, WebP, or HEIC)."), false);
    }
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});