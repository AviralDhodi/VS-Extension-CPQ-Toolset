// CPQ Toolset v3 - Data Comparison Routes
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getInstance: getPathResolver } = require('../../../shared/utils/pathResolver');
const { logger } = require('../../../shared/utils/logger');
const { getInstance: getSFDXRunner } = require('../../../shared/utils/sfdxRunner');
const { getInstance: getGraphQLRunner } = require('../../../shared/utils/graphqlRunner');
const { getInstance: getPythonRunner } = require('../../../shared/utils/pythonRunner');

const router = express.Router();
const pathResolver = getPathResolver();

// Initialize utilities
const sfdxRunner = getSFDXRunner();
const graphqlRunner = getGraphQLRunner();
const pythonRunner = getPythonRunner();

// Import state manager
const stateManager = require('../state');

// Global comparison state tracking
const activeComparisons = new Map();
const comparisonResults = new Map();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = pathResolver.getStoragePath('data-comparison', 'uploads');
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
    const allowedTypes = ['.json', '.csv', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON, CSV, and Excel files are allowed'), false);
    }
  }
});

// Helper function to serve component HTML
function serveComponent(componentName, data = {}) {
  return (req, res) => {
    try {
      const htmlPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.html');
      const cssPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.css');
      const jsPath = pathResolver.getComponentPath('data-comparison', componentName, 'index.js');

      if (!fs.existsSync(htmlPath)) {
        throw new Error(`Component ${componentName} not found`);
      }

      let html = fs.readFileSync(htmlPath, 'utf8');
      let css = '';
      let js = '';

      if (fs.existsSync(cssPath)) {
        css = fs.readFileSync(cssPath, 'utf8');
      }

      if (fs.existsSync(jsPath)) {
        js = fs.readFileSync(jsPath, 'utf8');
      }

      // For improved config generator
      if (componentName === 'configGenerator' && stateManager.shouldUseImproved(componentName)) {
        const improvedHtmlPath = pathResolver.getComponentPath('data-comparison', componentName, 'improved-index.html');
        const improvedCssPath = pathResolver.getComponentPath('data-comparison', componentName, 'improved-index.css');
        const improvedJsPath = pathResolver.getComponentPath('data-comparison', componentName, 'improved-index.js');

        if (fs.existsSync(improvedHtmlPath)) {
          html = fs.readFileSync(improvedHtmlPath, 'utf8');
          if (fs.existsSync(improvedCssPath)) {
            css = fs.readFileSync(improvedCssPath, 'utf8');
          }
          if (fs.existsSync(improvedJsPath)) {
            js = fs.readFileSync(improvedJsPath, 'utf8');
          }
        }
      }

      // Inject data, CSS, and JS into HTML
      const dataScript = `<script>window.componentData = ${JSON.stringify(data)};</script>`;
      const styleTag = css ? `<style>${css}</style>` : '';
      const scriptTag = js ? `<script>${js}</script>` : '';

      // Insert before closing head tag
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${dataScript}\n${styleTag}\n</head>`);
      } else {
        html = `${dataScript}\n${styleTag}\n${html}`;
      }

      // Insert JS before closing body tag
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${scriptTag}\n</body>`);
      } else {
        html = `${html}\n${scriptTag}`;
      }

      res.send(html);
    } catch (error) {
      logger.error(`Error serving component ${componentName}:`, error);
      res.status(500).json({ error: error.message });
    }
  };
}

// Simple direct routing - no iframes, no shell
router.get('/', serveComponent('welcome'));

// Component routes
router.get('/welcome', serveComponent('welcome'));
router.get('/config-generator', serveComponent('configGenerator'));
router.get('/org-selection', serveComponent('orgSelection'));
router.get('/object-selection', serveComponent('objectSelection'));
router.get('/filter-configuration', serveComponent('filterConfiguration'));
router.get('/comparison-status', serveComponent('comparisonStatus'));
router.get('/comparison-viewer', serveComponent('comparisonViewer'));

// Removed iframe-specific routes - everything is served directly

// Static assets for components
router.use('/components', express.static(path.join(pathResolver.getAppPath('data-comparison'), 'components')));

// API Routes

