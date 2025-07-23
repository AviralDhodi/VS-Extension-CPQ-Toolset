// Permissions Analyser Routes - V3 Pattern
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const router = express.Router();
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// Import utilities
const { logger } = require("../../../shared/utils/logger");
const { getInstance: getSfdxRunner } = require("../../../shared/utils/sfdxRunner");
const { getInstance: getPythonRunner } = require("../../../shared/utils/pythonRunner");
const { getInstance: getPathResolver } = require("../../../shared/utils/pathResolver");

// Get utility instances
const sfdxRunner = getSfdxRunner();
const pythonRunner = getPythonRunner();
const pathResolver = getPathResolver();

// State management
const state = require("../state");

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, "../storage/uploads");
        // Use sync version for multer compatibility
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}_${uuidv4()}_${file.originalname}`;
        cb(null, uniqueName);
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

// Helper function to serve component HTML (V3 pattern)
function serveComponent(componentName, data = {}) {
    return (req, res) => {
        try {
            const componentDir = path.join(__dirname, '../components', componentName);
            
            // Use enhanced version for config generator
            const isEnhanced = componentName === 'configGenerator';
            const prefix = isEnhanced ? 'enhanced-' : '';
            
            const htmlPath = path.join(componentDir, `${prefix}index.html`);
            const cssPath = path.join(componentDir, `${prefix}index.css`);
            const jsPath = path.join(componentDir, `${prefix}index.js`);

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

// Middleware to log requests
router.use((req, res, next) => {
    logger.info(`Permissions Analyser: ${req.method} ${req.path}`);
    next();
});

// Simple direct routing - no iframes, no shell (V3 pattern)
router.get('/', serveComponent('welcome'));

// Component routes
router.get('/welcome', serveComponent('welcome'));
router.get('/config-generator', serveComponent('configGenerator'));
router.get('/viewer', serveComponent('permissionsViewer'));

// Static assets for components
router.use('/components', express.static(path.join(__dirname, '../components')));

// API Routes

// Get authenticated organizations
router.get("/api/orgs", async (req, res) => {
    try {
        logger.info("Fetching authenticated Salesforce orgs...");
        const orgs = await sfdxRunner.getAuthenticatedOrgs();
        
        if (orgs && orgs.length > 0) {
            res.json({
                success: true,
                orgs: orgs
            });
        } else {
            res.status(404).json({
                success: false,
                error: "No authenticated orgs found"
            });
        }
    } catch (error) {
        logger.error("Error fetching orgs:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Validate organizations and get metadata info
router.post("/api/orgs/validate", async (req, res) => {
    try {
        const { orgs } = req.body;
        
        logger.info(`Received validation request for orgs:`, orgs);
        
        if (!orgs || orgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: "At least 2 organizations are required"
            });
        }

        logger.info(`Validating ${orgs.length} organizations...`);
        
        // Validate each org and get metadata info
        const validationResults = await Promise.all(
            orgs.map(async (org) => {
                try {
                    // Get org info
                    const orgInfo = await sfdxRunner.getOrgInfo(org);
                    
                    // List available profiles
                    const profilesResult = await sfdxRunner.listMetadata(org, 'Profile');
                    
                    // List available permission sets
                    const permSetsResult = await sfdxRunner.listMetadata(org, 'PermissionSet');
                    
                    return {
                        orgId: org,
                        valid: true,
                        info: orgInfo,
                        profiles: profilesResult.success ? profilesResult.metadata : [],
                        permissionSets: permSetsResult.success ? permSetsResult.metadata : []
                    };
                } catch (error) {
                    return {
                        orgId: org,
                        valid: false,
                        error: error.message
                    };
                }
            })
        );

        const validOrgs = validationResults.filter(r => r.valid);
        
        if (validOrgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: "At least 2 valid organizations are required",
                details: validationResults
            });
        }

        res.json({
            success: true,
            validOrgs: validOrgs,
            invalidOrgs: validationResults.filter(r => !r.valid)
        });

    } catch (error) {
        logger.error("Error validating orgs:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get permission metadata with assignment counts
router.post("/api/permissions/metadata", async (req, res) => {
    try {
        const { orgs, permissionTypes } = req.body;
        const { METADATA_DEFINITIONS, getAssignmentCountQuery } = require('../utils/metadataDefinitions');
        
        logger.info("Getting permission metadata with assignment counts...");
        
        const results = {};
        
        for (const org of orgs) {
            results[org] = {};
            
            for (const permType of permissionTypes) {
                const definition = METADATA_DEFINITIONS[permType];
                if (!definition) continue;
                
                // Get metadata list
                const metadataResult = await sfdxRunner.listMetadata(org, definition.apiName);
                
                if (metadataResult.success) {
                    const metadata = metadataResult.metadata || [];
                    
                    // Get assignment counts if applicable
                    const countQuery = getAssignmentCountQuery(permType);
                    let assignmentCounts = {};
                    
                    if (countQuery) {
                        try {
                            const queryResult = await sfdxRunner.executeSOQL(countQuery, org);
                            if (queryResult.success && queryResult.records) {
                                queryResult.records.forEach(record => {
                                    const key = permType === 'PermissionSet' 
                                        ? record.PermissionSet?.Name 
                                        : record.PermissionSetGroup?.DeveloperName;
                                    if (key) {
                                        assignmentCounts[key] = record.AssignmentCount || 0;
                                    }
                                });
                            }
                        } catch (err) {
                            logger.warn(`Failed to get assignment counts for ${permType} in ${org}:`, err);
                        }
                    }
                    
                    // Combine metadata with assignment counts
                    results[org][permType] = metadata.map(item => ({
                        ...item,
                        assignmentCount: assignmentCounts[item.fullName] || 0
                    }));
                }
            }
        }
        
        res.json({
            success: true,
            metadata: results,
            definitions: METADATA_DEFINITIONS
        });
        
    } catch (error) {
        logger.error("Error getting permission metadata:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get common profiles across orgs
router.post("/api/profiles/common", async (req, res) => {
    try {
        const { orgs } = req.body;
        
        logger.info("Finding common profiles across orgs...");
        
        // Get profiles from each org
        const orgProfiles = await Promise.all(
            orgs.map(async (org) => {
                const result = await sfdxRunner.listMetadata(org, 'Profile');
                return result.success ? result.metadata.map(p => p.fullName) : [];
            })
        );

        // Find common profiles
        const commonProfiles = orgProfiles.reduce((common, profiles) => {
            if (common.length === 0) return profiles;
            return common.filter(p => profiles.includes(p));
        });

        res.json({
            success: true,
            profiles: commonProfiles.sort()
        });

    } catch (error) {
        logger.error("Error finding common profiles:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get common permission sets across orgs
router.post("/api/permissionsets/common", async (req, res) => {
    try {
        const { orgs } = req.body;
        
        logger.info("Finding common permission sets across orgs...");
        
        // Get permission sets from each org
        const orgPermSets = await Promise.all(
            orgs.map(async (org) => {
                const result = await sfdxRunner.listMetadata(org, 'PermissionSet');
                return result.success ? result.metadata.map(ps => ps.fullName) : [];
            })
        );

        // Find common permission sets
        const commonPermSets = orgPermSets.reduce((common, permSets) => {
            if (common.length === 0) return permSets;
            return common.filter(ps => permSets.includes(ps));
        });

        res.json({
            success: true,
            permissionSets: commonPermSets.sort()
        });

    } catch (error) {
        logger.error("Error finding common permission sets:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Objects list endpoint removed - not needed for permissions analysis
// Permissions analysis retrieves ALL object permissions from the metadata itself

// Get configuration by ID
router.get("/api/config/:id", async (req, res) => {
    try {
        const { id } = req.params;
        
        // Try to find the config file
        const configDir = path.join(__dirname, "../storage/config");
        const possiblePaths = [
            path.join(configDir, `${id}.json`),
            path.join(configDir, `uploaded_${id}.json`)
        ];
        
        let configPath = null;
        let config = null;
        
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                configPath = testPath;
                break;
            }
        }
        
        if (!configPath) {
            return res.status(404).json({
                success: false,
                error: "Configuration not found"
            });
        }
        
        config = JSON.parse(await fsPromises.readFile(configPath, 'utf8'));
        
        res.json({
            success: true,
            config: config,
            configPath: configPath
        });
        
    } catch (error) {
        logger.error("Error retrieving configuration:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Upload configuration
router.post("/api/config/upload", upload.single('config'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "No file uploaded"
            });
        }

        logger.info(`Processing uploaded config file: ${req.file.filename}`);
        
        // Read and validate the configuration
        const configContent = await fsPromises.readFile(req.file.path, 'utf8');
        const config = JSON.parse(configContent);
        
        // Validate configuration structure
        if (!config.orgs || !config.permissions) {
            throw new Error("Invalid configuration format");
        }

        // Generate unique ID
        config.id = `perm_${Date.now()}`;
        
        // Save to config directory
        const configPath = path.join(
            __dirname, 
            "../storage/config", 
            `uploaded_${config.id}.json`
        );
        
        await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2));
        
        // Clean up uploaded file
        await fsPromises.unlink(req.file.path);
        
        res.json({
            success: true,
            configId: config.id,
            message: "Configuration uploaded successfully"
        });

    } catch (error) {
        logger.error("Error uploading configuration:", error);
        
        // Clean up uploaded file on error
        if (req.file) {
            await fsPromises.unlink(req.file.path).catch(() => {});
        }
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Generate package.xml
router.post("/api/packagexml/generate", async (req, res) => {
    try {
        const { config } = req.body;
        
        logger.info("Generating package.xml for permissions extraction...");
        
        // Build package.xml content
        let packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">`;

        // Add profiles
        if (config.permissions.profiles && config.permissions.profiles.length > 0) {
            packageXml += `
    <types>`;
            config.permissions.profiles.forEach(profile => {
                packageXml += `
        <members>${profile}</members>`;
            });
            packageXml += `
        <name>Profile</name>
    </types>`;
        }

        // Add permission sets
        if (config.permissions.permissionSets && config.permissions.permissionSets.length > 0) {
            packageXml += `
    <types>`;
            config.permissions.permissionSets.forEach(ps => {
                packageXml += `
        <members>${ps}</members>`;
            });
            packageXml += `
        <name>PermissionSet</name>
    </types>`;
        }

        // Add muting permission sets
        if (config.permissions.mutingPermissionSets && config.permissions.mutingPermissionSets.length > 0) {
            packageXml += `
    <types>`;
            config.permissions.mutingPermissionSets.forEach(mps => {
                packageXml += `
        <members>${mps}</members>`;
            });
            packageXml += `
        <name>MutingPermissionSet</name>
    </types>`;
        }

        // Add objects for field permissions
        if (config.permissions.objectPermissions && config.permissions.objectPermissions.objects.length > 0) {
            packageXml += `
    <types>`;
            config.permissions.objectPermissions.objects.forEach(obj => {
                packageXml += `
        <members>${obj}</members>`;
            });
            packageXml += `
        <name>CustomObject</name>
    </types>`;
        }

        // Add Apex classes
        if (config.permissions.apexClasses && config.permissions.apexClasses.length > 0) {
            packageXml += `
    <types>`;
            config.permissions.apexClasses.forEach(cls => {
                packageXml += `
        <members>${cls}</members>`;
            });
            packageXml += `
        <name>ApexClass</name>
    </types>`;
        }

        // Add Visualforce pages
        if (config.permissions.visualforcePages && config.permissions.visualforcePages.length > 0) {
            packageXml += `
    <types>`;
            config.permissions.visualforcePages.forEach(page => {
                packageXml += `
        <members>${page}</members>`;
            });
            packageXml += `
        <name>ApexPage</name>
    </types>`;
        }

        packageXml += `
    <version>${config.packageXml.version || '60.0'}</version>
</Package>`;

        // Save package.xml to templates
        const templatePath = path.join(__dirname, "../storage/templates", `package_${Date.now()}.xml`);
        await fsPromises.writeFile(templatePath, packageXml);

        res.json({
            success: true,
            packageXml: packageXml,
            templatePath: templatePath
        });

    } catch (error) {
        logger.error("Error generating package.xml:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Generate configuration
router.post("/api/config/generate", async (req, res) => {
    try {
        const { config } = req.body;
        
        logger.info("Generating permissions configuration...");
        
        // Add metadata
        config.metadata = {
            createdAt: new Date().toISOString(),
            version: "3.0.0",
            appType: "permissions-analyser"
        };

        // Generate unique ID
        config.id = `perm_${Date.now()}`;

        // Save configuration
        const configDir = path.join(__dirname, "../storage/config");
        await fsPromises.mkdir(configDir, { recursive: true });
        
        const configPath = path.join(
            configDir, 
            `permissions-config-${new Date().toISOString().split('T')[0]}.json`
        );
        
        await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2));

        res.json({
            success: true,
            configId: config.id,
            configPath: configPath,
            config: config
        });

    } catch (error) {
        logger.error("Error generating configuration:", error);
        logger.error("Stack trace:", error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown error occurred'
        });
    }
});

