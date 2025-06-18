const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const {
    dataComparisonSFDX
} = require('../sfdx/commands');
const {
    Validator
} = require('../../../shared/validations');
const {
    createLogger
} = require('../../../shared/logging/logger');
const {
    ComparisonController
} = require('../comparison/controller');
const { spawnFetchers } = require('../worker/spawnFetchers');

const { convertJsonlToParquet } = require('../worker/convertParquet');


const logger = createLogger({
    appName: 'DataComparison'
});
const validator = new Validator(logger);
const comparisonController = new ComparisonController();

const multer = require('multer');
const upload = multer({ dest: 'tmp/uploads/' });

// Main app route - serve the org selection page
router.get('/', (req, res) => {
    logger.debug('Serving org selection page');
    res.sendFile(path.join(__dirname, '../templates/org-selection.html'));
});


// Get latest config file for selected orgs
router.get('/config/latest', async (req, res) => {
    try {
        const {
            orgIds
        } = req.query; // comma-separated org IDs

        if (!orgIds) {
            return res.status(400).json({
                success: false,
                error: 'orgIds parameter required'
            });
        }

        const configDir = path.join(__dirname, '../config');
        if (!fs.existsSync(configDir)) {
            return res.json({
                success: true,
                latestConfig: null,
                message: 'No config directory found'
            });
        }

        // Read all config files
        const files = fs.readdirSync(configDir)
            .filter(file => file.startsWith('config_') && file.endsWith('.json'));

        if (files.length === 0) {
            return res.json({
                success: true,
                latestConfig: null,
                message: 'No config files found'
            });
        }

        // Parse timestamps and find latest for matching orgIds
        const sortedOrgIds = orgIds.split(',').sort().join('_');
        const matchingFiles = files
            .filter(file => file.includes(sortedOrgIds))
            .map(file => {
                // Extract timestamp from filename: config_{orgIds}_{timestamp}.json
                const parts = file.split('_');
                const timestampPart = parts.slice(-1)[0].replace('.json', '');
                const timestamp = new Date(timestampPart.replace(/-/g, ':').replace('T', 'T') + 'Z');

                return {
                    filename: file,
                    timestamp: timestamp,
                    isValid: !isNaN(timestamp.getTime())
                };
            })
            .filter(item => item.isValid)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // DESC

        if (matchingFiles.length === 0) {
            return res.json({
                success: true,
                latestConfig: null,
                message: `No config files found for orgs: ${orgIds}`
            });
        }

        // Load the latest config
        const latestFile = matchingFiles[0];
        const configPath = path.join(configDir, latestFile.filename);
        const configContent = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        logger.info('Latest config loaded', {
            filename: latestFile.filename,
            timestamp: latestFile.timestamp,
            objectsCount: configContent.objects?.length || 0
        });

        res.json({
            success: true,
            latestConfig: {
                filename: latestFile.filename,
                timestamp: latestFile.timestamp,
                content: configContent
            }
        });

    } catch (error) {
        logger.error('Failed to get latest config', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get latest config',
            message: error.message
        });
    }
});

// Get authenticated orgs
router.get('/orgs', async (req, res) => {
    try {
        logger.info('Orgs requested by client');
        const orgs = await dataComparisonSFDX.getAuthenticatedOrgs();

        // Filter out expired scratch orgs and disconnected orgs
        const activeOrgs = orgs.filter(org => {
            if (org.type === 'scratch' && org.isExpired) {
                return false;
            }
            return org.connectedStatus === 'Connected';
        });

        res.json({
            success: true,
            orgs: activeOrgs,
            total: activeOrgs.length
        });

    } catch (error) {
        logger.error('Failed to fetch orgs', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch authenticated orgs',
            message: error.message
        });
    }
});

