// shared/routes/index.js - Original working routing logic
const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const { getInstance: getPathResolver } = require('../utils/pathResolver');
const pkgReader = require('../utils/pkgFileReader');

const pathResolver = getPathResolver();
const projectRoot = pathResolver.extensionRoot;
const baseUIPath = pathResolver.resolveRuntime("shared", "UI");

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
        
        if (pkgReader.existsSync(rootPagePath)) {
            const rootHtml = pkgReader.readFileSync(rootPagePath, 'utf8');
            res.send(rootHtml);
        } else {
            console.error('❌ Root page not found at:', rootPagePath);
            res.status(500).json({ error: 'Root page not found' });
        }
    } catch (error) {
        console.error('❌ Error serving root page:', error);
        res.status(500).json({ error: error.message });
    }
});

// Static assets for shell UI - custom handler for pkg compatibility
router.use("/shared/appView", (req, res, next) => {
    try {
        const filePath = path.join(baseUIPath, "appView", req.path.slice(1));
        const ext = path.extname(req.path).toLowerCase();
        const encoding = ['.png', '.jpg', '.jpeg', '.gif', '.ico'].includes(ext) ? null : 'utf8';
        
        if (pkgReader.existsSync(filePath)) {
            const content = pkgReader.readFileSync(filePath, encoding);
            
            // Set content type
            const contentTypes = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif'
            };
            
            if (contentTypes[ext]) {
                res.setHeader('Content-Type', contentTypes[ext]);
            }
            
            res.send(content);
        } else {
            next();
        }
    } catch (error) {
        next();
    }
});

router.use("/shared/welcomePage", (req, res, next) => {
    try {
        const filePath = path.join(baseUIPath, "welcomePage", req.path.slice(1));
        const ext = path.extname(req.path).toLowerCase();
        const encoding = ['.png', '.jpg', '.jpeg', '.gif', '.ico'].includes(ext) ? null : 'utf8';
        
        if (pkgReader.existsSync(filePath)) {
            const content = pkgReader.readFileSync(filePath, encoding);
            
            // Set content type
            const contentTypes = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif'
            };
            
            if (contentTypes[ext]) {
                res.setHeader('Content-Type', contentTypes[ext]);
            }
            
            res.send(content);
        } else {
            next();
        }
    } catch (error) {
        next();
    }
});

// SLDS styles
router.use("/shared/styles", (req, res, next) => {
    try {
        const filePath = pathResolver.resolveRuntime("shared", "styles", req.path.slice(1));
        
        if (pkgReader.existsSync(filePath)) {
            const content = pkgReader.readFileSync(filePath, 'utf8');
            res.setHeader('Content-Type', 'text/css');
            res.send(content);
        } else {
            next();
        }
    } catch (error) {
        next();
    }
});

// NOTE: App routes are now loaded directly by server.js to avoid conflicts
// This shared routes file only handles common routes like the root page

module.exports = router;