const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
    ROOT_DIR,
    OUTPUT_DIR,
    PUBLIC_DIR
} = require("../config/paths");

const execFileAsync = promisify(execFile);

class VideoProcessingService {
    constructor(pool, options = {}) {
        this.pool = pool;
        this.pythonBin = options.pythonBin || process.env.PYTHON_BIN || "python3";
    }

    async runPython(script, args = []) {
        const scriptPath = path.join(ROOT_DIR, "ai_services", script);
        const { stdout, stderr } = await execFileAsync(this.pythonBin, [scriptPath, ...args], {
            cwd: ROOT_DIR,
            timeout: 1000 * 60 * 30
        });

        if (stdout) {
            console.log(stdout);
        }

        if (stderr) {
            console.error(stderr);
        }
    }

    async getLatestZones(cameraSourceId) {
        if (cameraSourceId) {
            const result = await this.pool.query(
                `
                SELECT zone_name, zone_type, grid_position, grid_size, coordinates, threshold
                FROM zones
                WHERE camera_source_id = $1
                ORDER BY grid_position
                `,
                [cameraSourceId]
            );

            return result.rows;
        }

        const zoneFile = path.join(OUTPUT_DIR, "zones.json");

        if (!fs.existsSync(zoneFile)) {
            return [];
        }

        const zoneData = JSON.parse(fs.readFileSync(zoneFile, "utf8"));

        return (zoneData.zones || []).map(zone => ({
            zone_name: zone.name,
            zone_type: zone.type || zone.zone_type || "monitoring",
            grid_position: zone.grid_position,
            grid_size: zoneData.grid_size,
            coordinates: zone.coordinates || [],
            threshold: zone.threshold || zoneData.threshold || 10
        }));
    }

    writeRuntimeZonesFile(cameraSourceId, zones) {
        fs.writeFileSync(
            path.join(OUTPUT_DIR, "zones.json"),
            JSON.stringify({
                camera_source_id: cameraSourceId || null,
                grid_size: zones[0]?.grid_size || 1,
                zones: zones.map(zone => ({
                    name: zone.zone_name,
                    type: zone.zone_type || "monitoring",
                    grid_position: zone.grid_position,
                    coordinates: zone.coordinates || [],
                    threshold: zone.threshold || 10
                }))
            }, null, 2)
        );
    }

    publicUrlFor(filePath) {
        return `/${path.relative(PUBLIC_DIR, filePath).split(path.sep).join("/")}`;
    }

    copyLatestMedia(mediaPaths) {
        fs.copyFileSync(mediaPaths.processedVideoPath, path.join(PUBLIC_DIR, "processed.mp4"));
        fs.copyFileSync(mediaPaths.heatmapPath, path.join(PUBLIC_DIR, "heatmap.png"));
        fs.copyFileSync(mediaPaths.previewPath, path.join(PUBLIC_DIR, "preview.jpg"));
    }

    async saveStatsToJob(jobId, zones, statsPath, mediaUrls) {
        const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
        const densityScores = {};

        for (const zone of zones) {
            const zoneName = zone.zone_name;
            const actualCount = Number((stats.zone_counts || {})[zoneName] || 0);
            const threshold = Math.max(1, Number(zone.threshold || 10));
            densityScores[zoneName] = Number((actualCount / threshold).toFixed(2));
        }

        await this.pool.query(
            `
            UPDATE analysis_jobs
            SET status = 'completed',
                total_people = $1,
                most_crowded_zone = $2,
                popular_path = $3,
                zone_counts = $4,
                transitions = $5,
                timeline = $6,
                dwell_times = $7,
                density_scores = $8,
                congestion_alert = $9,
                processed_video_path = $10,
                heatmap_path = $11,
                preview_path = $12,
                finished_at = NOW()
            WHERE id = $13
            `,
            [
                stats.total_people || 0,
                stats.most_crowded_zone || "-",
                stats.popular_path || "No movement",
                JSON.stringify(stats.zone_counts || {}),
                JSON.stringify(stats.transitions || {}),
                JSON.stringify(stats.timeline || []),
                JSON.stringify(stats.dwell_times || {}),
                JSON.stringify(densityScores),
                stats.congestion_alert || "Normal",
                mediaUrls.processedVideoUrl,
                mediaUrls.heatmapUrl,
                mediaUrls.previewUrl,
                jobId
            ]
        );

        await this.pool.query(`DELETE FROM alerts WHERE analysis_job_id = $1`, [jobId]);
        await this.pool.query(`DELETE FROM zone_counts WHERE analysis_job_id = $1`, [jobId]);
        await this.pool.query(`DELETE FROM flow_records WHERE analysis_job_id = $1`, [jobId]);

        for (const zone of zones) {
            const zoneName = zone.zone_name;
            const actualCount = Number((stats.zone_counts || {})[zoneName] || 0);
            const threshold = Number(zone.threshold || 10);

            await this.pool.query(
                `
                INSERT INTO zone_counts (analysis_job_id, zone_name, people_count)
                VALUES ($1, $2, $3)
                `,
                [jobId, zoneName, actualCount]
            );

            if (actualCount > threshold) {
                const severity = actualCount > threshold * 1.5 ? "danger" : "warning";
                const message = `${zoneName} exceeded threshold ${threshold} with ${actualCount} pedestrians`;

                await this.pool.query(
                    `
                    INSERT INTO alerts
                    (analysis_job_id, zone_name, threshold, actual_count, severity, message)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    `,
                    [jobId, zoneName, threshold, actualCount, severity, message]
                );
            }
        }

        for (const [transition, count] of Object.entries(stats.transitions || {})) {
            const [fromZone, toZone] = transition.split(" \u2192 ");

            if (fromZone && toZone) {
                await this.pool.query(
                    `
                    INSERT INTO flow_records
                    (analysis_job_id, from_zone, to_zone, transition_count)
                    VALUES ($1, $2, $3, $4)
                    `,
                    [jobId, fromZone, toZone, Number(count)]
                );
            }
        }

        return stats;
    }

