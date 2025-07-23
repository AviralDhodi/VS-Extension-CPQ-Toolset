// shared/routes/index.js - Original working routing logic
const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();

const projectRoot = process.cwd();
const baseUIPath = path.join(projectRoot, "shared", "UI");

console.log('🔗 Shared routes initializing...');
console.log('📂 Project root:', projectRoot);
console.log('🎨 Base UI path:', baseUIPath);

// Health check endpoint
router.get("/health", (req, res) => {
    res.json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        version: "3.0.0"
    });
});

// Root route - serve app selection page
router.get("/", (req, res) => {
    console.log('🏠 Root route - serving app selection page');
    
    try {
        const rootPagePath = path.join(baseUIPath, "root", "index.html");
        
        if (fs.existsSync(rootPagePath)) {
            const rootHtml = fs.readFileSync(rootPagePath, 'utf8');
            res.send(rootHtml);
        } else {
            console.error('❌ Root page not found');
            res.status(500).json({ error: 'Root page not found' });
        }
    } catch (error) {
        console.error('❌ Error serving root page:', error);
        res.status(500).json({ error: error.message });
    }
});

// Static assets for shell UI
router.use("/shared/appView", express.static(path.join(baseUIPath, "appView")));
router.use("/shared/welcomePage", express.static(path.join(baseUIPath, "welcomePage")));

// SLDS styles
router.use("/shared/styles", express.static(path.join(projectRoot, "shared", "styles")));

// Data Comparison App Routes
try {
    const dataComparisonRoutes = require("../../apps/data-comparison/routes");
    router.use("/data-comparison", (req, res, next) => {
        console.log(`🔀 Delegating to data-comparison: ${req.method} ${req.path}`);
        next();
    }, dataComparisonRoutes);
} catch (error) {
    console.warn('⚠️ Data comparison routes not found');
}

// Permissions Analyser App Routes
try {
    const permissionsAnalyserRoutes = require("../../apps/permissions-analyser/routes");
    router.use("/permissions-analyser", (req, res, next) => {
        console.log(`🔀 Delegating to permissions-analyser: ${req.method} ${req.path}`);
        next();
    }, permissionsAnalyserRoutes);
} catch (error) {
    console.warn('⚠️ Permissions analyser routes not found:', error.message);
    router.use("/permissions-analyser", (req, res) => {
        res.status(501).json({
            error: "Not Implemented",
            message: "Permissions Analyser app is not properly configured"
        });
    });
}

module.exports = router;