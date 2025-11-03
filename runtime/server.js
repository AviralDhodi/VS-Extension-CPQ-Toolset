// CPQ Toolset v3 - Express Server
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const { getInstance: getPathResolver } = require('./shared/utils/pathResolver');
const { logger } = require('./shared/utils/logger');
const pkgReader = require('./shared/utils/pkgFileReader');

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
app.use('/shared/assets', (req, res, next) => {
  try {
    const assetPath = pathResolver.resolveRuntime('shared', 'assets', req.path.slice(1));
    
    // Determine if this is a binary file
    const ext = path.extname(req.path).toLowerCase();
    const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf'];
    const encoding = binaryExtensions.includes(ext) ? null : 'utf8';
    
    const content = pkgReader.readFileSync(assetPath, encoding);
    
    // Set appropriate content type
    const contentTypes = {
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.html': 'text/html',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf'
    };
    
    if (contentTypes[ext]) {
      res.setHeader('Content-Type', contentTypes[ext]);
    }
    
    // Set cache headers for assets
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    res.send(content);
  } catch (error) {
    // File not found, continue to next middleware
    next();
  }
});

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

// Add root route directly
app.get('/', (req, res) => {
  // For pkg compatibility, serve HTML directly
  const rootHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CPQ Toolset v3</title>
    <link rel="stylesheet" href="/shared/assets/slds/styles/salesforce-lightning-design-system.min.css">
    <link rel="stylesheet" href="/shared/assets/spinner-fix.css">
</head>
<body>
    <div class="slds-scope">
        <!-- Page Header -->
        <header class="slds-page-header">
            <div class="slds-page-header__row">
                <div class="slds-page-header__col-title">
                    <div class="slds-media">
                        <div class="slds-media__figure">
                            <span class="slds-icon_container slds-icon-standard-lightning-component">
                                <svg class="slds-icon slds-page-header__icon">
                                    <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#lightning_component"></use>
                                </svg>
                            </span>
                        </div>
                        <div class="slds-media__body">
                            <h1 class="slds-page-header__title slds-m-right_small slds-align-middle slds-truncate">CPQ Toolset v3</h1>
                            <p class="slds-page-header__info">Salesforce CPQ Development & Analysis Platform</p>
                        </div>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <div class="slds-p-around_medium">
            <h2 class="slds-text-heading_medium slds-m-bottom_medium">Available Applications</h2>
            
            <!-- Application Cards Grid -->
            <div class="slds-grid slds-gutters">
                <!-- Data Comparison App -->
                <div class="slds-col slds-size_1-of-2">
                    <article class="slds-card">
                        <div class="slds-card__header slds-grid">
                            <header class="slds-media slds-media_center slds-has-flexi-truncate">
                                <div class="slds-media__figure">
                                    <span class="slds-icon_container slds-icon-standard-data-mapping">
                                        <svg class="slds-icon slds-icon_small">
                                            <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#data_mapping"></use>
                                        </svg>
                                    </span>
                                </div>
                                <div class="slds-media__body">
                                    <h2 class="slds-card__header-title">
                                        <a href="/data-comparison" class="slds-card__header-link slds-truncate">
                                            <span>Data Comparison</span>
                                        </a>
                                    </h2>
                                </div>
                            </header>
                        </div>
                        <div class="slds-card__body slds-card__body_inner">
                            Compare Salesforce CPQ configurations across multiple orgs with advanced filtering and analysis.
                        </div>
                        <footer class="slds-card__footer">
                            <a class="slds-card__footer-action" href="/data-comparison">Launch
                                <span class="slds-assistive-text">Data Comparison</span>
                            </a>
                        </footer>
                    </article>
                </div>

                <!-- Permissions Analyser App -->
                <div class="slds-col slds-size_1-of-2">
                    <article class="slds-card">
                        <div class="slds-card__header slds-grid">
                            <header class="slds-media slds-media_center slds-has-flexi-truncate">
                                <div class="slds-media__figure">
                                    <span class="slds-icon_container slds-icon-standard-user">
                                        <svg class="slds-icon slds-icon_small">
                                            <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#user"></use>
                                        </svg>
                                    </span>
                                </div>
                                <div class="slds-media__body">
                                    <h2 class="slds-card__header-title">
                                        <a href="/permissions-analyser" class="slds-card__header-link slds-truncate">
                                            <span>Permissions Analyser</span>
                                        </a>
                                    </h2>
                                </div>
                            </header>
                        </div>
                        <div class="slds-card__body slds-card__body_inner">
                            Analyze and compare permission sets, profiles, and security configurations.
                        </div>
                        <footer class="slds-card__footer">
                            <a class="slds-card__footer-action" href="/permissions-analyser">Launch
                                <span class="slds-assistive-text">Permissions Analyser</span>
                            </a>
                        </footer>
                    </article>
                </div>

            </div>
        </div>
    </div>
</body>
</html>`;
  
  res.send(rootHtml);
});

// Load shared routes for other common routes
try {
  const sharedRoutesPath = pathResolver.getSharedModule('routes', 'index.js');
  if (pkgReader.existsSync(sharedRoutesPath)) {
    const sharedRoutes = require(sharedRoutesPath);
    app.use(sharedRoutes);
    logger.info('Loaded shared routes');
  } else {
    logger.warn('Shared routes not found at:', sharedRoutesPath);
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
  
  logger.info(`Loading routes for ${apps.length} apps: ${apps.join(', ')}`);
  
  apps.forEach(appName => {
    try {
      const appPath = pathResolver.getAppPath(appName);
      const routesPath = path.join(appPath, 'routes', 'index.js');
      
      logger.info(`Checking routes for ${appName}:`, {
        appPath,
        routesPath,
        exists: pkgReader.existsSync(routesPath)
      });
      
      if (pkgReader.existsSync(routesPath)) {
        const appRoutes = require(routesPath);
        app.use(`/${appName}`, appRoutes);
        logger.info(`Successfully loaded routes for app: ${appName}`);
      } else {
        logger.warn(`No routes found for app: ${appName} at: ${routesPath}`);
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

// Debug endpoint to check loaded routes
app.get('/debug/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      routes.push({
        path: middleware.regexp.toString(),
        type: 'router'
      });
    }
  });
  
  res.json({
    routes,
    apps: pathResolver.getAvailableApps(),
    pathResolver: {
      isBundled: pathResolver.isBundled,
      extensionRoot: pathResolver.extensionRoot,
      runtimeDir: pathResolver.runtimeDir
    }
  });
});

// 404 handler - must be last
app.use((req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`, {
    headers: req.headers,
    query: req.query
  });
  
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    availableApps: pathResolver.getAvailableApps(),
    message: 'The requested route was not found. Available apps: ' + pathResolver.getAvailableApps().join(', ')
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