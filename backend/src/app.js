const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const analyticsRoutes = require("./routes/analytics");
const zonesRoutes = require("./routes/zones");
const camerasRoutes = require("./routes/cameras");
const reportsRoutes = require("./routes/reports");
const demoRoutes = require("./routes/demo");
const videoRoutes = require("./routes/videos");
const errorHandler = require("./middleware/errorHandler");
const {
    PUBLIC_DIR,
    ensureRuntimeDirectories
} = require("./config/paths");

function createApp() {
    ensureRuntimeDirectories();

    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.static(PUBLIC_DIR));

    app.use("/api", authRoutes);
    app.use("/api", analyticsRoutes);
    app.use("/api", zonesRoutes);
    app.use("/api", camerasRoutes);
    app.use("/api", reportsRoutes);
    app.use("/api", demoRoutes);
    app.use(videoRoutes);

    app.use(errorHandler);

    return app;
}

module.exports = {
    createApp
};
