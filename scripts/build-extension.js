const path = require("path");
const { execSync } = require("child_process");

const buildServerScript = path.join(__dirname, "build-server.js");

console.log("🚀 Starting full extension build...");

execSync(`node "${buildServerScript}"`, { stdio: "inherit" });

// ⏭️ Add more steps later like asset copy, minify, package

console.log("✅ Extension build complete.");
