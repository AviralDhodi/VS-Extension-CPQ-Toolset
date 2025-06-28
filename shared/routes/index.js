// shared/routes/index.js - Simplified routing without complex shell coordination
const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const projectRoot = process.cwd();
const baseUIPath = path.join(projectRoot, "shared", "UI");

console.log('🔗 Shared routes initializing...');
console.log('📂 Project root:', projectRoot);
console.log('🎨 Base UI path:', baseUIPath);

// ========================================
// STATIC ASSETS FOR SHELL
// ========================================

// Serve shell assets (CSS, JS for extension shell)
router.use("/shared/appView", express.static(path.join(baseUIPath, "appView")));

// Serve welcome page static assets
router.use("/shared/welcomePage", express.static(path.join(baseUIPath, "welcomePage")));

console.log('📦 Static assets configured:');
console.log('  /shared/appView -> Shell assets');
console.log('  /shared/welcomePage -> Welcome page assets');

// ========================================
// WELCOME PAGE ROUTES (Standalone - No Shell)
// ========================================

router.get(["/", "/home"], (req, res) => {
    const welcomePagePath = path.join(baseUIPath, "welcomePage", "index.html");
    
    console.log(`🏠 Serving welcome page: ${welcomePagePath}`);
    
    if (fs.existsSync(welcomePagePath)) {
        res.sendFile(welcomePagePath);
    } else {
        console.error('❌ Welcome page not found:', welcomePagePath);
        res.status(404).send(`
            <html>
                <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                    <h1>Welcome Page Not Found</h1>
                    <p>Expected location: ${welcomePagePath}</p>
                    <p><a href="/health">Check System Health</a></p>
                </body>
            </html>
        `);
    }
});

// ========================================
// APP ROUTES (Delegate to app-specific routes)
// ========================================

// Data Comparison App Routes
router.use("/data-comparison", (req, res, next) => {
    console.log(`🔀 Delegating to data-comparison: ${req.method} ${req.path}`);
    next();
}, require("../../apps/data-comparison/routes"));

// Upcoming App Routes  
/*router.use("/upcoming-app", (req, res, next) => {
    console.log(`🔀 Delegating to upcoming-app: ${req.method} ${req.path}`);
    next();
}, require("../../apps/permissions-analyser/routes"));*/

// ========================================
// API ENDPOINTS
// ========================================

// Get available apps
// Add this route to match what the welcome page expects
router.get("/utils/get-apps", (req, res) => {
    console.log('📋 Legacy API: Getting available apps (utils endpoint)');
    
    const apps = [];
    const appsDir = path.join(projectRoot, "apps");
    
    if (fs.existsSync(appsDir)) {
        const appDirs = fs.readdirSync(appsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const appName of appDirs) {
            apps.push({
                name: appName,
                title: appName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                description: `${appName.replace(/-/g, ' ')} application for Salesforce CPQ`,
                path: `/${appName}`,
                version: "2.0.0",
                status: "ready"
            });
        }
    }
    
    res.json(apps); // Return just the array for compatibility
});
// System health check
router.get("/health", (req, res) => {
    console.log('🏥 Health check requested');
    
    const health = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "2.0.0",
        components: {
            sharedUI: fs.existsSync(baseUIPath),
            welcomePage: fs.existsSync(path.join(baseUIPath, "welcomePage", "index.html")),
            shellAssets: fs.existsSync(path.join(baseUIPath, "appView", "index.html")),
            apps: {}
        }
    };
    
    // Check app health
    const appsDir = path.join(projectRoot, "apps");
    if (fs.existsSync(appsDir)) {
        const appDirs = fs.readdirSync(appsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        for (const appName of appDirs) {
            health.components.apps[appName] = {
                exists: true,
                routes: fs.existsSync(path.join(appsDir, appName, "routes", "index.js")),
                state: fs.existsSync(path.join(appsDir, appName, "state", "index.js"))
            };
        }
    }
    
    console.log('✅ Health check complete:', health.status);
    res.json(health);
});

// Debug info endpoint
router.get("/debug", (req, res) => {
    console.log('🐛 Debug info requested');
    
    const debugInfo = {
        projectRoot: projectRoot,
        baseUIPath: baseUIPath,
        timestamp: new Date().toISOString(),
        environment: {
            nodeVersion: process.version,
            platform: process.platform,
            cwd: process.cwd()
        },
        directories: {
            shared: fs.existsSync(path.join(projectRoot, "shared")),
            apps: fs.existsSync(path.join(projectRoot, "apps")),
            sharedUI: fs.existsSync(baseUIPath)
        }
    };
    
    res.json(debugInfo);
});

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler for unmatched routes
router.use((req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
    
    res.status(404).json({
        error: "Route not found",
        method: req.method,
        path: req.path,
        timestamp: new Date().toISOString(),
        availableRoutes: [
            "/",
            "/home", 
            "/data-comparison",
            "/upcoming-app",
            "/utils/get-apps",
            "/health",
            "/debug"
        ]
    });
});

console.log('🔗 Shared routes configured successfully');
console.log('📍 Available routes:');
console.log('  GET  / -> Welcome page');
console.log('  GET  /home -> Welcome page');
console.log('  USE  /data-comparison/* -> Data comparison app');
console.log('  USE  /upcoming-app/* -> Upcoming app');
console.log('  GET  /utils/get-apps -> Available apps');
console.log('  GET  /health -> System health');
console.log('  GET  /debug -> Debug information');

module.exports = router;