const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "../../..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const UPLOAD_DIR = path.join(BACKEND_DIR, "uploads");
const OUTPUT_DIR = path.join(BACKEND_DIR, "outputs");
const PUBLIC_DIR = path.join(BACKEND_DIR, "public");
const CURRENT_CONTEXT_PATH = path.join(OUTPUT_DIR, "current_context.json");

function ensureRuntimeDirectories() {
    for (const directory of [UPLOAD_DIR, OUTPUT_DIR, PUBLIC_DIR]) {
        fs.mkdirSync(directory, {
            recursive: true
        });
    }
}

module.exports = {
    ROOT_DIR,
    BACKEND_DIR,
    UPLOAD_DIR,
    OUTPUT_DIR,
    PUBLIC_DIR,
    CURRENT_CONTEXT_PATH,
    ensureRuntimeDirectories
};
