const { createApp } = require("./src/app");
const { initDatabase } = require("./src/config/db");
const { seedDefaultUsers } = require("./src/services/authService");

const PORT = process.env.PORT || 3000;

async function start() {
    await initDatabase();
    await seedDefaultUsers();

    const app = createApp();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

start().catch(err => {
    console.error("Server startup failed:", err);
    process.exit(1);
});