    async persistTrajectoryPoints(jobId, csvPath) {
        if (!fs.existsSync(csvPath)) {
            return;
        }

        await this.pool.query(
            `
            DELETE FROM pedestrian_tracks
            WHERE analysis_job_id = $1
            `,
            [jobId]
        );

        const rows = await new Promise((resolve, reject) => {
            const parsedRows = [];

            fs.createReadStream(csvPath)
                .pipe(csvParser())
                .on("data", row => parsedRows.push(row))
                .on("end", () => resolve(parsedRows))
                .on("error", reject);
        });

        const byPerson = new Map();

        for (const row of rows) {
            const personId = Number(row.person_id);

            if (!byPerson.has(personId)) {
                byPerson.set(personId, []);
            }

            byPerson.get(personId).push(row);
        }

        for (const [personId, points] of byPerson.entries()) {
            const frames = points.map(point => Number(point.frame));
            const trackResult = await this.pool.query(
                `
                INSERT INTO pedestrian_tracks
                (analysis_job_id, anonymous_track_id, start_frame, end_frame)
                VALUES ($1, $2, $3, $4)
                RETURNING id
                `,
                [jobId, personId, Math.min(...frames), Math.max(...frames)]
            );

            const trackId = trackResult.rows[0].id;

            for (const point of points) {
                await this.pool.query(
                    `
                    INSERT INTO trajectory_points
                    (pedestrian_track_id, frame_index, x, y, zone_name)
                    VALUES ($1, $2, $3, $4, $5)
                    `,
                    [
                        trackId,
                        Number(point.frame),
                        Number(point.x),
                        Number(point.y),
                        point.zone
                    ]
                );
            }
        }
    }

    async processVideo({ videoId, videoPath, cameraSourceId }) {
        const zones = await this.getLatestZones(cameraSourceId);

        this.writeRuntimeZonesFile(cameraSourceId, zones);

        const jobResult = await this.pool.query(
            `
            INSERT INTO analysis_jobs (video_id, camera_source_id, status, started_at)
            VALUES ($1, $2, 'processing', NOW())
            RETURNING id
            `,
            [videoId, cameraSourceId || null]
        );

        const jobId = jobResult.rows[0].id;
        const mediaDir = path.join(PUBLIC_DIR, "media", "jobs", String(jobId));
        fs.mkdirSync(mediaDir, {
            recursive: true
        });

        const mediaPaths = {
            previewPath: path.join(mediaDir, "preview.jpg"),
            processedVideoPath: path.join(mediaDir, "processed.mp4"),
            heatmapPath: path.join(mediaDir, "heatmap.png"),
            trajectoryPath: path.join(mediaDir, "trajectories.csv"),
            statsPath: path.join(mediaDir, "stats.json")
        };

        const mediaUrls = {
            previewUrl: this.publicUrlFor(mediaPaths.previewPath),
            processedVideoUrl: this.publicUrlFor(mediaPaths.processedVideoPath),
            heatmapUrl: this.publicUrlFor(mediaPaths.heatmapPath)
        };

        try {
            await this.runPython("extract_preview.py", [videoPath, mediaPaths.previewPath]);
            await this.runPython("tracking.py", [
                videoPath,
                mediaPaths.processedVideoPath,
                mediaPaths.trajectoryPath
            ]);
            await this.runPython("analytics.py", [
                mediaPaths.trajectoryPath,
                mediaPaths.statsPath
            ]);
            await this.runPython("heatmap.py", [
                mediaPaths.trajectoryPath,
                mediaPaths.processedVideoPath,
                mediaPaths.heatmapPath
            ]);
            await this.persistTrajectoryPoints(jobId, mediaPaths.trajectoryPath);

            const stats = await this.saveStatsToJob(jobId, zones, mediaPaths.statsPath, mediaUrls);
            this.copyLatestMedia(mediaPaths);

            await this.pool.query(
                `
                UPDATE videos
                SET status = 'completed', processed_at = NOW()
                WHERE id = $1
                `,
                [videoId]
            );

            return {
                jobId,
                stats
            };
        } catch (err) {
            await this.pool.query(
                `
                UPDATE analysis_jobs
                SET status = 'failed', error_message = $1, finished_at = NOW()
                WHERE id = $2
                `,
                [err.message, jobId]
            );

            await this.pool.query(
                `
                UPDATE videos
                SET status = 'failed'
                WHERE id = $1
                `,
                [videoId]
            );

            throw err;
        }
    }
}

module.exports = VideoProcessingService;
