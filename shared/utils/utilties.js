const path = require('path');
const fs = require('fs');

// Simple logger fallback if Logger directory doesn't exist yet
let logger;
try {
    const { createLogger } = require('./Logger');
    logger = createLogger({
        logLevel: 'debug',
        appName: 'Extension : Utilities',
        location: 'utilities.js'
    });
} catch (error) {
    // Fallback logger
    logger = {
        info: (msg, data) => console.log(`[INFO] [Extension : Utilities] ${msg}`, data || ''),
        warn: (msg, data) => console.warn(`[WARN] [Extension : Utilities] ${msg}`, data || ''),
        error: (msg, data) => console.error(`[ERROR] [Extension : Utilities] ${msg}`, data || '')
    };
}

function getApps() {
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
                        path: `/${appName}`,
                        version: appConfig.version || '1.0.0'
                    });
                    logger.info('App discovered', { appName, title: appConfig.title });
                } catch (error) {
                    logger.warn('Error loading app config', { appName, error: error.message });
                }
            } else {
                // Add apps without index.js (like your current setup)
                discoveredApps.push({
                    name: appName,
                    title: appName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    description: `${appName} application`,
                    path: `/${appName}`,
                    version: '1.0.0'
                });
                logger.info('App discovered (no config)', { appName });
            }
        }
    } else {
        logger.warn('Apps directory not found', { appsDir });
    }
    
    return discoveredApps;
}

module.exports = { 
    getApps 
};