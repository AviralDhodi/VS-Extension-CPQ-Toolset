const express = require("express");
const path = require("path");

const app = express();
const port = 3030;

// FIX: Use __dirname (where server.js is) instead of process.cwd() (where VS Code started)
const extensionRoot = __dirname;
console.log('🔍 Extension root:', extensionRoot);

// Change working directory to extension root so all paths resolve correctly
process.chdir(extensionRoot);

// Use your existing routes - they should work now with correct working directory
const routes = require("./shared/routes");
app.use(express.json()); // Add this line
app.use("/", routes);

app.listen(port, async () => {
    console.log(`✅ CPQ Toolset running at http://localhost:${port}`);
    
    // Handle open module
    try {
        const { default: open } = await import('open');
        await open(`http://localhost:${port}`);
    } catch (error) {
        console.log(`🌐 Open manually: http://localhost:${port}`);
    }
});