// Validate selected orgs
router.post('/orgs/validate', async (req, res) => {
    try {
        const {
            selectedOrgs
        } = req.body;

        logger.info('Validating selected orgs', {
            count: selectedOrgs?.length
        });

        if (!selectedOrgs || !Array.isArray(selectedOrgs)) {
            return res.status(400).json({
                success: false,
                error: 'selectedOrgs array is required'
            });
        }

        if (selectedOrgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 orgs must be selected for comparison'
            });
        }

        const usernames = selectedOrgs.map(org => org.username);
        const validationResults = await dataComparisonSFDX.validateMultipleOrgs(usernames);

        // Also validate org structure
        const structureResults = selectedOrgs.map(org => {
            const result = validator.validateOrg(org);
            return {
                username: org.username,
                structureValid: result.isValid,
                structureErrors: result.errors
            };
        });

        // Combine results
        const combinedResults = validationResults.map(result => {
            const structureResult = structureResults.find(s => s.username === result.username);
            return {
                ...result,
                isValid: result.isValid && structureResult.structureValid,
                structureErrors: structureResult.structureErrors
            };
        });

        const allValid = combinedResults.every(r => r.isValid);

        res.json({
            success: allValid,
            results: combinedResults,
            message: allValid ? 'All orgs validated successfully' : 'Some orgs failed validation'
        });

    } catch (error) {
        logger.error('Org validation failed', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Validation failed',
            message: error.message
        });
    }
});

// Get common objects between selected orgs
router.post('/orgs/common-objects', async (req, res) => {
    try {
        const {
            selectedOrgs
        } = req.body;

        logger.info('Finding common objects', {
            orgCount: selectedOrgs?.length
        });

        if (!selectedOrgs || selectedOrgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 orgs required'
            });
        }

        const usernames = selectedOrgs.map(org => org.username);
        const commonObjects = await dataComparisonSFDX.getCommonObjects(usernames);

        res.json({
            success: true,
            objects: commonObjects,
            total: commonObjects.length,
            orgs: usernames
        });

    } catch (error) {
        logger.error('Failed to get common objects', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get common objects',
            message: error.message
        });
    }
});

// Add this route for config generation
router.post('/config/generate', async (req, res) => {
    try {
        const {
            selectedOrgs,
            dateFilters
        } = req.body;

        if (!selectedOrgs || selectedOrgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 orgs required for config generation'
            });
        }

        // Generate config filename
        const orgIds = selectedOrgs.map(org => org.orgId).sort().join('_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const configFilename = `config_${orgIds}_${timestamp}.json`;

        // Create config object
        const config = {
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            orgs: selectedOrgs,
            objects: {}, // Will be populated in next step
            // ✅ Fix: Provide actual dates or null, not strings
            defaultDateFilters: {
                LastModifiedBetween: dateFilters?.LastModifiedBetween || null,
                CreatedBetween: dateFilters?.CreatedBetween || null
            },
            metadata: {
                totalOrgs: selectedOrgs.length,
                orgNames: selectedOrgs.map(org => org.username)
            }
        };
        // Ensure config directory exists
        const configDir = path.join(__dirname, '../config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, {
                recursive: true
            });
        }

        // Save config file
        const configPath = path.join(configDir, configFilename);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        logger.info('Config generated', {
            filename: configFilename,
            orgs: selectedOrgs.length
        });

        res.json({
            success: true,
            configFilename,
            configPath: `/api/data-comparison/config/${configFilename}`,
            message: 'Configuration file generated successfully'
        });

    } catch (error) {
        logger.error('Config generation failed', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to generate configuration',
            message: error.message
        });
    }
});

// Object selection page
router.get('/objects', (req, res) => {
    res.sendFile(path.join(__dirname, '../templates/object-selection.html'));
});

// Update config file route
router.post('/config/update', async (req, res) => {
    try {
        const {
            filename,
            objects
        } = req.body;
        const configPath = path.join(__dirname, '../config', filename);

        if (fs.existsSync(configPath)) {
            const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            currentConfig.objects = objects;
            currentConfig.lastModified = new Date().toISOString();

            fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
            res.json({
                success: true,
                message: 'Config updated successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Config file not found'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/config/upload', upload.single('configFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No config file uploaded'
            });
        }

        // Read and parse uploaded config
        const configPath = req.file.path;
        const configContent = fs.readFileSync(configPath, 'utf8');
        let config;

        try {
            config = JSON.parse(configContent);
        } catch (parseError) {
            return res.status(400).json({
                success: false,
                error: 'Invalid JSON format',
                details: parseError.message
            });
        }

        // Clean up uploaded file
        fs.unlinkSync(configPath);

        // Save validated config to proper location
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const orgIds = config.orgs.map(org => org.orgId.slice(-4)).join('-');
        const configFilename = `config_${orgIds}_${timestamp}.json`;
        
        const configDir = path.join(__dirname, '../config');
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        const finalConfigPath = path.join(configDir, configFilename);
        fs.writeFileSync(finalConfigPath, JSON.stringify(config, null, 2));

        logger.info('Config uploaded and validated', { 
            filename: configFilename, 
            orgs: config.orgs.length,
            objects: Object.keys(config.objects || {}).length
        });

        res.json({
            success: true,
            configFilename,
            message: 'Config uploaded and validated successfully',
            summary: {
                orgs: config.orgs.length,
                objects: Object.keys(config.objects || {}).length
            }
        });

    } catch (error) {
        logger.error('Config upload failed', { error: error.message });
        
        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            error: 'Failed to process config upload',
            message: error.message
        });
    }
});