// Start permissions extraction
router.post("/api/extraction/start", async (req, res) => {
    try {
        const { orgs, metadata, permissionTypes, config: fullConfig } = req.body;
        
        logger.info(`Starting permissions extraction for ${orgs.length} orgs`);
        
        // Use full config if provided (from upload), otherwise create minimal config
        let config;
        if (fullConfig) {
            // Use the uploaded config directly
            config = fullConfig;
        } else {
            // Create configuration for new extraction
            config = {
                version: '3.0.0',
                createdAt: new Date().toISOString(),
                orgs: orgs,
                permissions: metadata,  // Renamed for compatibility with extractor
                permissionTypes: permissionTypes,
                // Add default values for missing fields
                selectedPermissionOptions: {},
                objectSelection: 'ALL',
                specificObjects: [],
                apexClassSelection: 'ALL',
                specificApexClasses: [],
                pageSelection: 'ALL',
                specificPages: []
            };
        }
        
        // Generate unique ID if not present
        const configId = config.id || `perm_${Date.now()}`;
        config.id = configId;
        
        // Save configuration
        const configPath = path.join(__dirname, "../storage/config", `${configId}.json`);
        await fsPromises.mkdir(path.dirname(configPath), { recursive: true });
        await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2));

        // Create extraction ID
        const extractionId = `ext_${Date.now()}_${uuidv4().substring(0, 8)}`;
        
        // Update state
        state.setExtractionStatus(extractionId, {
            status: 'initializing',
            startTime: new Date().toISOString(),
            config: config,
            configId: configId
        });

        // Start extraction process
        const { fork } = require('child_process');
        const extractorPath = path.join(__dirname, '../worker/extractor.js');
        
        const extractor = fork(extractorPath, [
            '--extractionId', extractionId,
            '--configPath', configPath
        ]);

        extractor.on('message', (msg) => {
            if (msg.type === 'progress') {
                state.updateExtractionProgress(extractionId, msg.data);
            }
        });

        extractor.on('exit', (code) => {
            if (code === 0) {
                state.setExtractionStatus(extractionId, {
                    status: 'completed',
                    endTime: new Date().toISOString()
                });
            } else {
                state.setExtractionStatus(extractionId, {
                    status: 'failed',
                    error: `Extraction process exited with code ${code}`
                });
            }
        });

        res.json({
            success: true,
            extractionId: extractionId,
            message: "Permissions extraction started"
        });

    } catch (error) {
        logger.error("Error starting extraction:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get extraction status
router.get("/api/extraction/status/:id", (req, res) => {
    const { id } = req.params;
    const status = state.getExtractionStatus(id);
    
    if (status) {
        res.json({
            success: true,
            status: status
        });
    } else {
        res.status(404).json({
            success: false,
            error: "Extraction not found"
        });
    }
});

// Start comparison
router.post("/api/comparison/start", async (req, res) => {
    try {
        let { extractionId, configId } = req.body;
        
        logger.info(`Starting permissions comparison for extraction: ${extractionId}`);
        
        // If no configId provided, try to get it from extraction status
        if (!configId) {
            const extractionStatus = state.getExtractionStatus(extractionId);
            if (extractionStatus && extractionStatus.configId) {
                configId = extractionStatus.configId;
            }
        }
        
        // Get the configuration file path
        const configPath = configId 
            ? path.join(__dirname, '../storage/config', `${configId}.json`)
            : null;
            
        if (configPath && !fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configId}`);
        }
        
        // Create comparison ID
        const comparisonId = `comp_${Date.now()}_${uuidv4().substring(0, 8)}`;
        
        // Update state
        state.setComparisonStatus(comparisonId, {
            status: 'initializing',
            startTime: new Date().toISOString(),
            extractionId: extractionId
        });

        // Start comparison process
        const pythonScriptPath = path.join(__dirname, '../python/permissions_comparison_enhanced.py');
        const dataPath = path.join(__dirname, '../storage/data-extract', extractionId);
        const outputPath = path.join(__dirname, '../storage/results', `${comparisonId}_results.json`);
        
        const args = [
            '--data-path', dataPath,
            '--output-path', outputPath,
            '--comparison-id', comparisonId
        ];
        
        // Add config path if provided
        if (configPath) {
            args.push('--config-path', configPath);
        }
        
        const result = await pythonRunner.runScriptFile(pythonScriptPath, args);

        logger.info("Python result:", result);
        
        // Handle both array and object results
        const pythonResult = Array.isArray(result) ? result[0] : result;
        
        if (pythonResult && pythonResult.success) {
            state.setComparisonStatus(comparisonId, {
                status: 'completed',
                endTime: new Date().toISOString(),
                resultsPath: outputPath
            });
            
            res.json({
                success: true,
                comparisonId: comparisonId,
                message: "Permissions comparison completed"
            });
        } else {
            throw new Error(result.error || "Comparison failed");
        }

    } catch (error) {
        logger.error("Error starting comparison:", error);
        logger.error("Stack trace:", error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Unknown error occurred'
        });
    }
});

// Get comparison results
router.get("/api/comparison/:id/results", async (req, res) => {
    try {
        const { id } = req.params;
        const status = state.getComparisonStatus(id);
        
        if (!status || status.status !== 'completed') {
            return res.status(404).json({
                success: false,
                error: "Comparison not found or not completed"
            });
        }

        const results = JSON.parse(await fsPromises.readFile(status.resultsPath, 'utf8'));
        
        res.json({
            success: true,
            results: results
        });

    } catch (error) {
        logger.error("Error getting comparison results:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Download comparison results as Excel
router.get("/api/comparison/:id/download", async (req, res) => {
    try {
        const { id } = req.params;
        const status = state.getComparisonStatus(id);
        
        if (!status || status.status !== 'completed') {
            return res.status(404).json({
                success: false,
                error: "Comparison not found or not completed"
            });
        }
        
        // Look for Excel file
        const resultsDir = path.dirname(status.resultsPath);
        const excelPath = path.join(resultsDir, `${id}_results.xlsx`);
        
        // Check if Excel file exists
        if (!fs.existsSync(excelPath)) {
            // Fall back to JSON file
            const jsonPath = status.resultsPath;
            if (fs.existsSync(jsonPath)) {
                res.download(jsonPath, `permissions-comparison-${id}.json`);
            } else {
                return res.status(404).json({
                    success: false,
                    error: "Results file not found"
                });
            }
        } else {
            // Send Excel file
            res.download(excelPath, `permissions-comparison-${id}.xlsx`);
        }
        
    } catch (error) {
        logger.error("Error downloading comparison results:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// State management endpoints
router.get("/api/state", (req, res) => {
    res.json({
        success: true,
        state: state.getCurrentState()
    });
});

router.post("/api/state/set", (req, res) => {
    const { component, data } = req.body;
    state.setComponentState(component, data);
    res.json({ success: true });
});

module.exports = router;