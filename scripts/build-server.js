// build-server.js
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const dependenciesFile = path.join(__dirname,"../", "shared", "modules", "node", "dependencies.txt");
const serverEntry = path.join(__dirname,"../", "server.js");
const outputFile = path.join(__dirname, "../","bundledServer.js");

// Step 1: Install dependencies from dependencies.txt
if (fs.existsSync(dependenciesFile)) {
  const deps = fs.readFileSync(dependenciesFile, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean);

  if (deps.length) {
    console.log("📦 Installing dependencies:", deps.join(", "));
    execSync(`npm install ${deps.join(" ")}`, { stdio: "inherit" });
  }
} else {
  console.error("❌ No dependencies.txt found.");
  process.exit(1);
}

// Step 2: Bundle server.js
console.log("🔧 Bundling server.js with esbuild...");
execSync(`npx esbuild ${serverEntry} --bundle --platform=node --outfile=${outputFile}`, {
  stdio: "inherit"
});

console.log("✅ Build complete: bundledServer.js");
