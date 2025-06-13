const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../shared/logging/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize logger
const logger = createLogger({
    logLevel: 'debug',
    appName: 'CPQ-Server'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(logger.requestMiddleware());

// Static file serving - ORDER MATTERS!
// 1. Shared/web files first (base styles)
app.use(express.static(path.join(__dirname, '../../web')));

// 2. Apps can override/extend with their own assets
app.use('/apps', express.static(path.join(__dirname, '../../apps')));

// Auto-discover apps
function discoverApps() {
    const appsDir = path.join(__dirname, '../../apps');
    const discoveredApps = [];
    
    if (fs.existsSync(appsDir)) {
        const appDirs = fs.readdirSync(appsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
            
        for (const appName of appDirs) {
            const appIndexPath = path.join(appsDir, appName, 'index.js');
            if (fs.existsSync(appIndexPath)) {
                try {
                    const appConfig = require(appIndexPath);
                    discoveredApps.push({
                        name: appName,
                        title: appConfig.title || appName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        description: appConfig.description || `${appName} application`,
                        path: `/api/${appName}`,
                        version: appConfig.version || '1.0.0'
                    });
                    logger.info('App discovered', { appName, title: appConfig.title });
                } catch (error) {
                    logger.warn('Error loading app config', { appName, error: error.message });
                }
            }
        }
    } else {
        logger.warn('Apps directory not found', { appsDir });
    }
    
    return discoveredApps;
}

// Dashboard route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../web/dashboard/index.html'));
});

// API route to get available apps
app.get('/api/apps', (req, res) => {
    const discoveredApps = discoverApps();
    logger.debug('Apps requested', { count: discoveredApps.length });
    res.json(discoveredApps);
});

// Load app routes
function loadAppRoutes() {
    logger.info('🔍 SFDX_PATH from extension:', process.env.SFDX_PATH);
    const discoveredApps = discoverApps();
    
    discoveredApps.forEach(appInfo => {
        try {
            const routePath = path.join(__dirname, `../../apps/${appInfo.name}/routes/index.js`);
            logger.info(routePath);
            if (fs.existsSync(routePath)) {
                const routes = require(routePath);
                app.use(appInfo.path, routes);
                logger.info('App routes loaded', { app: appInfo.name, path: appInfo.path });
            } else {
                logger.debug('No routes file found', { app: appInfo.name, routePath });
            }
        } catch (error) {
            logger.error('Failed to load app routes', { app: appInfo.name, error: error.message });
        }
    });
}

// Load all app routes
loadAppRoutes();

// After loadAppRoutes()
app._router.stack.forEach(layer => {
    if (layer.route) {
        console.log(`Route: ${layer.route.path}`);
    } else if (layer.name === 'router') {
        console.log(`Router mounted at: ${layer.regexp}`);
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        apps: discoverApps().length
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    logger.warn('API endpoint not found', { path: req.path, method: req.method });
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path 
    });
});

// Catch all for SPA routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../web/dashboard/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    logger.error('Server Error', { error: err.message, stack: err.stack });
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message 
    });
});

app.listen(PORT, () => {
    logger.info('CPQ Toolset server started', { 
        port: PORT,
        dashboard: `http://localhost:${PORT}`,
        healthCheck: `http://localhost:${PORT}/api/health`
    });
    
    // Log discovered apps
    const apps = discoverApps();
    if (apps.length > 0) {
        logger.info('Apps available', { apps: apps.map(a => a.name) });
    } else {
        logger.warn('No apps discovered');
    }
});