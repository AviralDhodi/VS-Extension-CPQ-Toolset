// CPQ Toolset v3 - Express Server
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const { getInstance: getPathResolver } = require('./shared/utils/pathResolver');
const { logger } = require('./shared/utils/logger');

const app = express();
const PORT = process.env.PORT || 3030;
const pathResolver = getPathResolver();

// Log startup info
logger.info('Starting CPQ Toolset v3...', {
  nodeVersion: process.version,
  platform: process.platform,
  isBundled: pathResolver.isBundled,
  extensionRoot: pathResolver.extensionRoot,
  runtimeDir: pathResolver.runtimeDir
});

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use(logger.middleware());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = pathResolver.resolveRuntime('tmp', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.json', '.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, CSV, and Excel files are allowed.'));
    }
  }
});

// Static file serving
app.use('/static', express.static(pathResolver.resolveRuntime('static')));
// Serve shared assets including SLDS icons with cache control
app.use('/shared/assets', express.static(pathResolver.resolveRuntime('shared/assets'), {
  etag: true,
  setHeaders: (res, path) => {
    // Set cache headers to prevent caching during development
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      isBundled: pathResolver.isBundled,
      nodeVersion: process.version,
      platform: process.platform
    }
  });
});

// Debug info endpoint
app.get('/debug', (req, res) => {
  const apps = pathResolver.getAvailableApps();
  res.json({
    paths: {
      extensionRoot: pathResolver.extensionRoot,
      runtimeDir: pathResolver.runtimeDir,
      isBundled: pathResolver.isBundled
    },
    availableApps: apps,
    environment: process.env,
    process: {
      cwd: process.cwd(),
      argv: process.argv,
      execPath: process.execPath
    }
  });
});

// Root route is now handled by shared routes

// Utility endpoints
app.get('/utils/get-apps', (req, res) => {
  const apps = pathResolver.getAvailableApps();
  res.json({
    apps: apps.map(appName => {
      try {
        const appModule = require(path.join(pathResolver.getAppPath(appName), 'index.js'));
        return {
          name: appName,
          title: appModule.title || appName,
          description: appModule.description || 'No description available',
          version: appModule.version || '1.0.0',
          active: true
        };
      } catch (error) {
        return {
          name: appName,
          title: appName,
          description: 'App configuration error',
          version: 'Unknown',
          active: false,
          error: error.message
        };
      }
    })
  });
});

// Load shared routes first
try {
  const sharedRoutesPath = pathResolver.getSharedModule('routes', 'index.js');
  if (fs.existsSync(sharedRoutesPath)) {
    const sharedRoutes = require(sharedRoutesPath);
    app.use(sharedRoutes);
    logger.info('Loaded shared routes');
  }
} catch (error) {
  logger.error('Failed to load shared routes', {
    error: error.message,
    stack: error.stack.split('\n').slice(0, 5).join('\n')
  });
}

// Load app routes dynamically
const loadAppRoutes = () => {
  const apps = pathResolver.getAvailableApps();
  
  apps.forEach(appName => {
    try {
      const routesPath = path.join(pathResolver.getAppPath(appName), 'routes', 'index.js');
      if (fs.existsSync(routesPath)) {
        const appRoutes = require(routesPath);
        app.use(`/${appName}`, appRoutes);
        logger.info(`Loaded routes for app: ${appName}`);
      } else {
        logger.warn(`No routes found for app: ${appName}`);
      }
    } catch (error) {
      logger.error(`Failed to load routes for app: ${appName}`, { 
        error: error.message,
        stack: error.stack.split('\n').slice(0, 5).join('\n')
      });
    }
  });
};

// Load apps
loadAppRoutes();

// 404 handler
app.use('*', (req, res) => {
  logger.warn(`404 Not Found: ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
    suggestion: 'Check available endpoints at /utils/get-apps'
  });
});

// Error handler
app.use((error, req, res, next) => {
  logger.error('Server Error:', error);
  
  // Handle multer errors
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size exceeds the 10MB limit',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`CPQ Toolset v3 running on http://localhost:${PORT}`);
  logger.info(`Extension root: ${pathResolver.extensionRoot}`);
  logger.info(`Runtime directory: ${pathResolver.runtimeDir}`);
  logger.info(`Bundled mode: ${pathResolver.isBundled}`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connections, file streams, etc.
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for testing
module.exports = app;