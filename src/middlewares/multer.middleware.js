import multer from "multer";

const storage = multer.memoryStorage(); // Store in memory for processing with sharp before S3

export const upload = multer({ 
    storage,
})
