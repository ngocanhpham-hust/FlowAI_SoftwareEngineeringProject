const fs = require("fs");
const express = require("express");
const { pool } = require("../config/db");
const { authenticate, authorize } = require("../services/authService");
const upload = require("../middleware/uploadMiddleware");
const VideoProcessingService = require("../services/VideoProcessingService");
const { CURRENT_CONTEXT_PATH } = require("../config/paths");

const router = express.Router();
const videoProcessingService = new VideoProcessingService(pool);

router.post("/upload", authenticate, authorize("admin"), upload.single("video"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: "No file uploaded"
            });
        }

        const cameraSourceId = req.body.cameraSourceId || req.body.camera_source_id || null;
        const videoPath = req.file.path;

        if (cameraSourceId) {
            await pool.query(
                `DELETE FROM zones WHERE camera_source_id = $1`,
                [cameraSourceId]
            );
        }

        const videoResult = await pool.query(
            `
            INSERT INTO videos (camera_source_id, filename, original_name, path, status)
            VALUES ($1, $2, $3, $4, 'uploaded')
            RETURNING id
            `,
            [cameraSourceId, req.file.filename, req.file.originalname, videoPath]
        );

        const videoId = videoResult.rows[0].id;

        fs.writeFileSync(
            CURRENT_CONTEXT_PATH,
            JSON.stringify({
                videoId,
                videoPath,
                cameraSourceId
            }, null, 2)
        );

        const result = await videoProcessingService.processVideo({
            videoId,
            videoPath,
            cameraSourceId
        });

        res.json({
            message: "Processing completed",
            ...result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message || "Processing failed"
        });
    }
});

router.post("/api/reprocess", authenticate, authorize("admin"), async (req, res) => {
    try {
        let context = null;
        const cameraSourceId = req.body?.cameraSourceId || req.body?.camera_source_id || null;

        if (cameraSourceId) {
            const videoResult = await pool.query(
                `
                SELECT id, path
                FROM videos
                WHERE camera_source_id = $1
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                `,
                [cameraSourceId]
            );
            const video = videoResult.rows[0];

            if (!video) {
                return res.status(400).json({
                    error: "No uploaded video is available for this camera"
                });
            }

            context = {
                videoId: video.id,
                videoPath: video.path,
                cameraSourceId
            };
        } else if (fs.existsSync(CURRENT_CONTEXT_PATH)) {
            context = JSON.parse(fs.readFileSync(CURRENT_CONTEXT_PATH, "utf8"));
        }

        if (!context) {
            return res.status(400).json({
                error: "No uploaded video is available"
            });
        }

        const result = await videoProcessingService.processVideo(context);

        res.json({
            message: "Reprocessed",
            ...result
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message || "Reprocess failed"
        });
    }
});

module.exports = router;
