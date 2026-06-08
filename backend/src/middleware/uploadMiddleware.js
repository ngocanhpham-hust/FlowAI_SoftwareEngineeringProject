const multer = require("multer");
const { UPLOAD_DIR } = require("../config/paths");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${Date.now()}-${safeName}`);
    }
});

const uploadMiddleware = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("video/")) {
            return cb(new Error("Unsupported video file"));
        }

        cb(null, true);
    }
});

module.exports = uploadMiddleware;
