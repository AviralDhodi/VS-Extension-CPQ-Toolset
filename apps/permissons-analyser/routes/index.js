// apps/upcoming-app/routes/index.js
const express = require("express");
const path = require("path");
const fs = require("fs");

const router = express.Router();

// Get the project root and app paths
const projectRoot = process.cwd();
const baseUIPath = path.join(projectRoot, "shared", "UI");
const appViewPath = path.join(projectRoot, "apps", "upcoming-app", "components", "appView");

console.log(' Upcoming App routes loading...');
console.log(' App view path:', appViewPath);
console.log(' App view exists:', fs.existsSync(appViewPath));

// ========================================
// MAIN APP ROUTES (Shell Integration)
// ========================================

// Main upcoming-app route - serve shell with app loaded
router.get("/", (req, res) => {
    const shellPath = path.join(baseUIPath, "appView", "index.html");
    
    console.log(' Serving shell for upcoming-app:', shellPath);
    console.log(' Shell exists:', fs.existsSync(shellPath));
    
    if (fs.existsSync(shellPath)) {
        // Read shell HTML and modify iframe src to load upcoming-app
        let shellHtml = fs.readFileSync(shellPath, 'utf8');
        shellHtml = shellHtml.replace(
            'src="/"', 
            'src="/app/upcoming-app"'
        );
        res.send(shellHtml);
    } else {
        res.status(404).send('Extension shell not found');
    }
});

// ========================================
// APP CONTENT ROUTES (For iframe loading)
// ========================================

// App content for iframe (the actual app main page)
router.get("/app", (req, res) => {
    const appHtmlPath = path.join(appViewPath, "index.html");
    
    console.log(' Looking for upcoming-app content:', appHtmlPath);
    console.log(' File exists:', fs.existsSync(appHtmlPath));
    
    if (fs.existsSync(appHtmlPath)) {
        console.log(' Serving upcoming-app content');
        res.sendFile(appHtmlPath);
    } else {
        console.log(' Upcoming-app content not found');
        res.status(404).send(`
            <h1>⚡ Upcoming App Not Found</h1>
            <p>Looking for: ${appHtmlPath}</p>
            <p><strong>Status:</strong> In Development</p>
            <p><a href="/"> Back to Home</a></p>
        `);
    }
});

// ========================================
// FEATURE ROUTES (Future Development)
// ========================================

// Placeholder routes for upcoming features
router.get("/features", (req, res) => {
    res.json({
        app: "upcoming-app",
        features: [
            {
                name: "Advanced CPQ Analytics",
                status: "planned",
                description: "Deep analytics for CPQ configurations"
            },
            {
                name: "Automated Testing",
                status: "planned", 
                description: "Automated testing of CPQ rules and workflows"
            },
            {
                name: "Performance Optimization",
                status: "planned",
                description: "Performance analysis and optimization tools"
            }
        ],
        timestamp: new Date().toISOString()
    });
});

router.get("/roadmap", (req, res) => {
    res.send(`
        <h1>🛣️ Upcoming App Roadmap</h1>
        <p>Next-generation CPQ tool features in development</p>
        <ul>
            <li>✨ Advanced CPQ Analytics</li>
            <li>🔬 Automated Testing Framework</li>
            <li>⚡ Performance Optimization Tools</li>
            <li>🤖 AI-Powered Configuration Suggestions</li>
        </ul>
        <p><strong>Status:</strong> In Active Development</p>
        <p><a href="/upcoming-app"> Back to Upcoming App</a></p>
    `);
});

// ========================================
// API ENDPOINTS
// ========================================

router.get("/api/status", (req, res) => {
    res.json({
        app: "upcoming-app",
        status: "development",
        version: "1.0.0-beta",
        features: {
            analytics: false,
            testing: false,
            optimization: false,
            aiSuggestions: false
        },
        estimatedRelease: "Q3 2025",
        timestamp: new Date().toISOString()
    });
});

router.get("/api/health", (req, res) => {
    res.json({
        app: "upcoming-app",
        status: "healthy",
        version: "1.0.0-beta",
        components: {
            appView: fs.existsSync(appViewPath),
            routes: true,
            api: true
        },
        development: true,
        timestamp: new Date().toISOString()
    });
});

// ========================================
// STATIC ASSETS
// ========================================

// Serve static assets for upcoming-app
router.use("/", express.static(appViewPath));

console.log(' Upcoming App routes configured:');
console.log('   /upcoming-app/  Shell + App');
console.log('   /upcoming-app/app  App content only');
console.log('   /upcoming-app/features  Feature list');
console.log('   /upcoming-app/roadmap  Development roadmap');
console.log('   /upcoming-app/api/*  API endpoints');

module.exports = router;