// Start comparison endpoint
router.post('/comparison/start', async (req, res) => {
    try {
        const { configFilename } = req.body;

        if (!configFilename) {
            return res.status(400).json({
                success: false,
                error: 'Config filename required'
            });
        }

        // Load config
        const configPath = path.join(__dirname, '../config', configFilename);
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                success: false,
                error: 'Config file not found'
            });
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        // Start comparison process
        const comparisonId = `comp_${Date.now()}`;
        
        // Initialize comparison state
        const comparisonState = {
            id: comparisonId,
            status: 'initializing',
            config: config,
            progress: {
                totalObjects: Object.keys(config.objects).length,
                completedObjects: 0,
                currentObject: null,
                phase: 'data_fetch'
            },
            startTime: new Date().toISOString(),
            results: {}
        };

        // Store state (in production, use Redis or database)
        global.comparisonStates = global.comparisonStates || {};
        global.comparisonStates[comparisonId] = comparisonState;

        // Start background process
        startComparisonProcess(comparisonId, config, configPath).catch(error => {
            logger.error('Comparison process failed', { comparisonId, error: error.message });
            comparisonState.status = 'failed';
            comparisonState.error = error.message;
        });

        res.json({
            success: true,
            comparisonId,
            message: 'Comparison started',
            statusUrl: `/api/data-comparison/comparison/status/${comparisonId}`
        });

    } catch (error) {
        logger.error('Failed to start comparison', { error: error.message });
        res.status(500).json({
            success: false,
            error: 'Failed to start comparison',
            message: error.message
        });
    }
});
// AJAX endpoints
router.get('/ajax/objects', async (req, res) => {
    try {
        const config = JSON.parse(req.query.config || '{}');
        const usernames = config.selectedOrgs.map(org => org.username);
        const commonObjects = await dataComparisonSFDX.getCommonObjects(usernames);
        logger.debug("Called common Objects");
        res.json({
            success: true,
            objects: commonObjects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/ajax/fields/:objectName', async (req, res) => {
    try {
        const {
            objectName
        } = req.params;
        const config = JSON.parse(req.query.config || '{}');
        const usernames = config.selectedOrgs.map(org => org.username);

        // Get fields from all orgs and find intersection
        const fieldSets = await Promise.all(
            usernames.map(username => dataComparisonSFDX.describeObject(objectName, username))
        );

        const commonFields = fieldSets[0].fields.filter(field =>
            fieldSets.slice(1).every(fieldSet =>
                fieldSet.fields.some(f => f.name === field.name)
            )
        );

        const fields = commonFields.map(field => ({
            name: field.name,
            label: field.label,
            type: field.type,
            custom: field.custom,
            isLookup: field.type === 'reference',
            referenceTo: field.referenceTo
        }));

        res.json({
            success: true,
            fields,
            lookupFields: fields.filter(f => f.isLookup)
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get fields for lookup object
router.get('/ajax/lookup-fields/:lookupObjectName', async (req, res) => {
    try {
        const {
            lookupObjectName
        } = req.params;
        const config = JSON.parse(req.query.config || '{}');
        const usernames = config.selectedOrgs.map(org => org.username);

        logger.info('Lookup fields request started', {
            lookupObject: lookupObjectName,
            orgCount: usernames.length
        });

        const fieldSets = await Promise.all(
            usernames.map(username => dataComparisonSFDX.describeObject(lookupObjectName, username))
        );

        logger.debug('Field sets retrieved from orgs', {
            lookupObject: lookupObjectName,
            fieldCounts: fieldSets.map((fs, i) => ({
                org: usernames[i],
                count: fs.fields.length
            }))
        });

        const commonFields = fieldSets[0].fields.filter(field =>
            fieldSets.slice(1).every(fieldSet =>
                fieldSet.fields.some(f => f.name === field.name)
            )
        );

        logger.info('Common lookup fields found', {
            lookupObject: lookupObjectName,
            totalFields: fieldSets[0].fields.length,
            commonFields: commonFields.length
        });

        const fields = commonFields.map(field => ({
            name: field.name,
            label: field.label,
            type: field.type
        }));

        res.json({
            success: true,
            fields,
            parentObject: lookupObjectName
        });

        logger.debug('Lookup fields response sent', {
            lookupObject: lookupObjectName,
            fieldsReturned: fields.length
        });

    } catch (error) {
        logger.error('Lookup fields request failed', {
            lookupObject: req.params.lookupObjectName,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/engine/capabilities', async (req, res) => {
    try {
        const capabilities = comparisonController.getEngineCapabilities();
        const pythonAvailable = await comparisonController.checkPythonAvailability();

        res.json({
            success: true,
            engines: capabilities,
            recommendations: {
                smallDatasets: 'nodejs',
                largeDatasets: pythonAvailable ? 'python' : 'nodejs_with_warning',
                pythonAvailable: !!pythonAvailable
            }
        });

    } catch (error) {
        logger.error('Failed to get engine capabilities', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get engine capabilities',
            message: error.message
        });
    }
});

// Add endpoint to get comparison results for a specific object
router.get('/comparison/:comparisonId/results/:objectName', async (req, res) => {
    try {
        const {
            comparisonId,
            objectName
        } = req.params;

        const results = await comparisonController.getComparisonResults(comparisonId, objectName);

        res.json({
            success: true,
            comparisonId,
            objectName,
            source: results.source,
            data: results.results
        });

    } catch (error) {
        logger.error('Failed to get comparison results', {
            comparisonId: req.params.comparisonId,
            objectName: req.params.objectName,
            error: error.message
        });

        res.status(404).json({
            success: false,
            error: 'Comparison results not found',
            message: error.message
        });
    }
});

// Add endpoint to analyze dataset size before starting comparison
router.post('/comparison/analyze', async (req, res) => {
    try {
        const {
            configFilename
        } = req.body;

        if (!configFilename) {
            return res.status(400).json({
                success: false,
                error: 'Config filename required'
            });
        }

        // Load config
        const configPath = path.join(__dirname, '../config', configFilename);
        if (!fs.existsSync(configPath)) {
            return res.status(404).json({
                success: false,
                error: 'Config file not found'
            });
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Analyze dataset without fetching data (estimation)
        const engineSelection = await comparisonController.selectComparisonEngine(config);

        res.json({
            success: true,
            analysis: engineSelection,
            recommendations: {
                estimatedTime: engineSelection.engine === 'python' ? 'fast' : 'medium',
                memoryUsage: engineSelection.engine === 'python' ? 'low' : 'high',
                engineRecommendation: engineSelection.reason
            }
        });

    } catch (error) {
        logger.error('Failed to analyze dataset', {
            error: error.message
        });
        res.status(500).json({
            success: false,
            error: 'Failed to analyze dataset',
            message: error.message
        });
    }
});

// Update the existing comparison status endpoint to include engine info
router.get('/comparison/status/:comparisonId', (req, res) => {
    const {
        comparisonId
    } = req.params;

    const state = global.comparisonStates?.[comparisonId];

    if (!state) {
        return res.status(404).json({
            success: false,
            error: 'Comparison not found'
        });
    }

    res.json({
        success: true,
        comparison: {
            id: state.id,
            status: state.status,
            progress: state.progress,
            startTime: state.startTime,
            endTime: state.endTime,
            error: state.error,
            engineUsed: state.engineUsed,
            engineInfo: state.engineInfo,
            warnings: state.warnings || []
        }
    });
});

// Add to apps/data-comparison/routes/index.js

// Status page route
router.get('/status', (req, res) => {
    logger.debug('Serving comparison status page');
    res.sendFile(path.join(__dirname, '../templates/status.html'));
});

// Results page route (placeholder for future)
router.get('/results', (req, res) => {
    logger.debug('Serving comparison results page');
    // For now, redirect to status if no results page exists yet
    res.redirect('/api/data-comparison/status' + (req.query.comparisonId ? '?comparisonId=' + req.query.comparisonId : ''));
});

// Download comparison results endpoint
router.get('/comparison/:comparisonId/download', async (req, res) => {
    try {
        const { comparisonId } = req.params;
        
        const state = global.comparisonStates?.[comparisonId];
        
        if (!state) {
            return res.status(404).json({
                success: false,
                error: 'Comparison not found'
            });
        }

        if (state.status !== 'completed') {
            return res.status(400).json({
                success: false,
                error: 'Comparison not yet completed'
            });
        }

        // Prepare download data
        const downloadData = {
            comparisonId: comparisonId,
            config: state.config,
            results: state.results,
            engineUsed: state.engineUsed,
            engineInfo: state.engineInfo,
            startTime: state.startTime,
            endTime: state.endTime,
            warnings: state.warnings || [],
            generatedAt: new Date().toISOString()
        };

        // Set headers for file download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="comparison-results-${comparisonId}.json"`);
        
        res.json(downloadData);
        
        logger.info('Comparison results downloaded', { comparisonId });

    } catch (error) {
        logger.error('Failed to download comparison results', { 
            comparisonId: req.params.comparisonId,
            error: error.message 
        });
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate download',
            message: error.message
        });
    }
});

// Test GraphQL connectivity
router.get('/test/graphql/:username', async (req, res) => {
    try {
        const { username } = req.params;
        
        logger.info('🧪 Manual GraphQL test requested', { username });
        
        const result = await dataComparisonSFDX.testGraphQLConnectivity(username);
        
        res.json({
            success: true,
            message: 'GraphQL connectivity test passed',
            username: username
        });
        
    } catch (error) {
        logger.error('🧪 Manual GraphQL test failed', { 
            username: req.params.username, 
            error: error.message 
        });
        
        res.status(500).json({
            success: false,
            error: 'GraphQL test failed',
            message: error.message
        });
    }
});


// Update the startComparisonProcess function
async function startComparisonProcess(comparisonId, config, configPath) {
    const state = global.comparisonStates[comparisonId];

    try {
        state.status = 'running';
        state.progress.phase = 'engine_selection';

        const orgUsernames = config.orgs.map(org => org.username);

        // First, fetch data from all orgs
        state.progress.phase = 'data_fetch';
        const allOrgData = {};

       try {
                // Fetch data from all orgs and write to buffers
                await spawnFetchers(config, comparisonId, config.inputNumberOfProcesses);
            } catch (fetchError) {
                logger.error('Data fetch failed for object', {
                    comparisonId,
                    objectName,
                    error: fetchError.message
                });
                throw fetchError;
            }
        
        await convertJsonlToParquet(path.join(__dirname, `../data-extract/${comparisonId}`));
        // Now process comparison using the hybrid controller
        state.progress.phase = 'comparison';
        state.progress.currentObject = 'Processing comparison';

        logger.info('Starting comparison process', {
            comparisonId,
            totalObjects: Object.keys(allOrgData).length,
            totalOrgs: orgUsernames.length
        });



        const comparisonResult = await comparisonController.processComparison(
            comparisonId,
            config,
            configPath
        );

        // Update state with results
        //state.results = comparisonResult.results || {};

        /*if (comparisonResult.fallbackUsed) {
            state.warnings = state.warnings || [];
            state.warnings.push(`Fallback to Node.js engine: ${comparisonResult.fallbackReason}`);
        }*/

        state.status = 'completed';
        state.endTime = new Date().toISOString();

        logger.info('Comparison completed', {
            comparisonId,
            objectsProcessed: Object.keys(state.results).length
        });

    } catch (error) {
        state.status = 'failed';
        state.error = error.message;
        state.endTime = new Date().toISOString();

        logger.error('Comparison process failed', {
            comparisonId,
            error: error.message,
            stack: error.stack
        });

        throw error;
    }
}


module.exports = router;