// Get authenticated organizations
router.get('/api/data-comparison/orgs', async (req, res) => {
  try {
    logger.info('Fetching authenticated organizations');
    const orgs = await sfdxRunner.getAuthenticatedOrgs();
    res.json({ orgs });
  } catch (error) {
    logger.error('Failed to fetch organizations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate organizations
router.post('/api/data-comparison/orgs/validate', async (req, res) => {
  try {
    const { selectedOrgs } = req.body;
    
    if (!selectedOrgs || selectedOrgs.length < 2) {
      return res.status(400).json({ error: 'At least 2 organizations must be selected' });
    }

    logger.info(`Validating ${selectedOrgs.length} organizations`);
    
    // Validate each org connection
    const validationResults = await Promise.all(
      selectedOrgs.map(async (orgAlias) => {
        try {
          const isValid = await sfdxRunner.validateOrgConnection(orgAlias);
          return { orgAlias, isValid, error: null };
        } catch (error) {
          return { orgAlias, isValid: false, error: error.message };
        }
      })
    );

    const invalidOrgs = validationResults.filter(r => !r.isValid);
    if (invalidOrgs.length > 0) {
      return res.status(400).json({
        error: 'Some organizations failed validation',
        details: invalidOrgs
      });
    }

    res.json({ 
      valid: true, 
      message: 'All organizations validated successfully',
      orgs: selectedOrgs
    });
  } catch (error) {
    logger.error('Organization validation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get common objects across organizations
router.post('/api/objects/common', async (req, res) => {
  try {
    const { orgs } = req.body;
    
    if (!orgs || orgs.length < 2) {
      return res.status(400).json({ error: 'At least 2 organizations required' });
    }

    logger.info(`Finding common objects across ${orgs.length} organizations`);

    // Get objects from each org
    const orgObjects = await Promise.all(
      orgs.map(async (orgAlias) => {
        const objects = await sfdxRunner.getOrgObjects(orgAlias);
        return { orgAlias, objects };
      })
    );

    // Find common objects
    const commonObjects = findCommonObjects(orgObjects);

    res.json({ 
      commonObjects,
      totalCount: commonObjects.length,
      orgCount: orgs.length
    });
  } catch (error) {
    logger.error('Failed to get common objects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get object fields
router.post('/api/objects/:objectName/fields', async (req, res) => {
  try {
    const { objectName } = req.params;
    const { orgs } = req.body;

    if (!orgs || orgs.length === 0) {
      return res.status(400).json({ error: 'Organizations required' });
    }

    logger.info(`Getting fields for ${objectName} across ${orgs.length} organizations`);

    // Get fields from first org (assuming schema is consistent)
    const fields = await sfdxRunner.getObjectFields(orgs[0], objectName);

    res.json({ 
      objectName,
      fields,
      fieldCount: fields.length
    });
  } catch (error) {
    logger.error('Failed to get object fields:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload configuration
router.post('/api/config/upload', upload.single('configFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let config;
    
    // Parse file based on type
    if (fileExt === '.json') {
      const content = fs.readFileSync(filePath, 'utf8');
      config = JSON.parse(content);
    } else if (fileExt === '.csv') {
      // Parse CSV to config format
      config = await parseCSVConfig(filePath);
    } else if (fileExt === '.xlsx' || fileExt === '.xls') {
      // Parse Excel to config format
      config = await parseExcelConfig(filePath);
    }

    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      fs.unlinkSync(filePath); // Clean up
      return res.status(400).json({ error: validation.error });
    }

    // Save to config directory
    const configId = `config_${Date.now()}`;
    const configPath = pathResolver.getStoragePath('data-comparison', 'config', `${configId}.json`);
    const configDir = pathResolver.getStoragePath('data-comparison', 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    fs.unlinkSync(filePath); // Clean up upload

    res.json({ 
      success: true, 
      configId,
      config
    });
  } catch (error) {
    logger.error('Configuration upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate configuration
router.post('/api/data-comparison/config/generate', async (req, res) => {
  try {
    const config = req.body;
    
    // Validate configuration
    const validation = validateConfig(config);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Generate unique config ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const configId = `cpq-config-${timestamp}`;
    
    // Save configuration
    const configPath = pathResolver.getStoragePath('data-comparison', 'config', `${configId}.json`);
    const configDir = pathResolver.getStoragePath('data-comparison', 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    logger.info(`Configuration generated: ${configId}`);

    res.json({ 
      success: true,
      configId,
      configPath,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    logger.error('Configuration generation failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start comparison
router.post('/api/comparison/start', async (req, res) => {
  try {
    const { configId, configPath } = req.body;
    
    if (!configId && !configPath) {
      return res.status(400).json({ error: 'Configuration ID or path required' });
    }

    // Load configuration
    let config;
    let actualConfigPath = configPath;
    
    if (configId && !configPath) {
      actualConfigPath = pathResolver.getStoragePath('data-comparison', 'config', `${configId}.json`);
    }

    if (!fs.existsSync(actualConfigPath)) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    config = JSON.parse(fs.readFileSync(actualConfigPath, 'utf8'));

    // Generate comparison ID
    const comparisonId = `comp_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // Initialize comparison state
    activeComparisons.set(comparisonId, {
      id: comparisonId,
      config,
      configPath: actualConfigPath,
      status: 'initializing',
      progress: 0,
      startTime: new Date(),
      phases: {
        dataFetch: { status: 'pending', progress: 0 },
        dataPrep: { status: 'pending', progress: 0 },
        comparison: { status: 'pending', progress: 0 },
        results: { status: 'pending', progress: 0 }
      }
    });

    // Start comparison process asynchronously
    startComparisonProcess(comparisonId, config, actualConfigPath);

    res.json({
      success: true,
      comparisonId,
      message: 'Comparison started',
      statusUrl: `/data-comparison/api/comparison/status/${comparisonId}`
    });
  } catch (error) {
    logger.error('Failed to start comparison:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get comparison status
router.get('/api/comparison/status/:id', (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id);

  if (!comparison) {
    return res.status(404).json({ error: 'Comparison not found' });
  }

  res.json({
    id: comparison.id,
    status: comparison.status,
    progress: comparison.progress,
    startTime: comparison.startTime,
    phases: comparison.phases,
    error: comparison.error,
    endTime: comparison.endTime,
    resultPath: comparison.resultPath
  });
});

// Download comparison results
router.get('/api/comparison/:id/download', (req, res) => {
  const { id } = req.params;
  const comparison = activeComparisons.get(id) || comparisonResults.get(id);

  if (!comparison || !comparison.resultPath) {
    return res.status(404).json({ error: 'Results not found' });
  }

  if (!fs.existsSync(comparison.resultPath)) {
    return res.status(404).json({ error: 'Result file not found' });
  }

  res.download(comparison.resultPath, `comparison_${id}.xlsx`);
});

// State management routes
router.get('/api/state', (req, res) => {
  res.json(stateManager.getState());
});

router.post('/api/state/set', (req, res) => {
  const { component, data } = req.body;
  stateManager.setState(component, data);
  res.json({ success: true });
});

router.post('/api/state/welcome', (req, res) => {
  stateManager.transitionTo('welcome');
  res.json({ success: true, state: stateManager.getState() });
});

router.post('/api/state/config-generator', (req, res) => {
  stateManager.transitionTo('config-generator');
  res.json({ success: true, state: stateManager.getState() });
});

// Install Python dependencies
router.post('/api/install-python-deps', async (req, res) => {
  try {
    logger.info('Installing Python dependencies...');
    await pythonRunner.installDependencies();
    res.json({ success: true, message: 'Python dependencies installed successfully' });
  } catch (error) {
    logger.error('Failed to install Python dependencies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper Functions

function findCommonObjects(orgObjects) {
  if (orgObjects.length === 0) return [];

  // Get object names from first org
  let commonNames = new Set(orgObjects[0].objects.map(obj => obj.name));

  // Find intersection with other orgs
  for (let i = 1; i < orgObjects.length; i++) {
    const orgObjNames = new Set(orgObjects[i].objects.map(obj => obj.name));
    commonNames = new Set([...commonNames].filter(name => orgObjNames.has(name)));
  }

  // Get full object details from first org
  return orgObjects[0].objects.filter(obj => commonNames.has(obj.name));
}

function validateConfig(config) {
  if (!config) {
    return { valid: false, error: 'Configuration is required' };
  }

  if (!config.orgs || config.orgs.length < 2) {
    return { valid: false, error: 'At least 2 organizations required' };
  }

  if (!config.objects || Object.keys(config.objects).length === 0) {
    return { valid: false, error: 'At least one object must be configured' };
  }

  return { valid: true };
}

async function startComparisonProcess(comparisonId, config, configPath) {
  const comparison = activeComparisons.get(comparisonId);
  
  try {
    // Phase 1: Data Fetching
    logger.info(`Starting data fetch for comparison ${comparisonId}`);
    comparison.status = 'fetching_data';
    comparison.phases.dataFetch.status = 'in_progress';

    // Create data extraction directory
    const dataDir = pathResolver.getStoragePath('data-comparison', 'data-extract', comparisonId);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Use worker coordinator for parallel fetching
    const { FetchCoordinator } = require(pathResolver.getWorkerPath('data-comparison', 'spawnFetchers'));
    const fetchCoordinator = new FetchCoordinator();
    
    await fetchCoordinator.startParallelFetching(config, dataDir, (progress) => {
      comparison.phases.dataFetch.progress = progress;
      comparison.progress = progress * 0.4; // Data fetch is 40% of total
    });

    comparison.phases.dataFetch.status = 'completed';
    comparison.phases.dataFetch.progress = 100;

    // Phase 2: Data Preparation (Convert to Parquet)
    logger.info(`Starting data preparation for comparison ${comparisonId}`);
    comparison.status = 'preparing_data';
    comparison.phases.dataPrep.status = 'in_progress';

    const { ParquetConverter } = require(pathResolver.getWorkerPath('data-comparison', 'convertParquet'));
    const converter = new ParquetConverter();
    
    // Convert all JSONL files to Parquet
    const conversionResult = await converter.autoConvert(dataDir, {
      recursive: true,
      cleanup: false
    });
    
    comparison.phases.dataPrep.progress = 100;
    comparison.progress = 60; // Data prep complete

    comparison.phases.dataPrep.status = 'completed';
    comparison.phases.dataPrep.progress = 100;

    // Phase 2.5: Duplicate Foreign Key Detection
    logger.info(`Running duplicate foreign key detection for ${comparisonId}`);
    comparison.status = 'detecting_duplicates';
    comparison.phases.dataPrep.subPhase = 'duplicate_detection';
    
    // Run duplicate FK detector
    const duplicateDetectorPath = pathResolver.getPythonScript('data-comparison', 'duplicate_fk_detector.py');
    try {
      const duplicateResult = await pythonRunner.runScriptFile(duplicateDetectorPath, [
        dataDir,
        '--output-format', 'json'
      ], { mode: 'text' });
      
      // Parse the result to check if there are duplicates
      const lines = duplicateResult.split('\n');
      const jsonLine = lines.find(line => line.includes('"duplicates_found"'));
      if (jsonLine) {
        const result = JSON.parse(jsonLine);
        if (result.duplicates_found) {
          comparison.duplicatesDetected = true;
          comparison.duplicateDetails = result;
          logger.warn(`Duplicate foreign keys detected in ${comparisonId}`, result);
          // In V2, this would prompt user to resolve. For now, log and continue
        }
      }
    } catch (error) {
      logger.warn(`Duplicate detection skipped: ${error.message}`);
    }

    // Phase 3: Run Comparison
    logger.info(`Starting comparison analysis for ${comparisonId}`);
    comparison.status = 'comparing';
    comparison.phases.comparison.status = 'in_progress';

    // Copy config to data directory for Python script - use same filename
    const configFileName = path.basename(configPath);
    const dataConfigPath = path.join(dataDir, configFileName);
    fs.copyFileSync(configPath, dataConfigPath);

    const outputPath = pathResolver.getStoragePath('data-comparison', 'results', `${comparisonId}_results.xlsx`);
    const resultsDir = pathResolver.getStoragePath('data-comparison', 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    await pythonRunner.runMultiOrgComparison(comparisonId, configPath, outputPath, (progress) => {
      comparison.phases.comparison.progress = progress.percentage || 0;
      comparison.progress = 60 + (comparison.phases.comparison.progress * 0.3); // Comparison is 30% of total
      
      if (progress.currentPhase) {
        comparison.phases.comparison.currentPhase = progress.currentPhase;
      }
    });

    comparison.phases.comparison.status = 'completed';
    comparison.phases.comparison.progress = 100;

    // Phase 4: Generate Results
    logger.info(`Generating results for comparison ${comparisonId}`);
    comparison.status = 'generating_results';
    comparison.phases.results.status = 'in_progress';

    // Additional result processing if needed
    comparison.resultPath = outputPath;
    comparison.phases.results.status = 'completed';
    comparison.phases.results.progress = 100;

    // Complete
    comparison.status = 'completed';
    comparison.progress = 100;
    comparison.endTime = new Date();

    // Move to completed comparisons
    comparisonResults.set(comparisonId, comparison);

    logger.info(`Comparison ${comparisonId} completed successfully`);
  } catch (error) {
    logger.error(`Comparison ${comparisonId} failed:`, error);
    comparison.status = 'failed';
    comparison.error = error.message;
    comparison.endTime = new Date();
  }
}

// Utility functions for parsing CSV/Excel configs
async function parseCSVConfig(filePath) {
  const csv = require('csv-parse/sync');
  const content = fs.readFileSync(filePath, 'utf8');
  const records = csv.parse(content, { columns: true });
  
  // Transform CSV to config format
  // Implementation depends on CSV structure
  return transformCSVToConfig(records);
}

async function parseExcelConfig(filePath) {
  const XLSX = require('xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  // Transform Excel to config format
  // Implementation depends on Excel structure
  return transformExcelToConfig(data);
}

function transformCSVToConfig(records) {
  // Placeholder - implement based on actual CSV structure
  return {
    version: '3.0.0',
    orgs: [],
    objects: {},
    metadata: {
      source: 'csv',
      imported: new Date().toISOString()
    }
  };
}

function transformExcelToConfig(data) {
  // Placeholder - implement based on actual Excel structure
  return {
    version: '3.0.0',
    orgs: [],
    objects: {},
    metadata: {
      source: 'excel',
      imported: new Date().toISOString()
    }
  };
}

module.exports = router;