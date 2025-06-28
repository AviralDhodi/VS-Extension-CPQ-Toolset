// apps/data-comparison/routes/index.js - Fixed with proper static serving and dynamic UI
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const stateManager = require("../state");
const projectRoot = process.cwd();
const shellPath = path.join(projectRoot, "shared", "UI", "appView", "index.html");
const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
    dest: path.join(projectRoot, 'tmp', 'uploads'),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

console.log('[DataComparison] Initializing routes...');
console.log('[DataComparison] Project root:', projectRoot);
console.log('[DataComparison] Shell path:', shellPath);

// ========================================
// STATIC ASSETS - MUST BE FIRST!
// ========================================
// CRITICAL: Static routes MUST be before dynamic routes to prevent conflicts

// Serve component assets (CSS, JS, images)
router.use("/components", express.static(path.join(projectRoot, "apps", "data-comparison", "components")));

// Serve appView template assets (for shell loading)
router.use("/appView", express.static(path.join(projectRoot, "apps", "data-comparison", "components", "appView")));

// Serve configGenerator assets specifically (for direct access)
router.use("/configGenerator", express.static(path.join(projectRoot, "apps", "data-comparison", "components", "configGenerator")));

console.log('[DataComparison] Static serving configured:');
console.log('  /components -> ', path.join(projectRoot, "apps", "data-comparison", "components"));
console.log('  /appView -> ', path.join(projectRoot, "apps", "data-comparison", "components", "appView"));
console.log('  /configGenerator -> ', path.join(projectRoot, "apps", "data-comparison", "components", "configGenerator"));

// ========================================
// DEBUG MIDDLEWARE
// ========================================
router.use((req, res, next) => {
    console.log(`[DataComparison] ${req.method} ${req.path}`);
    if (Object.keys(req.query).length > 0) {
        console.log(`[DataComparison] Query:`, req.query);
    }
    if (Object.keys(req.params).length > 0) {
        console.log(`[DataComparison] Params:`, req.params);
    }
    next();
});

// ========================================
// MAIN ENTRY POINTS - STATE-DRIVEN SHELL
// ========================================

// Main route "/" = welcome component with shell wrapper
router.get("/", async (req, res) => {
    console.log('[DataComparison] 🏠 Main route - setting state to welcome');
    
    try {
        // Set app state to welcome
        stateManager.setState('welcome');
        
        // Read shell HTML
        if (!fs.existsSync(shellPath)) {
            throw new Error(`Shell not found at: ${shellPath}`);
        }
        
        const shellHtml = fs.readFileSync(shellPath, 'utf8');
        
        // Modify shell to point iframe to dynamic welcome UI
        const modifiedShell = shellHtml.replace(
            'src="/"', 
            'src="/data-comparison/welcome-ui"'
        );
        
        console.log('[DataComparison] ✅ Serving shell with iframe -> /data-comparison/welcome-ui');
        res.send(modifiedShell);
        
    } catch (error) {
        console.error('[DataComparison] ❌ Error serving main route:', error);
        res.status(500).send(`Error loading app: ${error.message}`);
    }
});

// Config Generator route
router.get("/config-generator", async (req, res) => {
    console.log('[DataComparison] ⚙️ Config generator route');
    
    try {
        stateManager.setState('configGenerator');
        const shellHtml = fs.readFileSync(shellPath, 'utf8');
        const modifiedShell = shellHtml.replace(
            'src="/"', 
            'src="/data-comparison/configGenerator-ui"'
        );
        res.send(modifiedShell);
    } catch (error) {
        console.error('[DataComparison] ❌ Error serving config generator:', error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Org Selection route
router.get("/org-selection", async (req, res) => {
    console.log('[DataComparison] 🏢 Org selection route');
    
    try {
        stateManager.setState('orgSelection');
        const shellHtml = fs.readFileSync(shellPath, 'utf8');
        const modifiedShell = shellHtml.replace(
            'src="/"', 
            'src="/data-comparison/orgSelection-ui"'
        );
        res.send(modifiedShell);
    } catch (error) {
        console.error('[DataComparison] ❌ Error serving org selection:', error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Object Selection route
router.get("/object-selection", async (req, res) => {
    console.log('[DataComparison] 📊 Object selection route');
    
    try {
        stateManager.setState('objectSelection');
        const shellHtml = fs.readFileSync(shellPath, 'utf8');
        const modifiedShell = shellHtml.replace(
            'src="/"', 
            'src="/data-comparison/objectSelection-ui"'
        );
        res.send(modifiedShell);
    } catch (error) {
        console.error('[DataComparison] ❌ Error serving object selection:', error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Filter Configuration route
router.get("/filter-configuration", async (req, res) => {
    console.log('[DataComparison] 🔍 Filter configuration route');
    
    try {
        stateManager.setState('filterConfiguration');
        const shellHtml = fs.readFileSync(shellPath, 'utf8');
        const modifiedShell = shellHtml.replace(
            'src="/"', 
            'src="/data-comparison/filterConfiguration-ui"'
        );
        res.send(modifiedShell);
    } catch (error) {
        console.error('[DataComparison] ❌ Error serving filter configuration:', error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// Comparison Status/Results route
router.get("/comparison-status", async (req, res) => {
    console.log('[DataComparison] 📊 Comparison status route');
    
    try {
        stateManager.setState('comparisonStatus');
        const shellHtml = fs.readFileSync(shellPath, 'utf8');
        const modifiedShell = shellHtml.replace(
            'src="/"', 
            'src="/data-comparison/comparisonStatus-ui"'
        );
        res.send(modifiedShell);
    } catch (error) {
        console.error('[DataComparison] ❌ Error serving comparison status:', error);
        res.status(500).send(`Error: ${error.message}`);
    }
});

// ========================================
// DYNAMIC APPVIEW GENERATION
// ========================================

// Dynamic UI generation endpoint: /:state-ui
router.get("/:stateUi", async (req, res) => {
    const { stateUi } = req.params;
    
    // Validate format: state-ui
    if (!stateUi.endsWith('-ui')) {
        return res.status(404).send('Invalid format. Expected: state-ui');
    }
    
    const state = stateUi.replace('-ui', '');
    console.log(`[DataComparison] 🎨 Generating dynamic appView for state: ${state}`);
    
    try {
        // Validate state exists
        const validStates = ['welcome', 'configGenerator', 'orgSelection', 'objectSelection', 'filterConfiguration', 'comparisonStatus'];
        if (!validStates.includes(state)) {
            throw new Error(`Invalid state: ${state}. Valid states: ${validStates.join(', ')}`);
        }
        
        // Generate dynamic appView HTML
        const appViewHtml = await stateManager.generateAppView(state);
        
        console.log(`[DataComparison] ✅ Generated appView for ${state}, length: ${appViewHtml.length}`);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(appViewHtml);
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Error generating appView for ${state}:`, error);
        res.status(500).send(`
            <html>
                <body style="font-family: system-ui; padding: 2rem; text-align: center;">
                    <h2>Failed to Generate UI</h2>
                    <p>State: ${state}</p>
                    <p>Error: ${error.message}</p>
                    <button onclick="location.reload()">Retry</button>
                </body>
            </html>
        `);
    }
});

// ========================================
// STATE API ENDPOINTS  
// ========================================

router.get("/api/state", (req, res) => {
    console.log('[DataComparison] 📊 State API called');
    
    try {
        const state = stateManager.getState();
        res.json({
            success: true,
            state: state,
            displayName: stateManager.getDisplayName(),
            status: stateManager.getStatus(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[DataComparison] ❌ State API error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post("/api/state/set", (req, res) => {
    const { component, data } = req.body;
    console.log(`[DataComparison] 🔄 Setting state to: ${component}`, data);
    
    try {
        const newState = stateManager.setState(component, data);
        res.json({
            success: true,
            state: newState,
            displayName: stateManager.getDisplayName(),
            status: stateManager.getStatus()
        });
    } catch (error) {
        console.error(`[DataComparison] ❌ Error setting state:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Specific state transitions
router.post("/api/state/welcome", (req, res) => {
    try {
        const state = stateManager.setState('welcome', req.body.data || {});
        res.json({ success: true, state });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/api/state/config-generator", (req, res) => {
    try {
        const state = stateManager.setState('configGenerator', req.body.data || {});
        res.json({ success: true, state });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/api/state/org-selection", (req, res) => {
    try {
        const state = stateManager.setState('orgSelection', req.body.data || {});
        res.json({ success: true, state });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Add this route to apps/data-comparison/routes/index.js
// Add after the existing routes, before the health check

// ========================================
// CONFIG GENERATION API
// ========================================

// Config Generator specific route with full namespace
router.post("/api/data-comparison/config/generate", async (req, res) => {
    const { selectedOrgs } = req.body;
    
    console.log(`[DataComparison] ⚙️ Config generation request for Config Generator:`, selectedOrgs);
    
    try {
        // Validate input
        if (!selectedOrgs || !Array.isArray(selectedOrgs) || selectedOrgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 organizations required for config generation'
            });
        }

        // Extract usernames from org objects or strings
        const usernames = selectedOrgs.map(org => 
            typeof org === 'string' ? org : org.username
        );
        
        // Generate filename based on orgs and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `comparison-config-${timestamp}.json`;
        
        // Create basic config structure (this would be enhanced in v1)
        const config = {
            version: "2.0.0",
            createdAt: new Date().toISOString(),
            createdBy: "Config Generator v2",
            orgs: selectedOrgs.map(org => ({
                username: typeof org === 'string' ? org : org.username,
                alias: typeof org === 'object' ? org.alias : org,
                type: typeof org === 'object' ? org.type : 'unknown'
            })),
            metadata: {
                orgNames: usernames,
                totalOrgs: selectedOrgs.length,
                configType: 'multi-org-comparison'
            },
            // Placeholder for objects - would be populated in object selection phase
            objects: {},
            settings: {
                includeStandardObjects: true,
                includeCustomObjects: true,
                maxFieldsPerObject: 50
            }
        };
        
        // Ensure storage directory exists
        const storageDir = path.join(projectRoot, "apps", "data-comparison", "storage", "config");
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
            console.log(`[DataComparison] 📁 Created storage directory: ${storageDir}`);
        }
        
        // Save config file
        const configPath = path.join(storageDir, filename);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`[DataComparison] ✅ Config generated:`, {
            filename,
            orgs: config.orgs.length,
            path: configPath
        });
        
        res.json({
            success: true,
            configFilename: filename,
            configPath: configPath,
            message: 'Configuration file generated successfully',
            orgsIncluded: config.orgs.length,
            orgNames: usernames,
            nextStep: 'object-selection',
            config: config
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Config generation failed:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate configuration',
            message: error.message
        });
    }
});

// Original config generate route (keep for compatibility)
router.post("/api/config/generate", async (req, res) => {
    const { filename, config } = req.body;
    
    console.log(`[DataComparison] 🔧 Config generation request: ${filename}`);
    
    try {
        // Validate input
        if (!filename || !config) {
            return res.status(400).json({
                success: false,
                error: 'Missing filename or config data'
            });
        }
        
        if (!config.orgs || config.orgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 organizations required'
            });
        }
        
        // Ensure storage directory exists
        const storageDir = path.join(projectRoot, "apps", "data-comparison", "storage", "config");
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
            console.log(`[DataComparison] 📁 Created storage directory: ${storageDir}`);
        }
        
        // Save config file
        const configPath = path.join(storageDir, filename);
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`[DataComparison] ✅ Config saved: ${configPath}`);
        console.log(`[DataComparison] 📊 Config details:`, {
            orgs: config.orgs.length,
            filename: filename,
            size: JSON.stringify(config).length
        });
        
        res.json({
            success: true,
            filename: filename,
            path: configPath,
            message: 'Configuration saved successfully',
            summary: {
                orgs: config.orgs.length,
                orgNames: config.metadata.orgNames,
                created: config.createdAt
            }
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Config generation failed:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate configuration',
            message: error.message
        });
    }
});

// Add this route to apps/data-comparison/routes/index.js
// Add after the config generate route

// ========================================
// ORGS API ENDPOINTS
// ========================================

// Config Generator specific routes with full namespace
router.get("/api/data-comparison/orgs", async (req, res) => {
    console.log(`[DataComparison] 🏢 Orgs list request for config generator`);
    
    try {
        // Fix: Correct path to sfdxRunner
        const { getDefaultRunner } = require("../components/modules/sfdxRunner");
        const sfdxRunner = getDefaultRunner();
        
        console.log(`[DataComparison] 🔧 Executing: sf org list --json`);
        
        // Execute sf org list command
        const result = await sfdxRunner.runWithJson('org list');
        
        if (result && result.result) {
            // Get all orgs (including those with connection issues for display)
            const allOrgs = [
                ...(result.result.nonScratchOrgs || []), 
                ...(result.result.scratchOrgs || []),
                ...(result.result.other || []) // Include 'other' orgs as well
            ];
            
            // Map orgs with connection status information - CONFIG GENERATOR FORMAT
            const processedOrgs = allOrgs.map(org => ({
                username: org.username,
                orgId: org.orgId,
                instanceUrl: org.instanceUrl,
                alias: org.alias || org.username,
                type: org.isScratch ? 'scratch' : 'production',
                isDefault: org.isDefaultUsername,
                isDevHub: org.isDevHub,
                connectedStatus: org.connectedStatus,
                hasConnectionIssue: org.connectedStatus !== 'Connected',
                name: org.name,
                instanceName: org.instanceName,
                // Config generator specific fields
                isActive: org.connectedStatus === 'Connected',
                lastUsed: org.lastUsed || null
            }));
            
            // Filter to only connected orgs for config generation
            const activeOrgs = processedOrgs.filter(org => !org.hasConnectionIssue);
            
            console.log(`[DataComparison] ✅ Orgs loaded for config generator:`, {
                total: allOrgs.length,
                active: activeOrgs.length,
                withIssues: processedOrgs.filter(org => org.hasConnectionIssue).length,
                activeOrgs: activeOrgs.map(org => ({
                    username: org.username,
                    alias: org.alias,
                    connectedStatus: org.connectedStatus
                }))
            });
            
            res.json({
                success: true,
                orgs: activeOrgs, // Only return active orgs for config generation
                total: activeOrgs.length,
                message: `Found ${activeOrgs.length} active organizations for config generation`
            });
            
        } else {
            throw new Error('Invalid response from sf org list command');
        }
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Orgs list failed:`, error);
        
        // Check if it's an SFDX-specific error
        let errorMessage = error.message;
        if (error.name === 'SFDXError') {
            errorMessage = `Salesforce CLI error: ${error.message}`;
        } else if (error.message.includes('sf: command not found') || error.message.includes('sfdx: command not found')) {
            errorMessage = 'Salesforce CLI not found. Please install Salesforce CLI and authenticate with your orgs.';
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to load organizations',
            message: errorMessage,
            details: error.stderr || error.stack
        });
    }
});

// Config Generator validation endpoint with full namespace  
router.post("/api/data-comparison/orgs/validate", async (req, res) => {
    const { orgs } = req.body;
    console.log(`[DataComparison] 🔍 Validating orgs for config generator:`, orgs);
    
    try {
        if (!orgs || !Array.isArray(orgs) || orgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 organizations required for validation'
            });
        }
        
        const { getDefaultRunner } = require("../components/modules/sfdxRunner");
        const sfdxRunner = getDefaultRunner();
        
        const validationResults = {
            success: true,
            validOrgs: [],
            invalidOrgs: [],
            errors: [],
            commonObjects: []
        };
        
        // Validate each org
        for (const org of orgs) {
            // Handle org object or username string
            const username = typeof org === 'string' ? org : org.username;
            console.log(`[DataComparison] 🔧 Validating org: ${username}`);
            
            try {
                // Test org connection by running a simple query
                const testResult = await sfdxRunner.runWithJson(`org list limits --target-org=${username}`);
                
                if (testResult && testResult.result) {
                    validationResults.validOrgs.push({
                        username,
                        isValid: true,
                        connectionStatus: 'Connected',
                        apiLimits: testResult.result.Max || 'Available'
                    });
                    console.log(`[DataComparison] ✅ Org ${username} is valid`);
                } else {
                    throw new Error('Invalid API response');
                }
                
            } catch (orgError) {
                console.log(`[DataComparison] ❌ Org ${username} validation failed:`, orgError.message);
                validationResults.invalidOrgs.push({
                    username,
                    isValid: false,
                    error: orgError.message,
                    connectionStatus: 'Failed'
                });
                validationResults.errors.push(`${username}: ${orgError.message}`);
            }
        }
        
        // If we have at least 2 valid orgs, try to get common objects
        if (validationResults.validOrgs.length >= 2) {
            console.log(`[DataComparison] 🔍 Finding common objects across ${validationResults.validOrgs.length} valid orgs`);
            
            try {
                const orgObjectSets = [];
                
                // Get objects for each valid org
                for (const validOrg of validationResults.validOrgs) {
                    const objectsResult = await sfdxRunner.runWithJson(`sobject list --target-org=${validOrg.username}`);
                    
                    if (objectsResult && objectsResult.result) {
                        const queryableObjects = objectsResult.result
                            .filter(obj => obj.queryable && !obj.deprecatedAndHidden)
                            .map(obj => obj.name);
                        
                        orgObjectSets.push(new Set(queryableObjects));
                        console.log(`[DataComparison] 📋 ${validOrg.username}: ${queryableObjects.length} queryable objects`);
                    }
                }
                
                // Find intersection of all object sets (common objects)
                if (orgObjectSets.length > 0) {
                    let commonObjects = orgObjectSets[0];
                    for (let i = 1; i < orgObjectSets.length; i++) {
                        commonObjects = new Set([...commonObjects].filter(obj => orgObjectSets[i].has(obj)));
                    }
                    
                    validationResults.commonObjects = Array.from(commonObjects).sort();
                    console.log(`[DataComparison] 🎯 Found ${validationResults.commonObjects.length} common objects`);
                }
                
            } catch (objectsError) {
                console.log(`[DataComparison] ⚠️ Could not retrieve common objects:`, objectsError.message);
                validationResults.errors.push(`Common objects discovery failed: ${objectsError.message}`);
            }
        }
        
        // Overall validation success
        validationResults.success = validationResults.validOrgs.length >= 2;
        
        console.log(`[DataComparison] ✅ Org validation completed:`, {
            valid: validationResults.validOrgs.length,
            invalid: validationResults.invalidOrgs.length,
            commonObjects: validationResults.commonObjects.length,
            success: validationResults.success
        });
        
        res.json({
            success: validationResults.success,
            message: validationResults.success ? 
                `${validationResults.validOrgs.length} organizations validated successfully` :
                `Only ${validationResults.validOrgs.length} valid organizations found (minimum 2 required)`,
            ...validationResults
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Org validation failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Organization validation failed',
            message: error.message,
            details: error.stderr || error.stack
        });
    }
});

router.post("/api/orgs/list", async (req, res) => {
    console.log(`[DataComparison] 🏢 Orgs list request`);
    
    try {
        // Fix: Correct path to sfdxRunner
        const { getDefaultRunner } = require("../components/modules/sfdxRunner");
        const sfdxRunner = getDefaultRunner();
        
        console.log(`[DataComparison] 🔧 Executing: sf org list --json`);
        
        // Execute sf org list command
        const result = await sfdxRunner.runWithJson('org list');
        
        if (result && result.result) {
            // Get all orgs (including those with connection issues for display)
            const allOrgs = [
                ...(result.result.nonScratchOrgs || []), 
                ...(result.result.scratchOrgs || []),
                ...(result.result.other || []) // Include 'other' orgs as well
            ];
            
            // Map orgs with connection status information
            const processedOrgs = allOrgs.map(org => ({
                username: org.username,
                orgId: org.orgId,
                instanceUrl: org.instanceUrl,
                alias: org.alias || org.username,
                type: org.isScratch ? 'scratch' : 'production',
                isDefault: org.isDefaultUsername,
                isDevHub: org.isDevHub,
                connectedStatus: org.connectedStatus,
                hasConnectionIssue: org.connectedStatus !== 'Connected',
                name: org.name,
                instanceName: org.instanceName
            }));
            
            console.log(`[DataComparison] ✅ Orgs loaded:`, {
                total: allOrgs.length,
                connected: processedOrgs.filter(org => !org.hasConnectionIssue).length,
                withIssues: processedOrgs.filter(org => org.hasConnectionIssue).length,
                orgs: processedOrgs.map(org => ({
                    username: org.username,
                    alias: org.alias,
                    connectedStatus: org.connectedStatus,
                    hasConnectionIssue: org.hasConnectionIssue
                }))
            });
            
            res.json({
                success: true,
                orgs: processedOrgs,
                total: processedOrgs.length,
                message: `Found ${processedOrgs.length} organizations (${processedOrgs.filter(org => !org.hasConnectionIssue).length} connected)`
            });
            
        } else {
            throw new Error('Invalid response from sf org list command');
        }
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Orgs list failed:`, error);
        
        // Check if it's an SFDX-specific error
        let errorMessage = error.message;
        if (error.name === 'SFDXError') {
            errorMessage = `Salesforce CLI error: ${error.message}`;
        } else if (error.message.includes('sf: command not found') || error.message.includes('sfdx: command not found')) {
            errorMessage = 'Salesforce CLI not found. Please install Salesforce CLI and authenticate with your orgs.';
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to load organizations',
            message: errorMessage,
            details: error.stderr || error.stack
        });
    }
});

// ========================================
// OBJECT SELECTION API ENDPOINTS
// ========================================

// Get common objects across selected organizations
router.post("/api/objects/common", async (req, res) => {
    const { orgs, configFilename } = req.body;
    
    console.log(`[DataComparison] 🔍 Common objects request: ${orgs.length} orgs`);
    
    try {
        if (!orgs || orgs.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 organizations required'
            });
        }
        
        const { getDefaultRunner } = require("../components/modules/sfdxRunner");
        const sfdxRunner = getDefaultRunner();
        
        console.log(`[DataComparison] 🔧 Getting objects for orgs: ${orgs.join(', ')}`);
        
        const orgObjects = [];
        
        // Get objects for each org
        for (const orgUsername of orgs) {
            console.log(`[DataComparison] 📋 Describing objects for org: ${orgUsername}`);
            
            const result = await sfdxRunner.runWithJson(`sobject list --target-org=${orgUsername}`);
            
            if (result && result.result) {
                const objects = result.result.map(obj => ({
                    name: obj.name,
                    label: obj.label,
                    custom: obj.custom,
                    queryable: obj.queryable
                }));
                
                orgObjects.push({
                    org: orgUsername,
                    objects: objects.filter(obj => obj.queryable) // Only queryable objects
                });
            }
        }
        
        // Find common objects across all orgs
        if (orgObjects.length === 0) {
            throw new Error('No objects found in any organization');
        }
        
        const firstOrgObjects = orgObjects[0].objects.map(obj => obj.name);
        const commonObjectNames = firstOrgObjects.filter(objectName =>
            orgObjects.every(orgData => 
                orgData.objects.some(obj => obj.name === objectName)
            )
        );
        
        // Build common objects with metadata
        const commonObjects = commonObjectNames.map(name => {
            const objData = orgObjects[0].objects.find(obj => obj.name === name);
            return {
                name: name,
                label: objData.label,
                custom: objData.custom
            };
        });
        
        console.log(`[DataComparison] ✅ Found ${commonObjects.length} common objects`);
        
        res.json({
            success: true,
            objects: commonObjects,
            total: commonObjects.length,
            orgs: orgs.length,
            message: `Found ${commonObjects.length} common objects across ${orgs.length} organizations`
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Common objects request failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to get common objects',
            message: error.message
        });
    }
});

// Get fields for a specific object
router.post("/api/objects/:objectName/fields", async (req, res) => {
    const { objectName } = req.params;
    const { orgs, includeTypes } = req.body;
    
    console.log(`[DataComparison] 🔍 Fields request for object: ${objectName}`);
    
    try {
        if (!orgs || orgs.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Organizations list required'
            });
        }
        
        const { getDefaultRunner } = require("../components/modules/sfdxRunner");
        const sfdxRunner = getDefaultRunner();
        
        // Use first org to get field metadata (assuming common fields)
        const orgUsername = orgs[0];
        console.log(`[DataComparison] 📋 Describing fields for ${objectName} in org: ${orgUsername}`);
        
        const result = await sfdxRunner.runWithJson(`sobject describe --sobject-type=${objectName} --target-org=${orgUsername}`);
        
        if (result && result.result && result.result.fields) {
            const fields = result.result.fields
                .filter(field => field.queryable && !field.deprecatedAndHidden)
                .map(field => ({
                    name: field.name,
                    label: field.label,
                    type: field.type,
                    length: field.length,
                    required: !field.nillable,
                    custom: field.custom
                }));
            
            console.log(`[DataComparison] ✅ Found ${fields.length} fields for ${objectName}`);
            
            res.json({
                success: true,
                fields: fields,
                total: fields.length,
                objectName: objectName,
                message: `Found ${fields.length} fields for ${objectName}`
            });
        } else {
            throw new Error('Invalid response from sobject describe command');
        }
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Fields request failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to get object fields',
            message: error.message,
            objectName: objectName
        });
    }
});

// Validate object configuration
router.post("/api/validation/object", async (req, res) => {
    const { objectName, config, orgs } = req.body;
    
    console.log(`[DataComparison] 🔍 Validation request for: ${objectName}`);
    
    try {
        const { validateObject } = require("../components/modules/validationHandler/saveValidations");
        
        const validationResult = await validateObject(objectName, config, orgs, {
            minFields: 1
        });
        
        console.log(`[DataComparison] ✅ Validation completed for ${objectName}: ${validationResult.isValid}`);
        
        res.json({
            success: true,
            isValid: validationResult.isValid,
            validation: validationResult,
            objectName: objectName
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Validation failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Validation failed',
            message: error.message,
            objectName: objectName
        });
    }
});

// Update configuration file with object data
router.post("/api/config/update", async (req, res) => {
    const { filename, objects, action } = req.body;
    
    console.log(`[DataComparison] 💾 Config update request: ${filename}, action: ${action}`);
    
    try {
        if (!filename || !objects) {
            return res.status(400).json({
                success: false,
                error: 'Filename and objects required'
            });
        }
        
        const configPath = path.join(projectRoot, "apps", "data-comparison", "storage", "config", filename);
        
        // Load existing config
        let config = {};
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configContent);
        }
        
        // Update based on action
        if (action === 'add-objects') {
            if (!config.objects) config.objects = {};
            Object.assign(config.objects, objects);
        } else {
            // Default: replace objects
            config.objects = objects;
        }
        
        // Update metadata
        config.lastModified = new Date().toISOString();
        config.version = config.version || '1.0.0';
        
        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`[DataComparison] ✅ Config updated: ${Object.keys(objects).length} objects`);
        
        res.json({
            success: true,
            filename: filename,
            objectCount: Object.keys(objects).length,
            message: 'Configuration updated successfully'
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Config update failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration',
            message: error.message
        });
    }
});

// ========================================
// FILTER CONFIGURATION API ENDPOINTS
// ========================================

// Get existing filter configurations
router.post("/api/config/filters", async (req, res) => {
    const { filename } = req.body;
    
    console.log(`[DataComparison] 📋 Get filters request: ${filename}`);
    
    try {
        const configPath = path.join(projectRoot, "apps", "data-comparison", "storage", "config", filename);
        
        let filters = {};
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configContent);
            filters = config.filters || {};
        }
        
        console.log(`[DataComparison] ✅ Filters loaded: ${Object.keys(filters).length} orgs`);
        
        res.json({
            success: true,
            filters: filters,
            filename: filename
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Get filters failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to load filters',
            message: error.message
        });
    }
});

// Save filter configuration
router.post("/api/config/filters/save", async (req, res) => {
    const { filename, orgKey, objectName, filters } = req.body;
    
    console.log(`[DataComparison] 💾 Save filters: ${filename}, ${orgKey}, ${objectName}`);
    
    try {
        const configPath = path.join(projectRoot, "apps", "data-comparison", "storage", "config", filename);
        
        // Load existing config
        let config = {};
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configContent);
        }
        
        // Initialize filters structure
        if (!config.filters) config.filters = {};
        if (!config.filters[orgKey]) config.filters[orgKey] = {};
        
        // Save filter configuration
        config.filters[orgKey][objectName] = {
            ...filters,
            savedAt: new Date().toISOString()
        };
        
        // Update metadata
        config.lastModified = new Date().toISOString();
        
        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`[DataComparison] ✅ Filters saved for ${orgKey}/${objectName}`);
        
        res.json({
            success: true,
            filename: filename,
            orgKey: orgKey,
            objectName: objectName,
            message: 'Filter configuration saved successfully'
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Save filters failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to save filter configuration',
            message: error.message
        });
    }
});

// Finalize configuration
router.post("/api/config/finalize", async (req, res) => {
    const { filename, status } = req.body;
    
    console.log(`[DataComparison] ✅ Finalize config: ${filename}, status: ${status}`);
    
    try {
        const configPath = path.join(projectRoot, "apps", "data-comparison", "storage", "config", filename);
        
        // Load existing config
        let config = {};
        if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf8');
            config = JSON.parse(configContent);
        }
        
        // Mark as finalized
        config.status = status || 'complete';
        config.finalizedAt = new Date().toISOString();
        config.lastModified = new Date().toISOString();
        
        // Save config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`[DataComparison] ✅ Configuration finalized: ${filename}`);
        
        res.json({
            success: true,
            filename: filename,
            status: config.status,
            message: 'Configuration finalized successfully'
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ Finalize config failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to finalize configuration',
            message: error.message
        });
    }
});

// ========================================
// COMPARISON EXECUTION ENDPOINTS
// ========================================

const { spawnFetchers } = require('../worker/spawnFetchers');
const { prepareDataForPython } = require('../worker/convertParquet');
const { getPythonRunner } = require('../../../shared/utils/pythonRunner');
const { sfdxCommands } = require('../../../shared/utils/sfdxCommands');

// Start data comparison process
router.post("/api/comparison/start", async (req, res) => {
    const { configFilename } = req.body;
    
    console.log(`[DataComparison] 🚀 Starting comparison: ${configFilename}`);
    
    try {
        if (!configFilename) {
            return res.status(400).json({
                success: false,
                error: 'Config filename required'
            });
        }

        // Load config
        const configPath = path.join(projectRoot, "apps", "data-comparison", "storage", "config", configFilename);
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
                totalObjects: Object.keys(config.objects || {}).length,
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
            console.error(`[DataComparison] ❌ Comparison process failed:`, error);
            comparisonState.status = 'failed';
            comparisonState.error = error.message;
        });

        res.json({
            success: true,
            comparisonId,
            message: 'Comparison started',
            statusUrl: `/data-comparison/api/comparison/status/${comparisonId}`
        });

    } catch (error) {
        console.error(`[DataComparison] ❌ Failed to start comparison:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to start comparison',
            message: error.message
        });
    }
});

// Get comparison status
router.get("/api/comparison/status/:comparisonId", (req, res) => {
    const { comparisonId } = req.params;

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
            engineUsed: 'python',
            engineInfo: state.engineInfo,
            warnings: state.warnings || []
        }
    });
});

// Download comparison results
router.get("/api/comparison/:comparisonId/download", async (req, res) => {
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
            engineUsed: 'python',
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
        
        console.log(`[DataComparison] ✅ Comparison results downloaded: ${comparisonId}`);

    } catch (error) {
        console.error(`[DataComparison] ❌ Failed to download comparison results:`, error);
        
        res.status(500).json({
            success: false,
            error: 'Failed to generate download',
            message: error.message
        });
    }
});

// Test GraphQL connectivity
router.get("/api/test/graphql/:username", async (req, res) => {
    try {
        const { username } = req.params;
        
        console.log(`[DataComparison] 🧪 Testing GraphQL connectivity: ${username}`);
        
        const result = await sfdxCommands.testGraphQLConnectivity(username);
        
        res.json({
            success: true,
            message: 'GraphQL connectivity test passed',
            username: username
        });
        
    } catch (error) {
        console.error(`[DataComparison] ❌ GraphQL test failed:`, error);
        
        res.status(500).json({
            success: false,
            error: 'GraphQL test failed',
            message: error.message
        });
    }
});

// Python environment check
router.get("/api/python/check", async (req, res) => {
    try {
        const pythonRunner = getPythonRunner();
        const dependencies = await pythonRunner.checkDependencies();
        
        res.json({
            success: true,
            python: dependencies,
            message: dependencies.installed ? 'Python environment ready' : 'Python dependencies missing'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Python check failed',
            message: error.message
        });
    }
});

// Install Python dependencies
router.post("/api/python/install", async (req, res) => {
    try {
        const pythonRunner = getPythonRunner();
        await pythonRunner.installDependencies();
        
        res.json({
            success: true,
            message: 'Python dependencies installed successfully'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Python dependency installation failed',
            message: error.message
        });
    }
});

// Comparison execution helper function
async function startComparisonProcess(comparisonId, config, configPath) {
    const state = global.comparisonStates[comparisonId];

    try {
        state.status = 'running';
        state.progress.phase = 'data_fetch';

        // First, fetch data from all orgs using the worker system
        console.log(`[DataComparison] 📥 Starting data fetch for ${comparisonId}`);
        
        const numberOfProcesses = config.inputNumberOfProcesses || config.orgs.length;
        await spawnFetchers(config, comparisonId, numberOfProcesses);
        
        console.log(`[DataComparison] ✅ Data fetch completed for ${comparisonId}`);

        // Prepare data for Python processing
        state.progress.phase = 'data_preparation';
        const extractedPath = path.join(projectRoot, "apps", "data-comparison", "storage", "data-extract", comparisonId);
        
        console.log(`[DataComparison] 🐍 Preparing data for Python processing: ${extractedPath}`);
        const dataSummary = await prepareDataForPython(extractedPath);
        
        // Run Python comparison
        state.progress.phase = 'comparison';
        state.progress.currentObject = 'Running Python comparison';

        console.log(`[DataComparison] 🐍 Starting Python multi-org comparison`);
        
        const pythonRunner = getPythonRunner();
        const outputPath = path.join(extractedPath, 'comparison_results');
        
        // Ensure output directory exists
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }

        const result = await pythonRunner.runMultiOrgComparison(comparisonId, configPath, outputPath);
        
        state.engineUsed = 'python';
        state.engineInfo = {
            scriptOutput: result.stdout,
            executionTime: Date.now() - new Date(state.startTime).getTime(),
            outputPath: outputPath
        };

        // Load results if available
        const resultsFile = path.join(outputPath, 'comparison_summary.json');
        if (fs.existsSync(resultsFile)) {
            state.results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
        }

        state.status = 'completed';
        state.endTime = new Date().toISOString();

        console.log(`[DataComparison] ✅ Comparison completed: ${comparisonId}`);

    } catch (error) {
        state.status = 'failed';
        state.error = error.message;
        state.endTime = new Date().toISOString();

        console.error(`[DataComparison] ❌ Comparison process failed:`, {
            comparisonId,
            error: error.message,
            stack: error.stack
        });

        throw error;
    }
}

// ========================================
// CONFIG UPLOAD ENDPOINT
// ========================================

router.post("/api/config/upload", upload.single('configFile'), async (req, res) => {
    console.log('[DataComparison] 📁 Config upload request');
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No configuration file uploaded'
            });
        }
        
        console.log('[DataComparison] 📁 File received:', {
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path
        });
        
        // Read and parse the uploaded config file
        const configData = fs.readFileSync(req.file.path, 'utf8');
        let config;
        
        try {
            config = JSON.parse(configData);
        } catch (parseError) {
            console.error('[DataComparison] ❌ Invalid JSON in config file:', parseError);
            
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            
            return res.status(400).json({
                success: false,
                error: 'Invalid JSON format in configuration file',
                details: parseError.message
            });
        }
        
        // Validate config structure
        if (!config.orgs || !Array.isArray(config.orgs) || config.orgs.length < 2) {
            fs.unlinkSync(req.file.path);
            
            return res.status(400).json({
                success: false,
                error: 'Configuration must contain at least 2 organizations',
                details: 'Config should have an "orgs" array with 2 or more org configurations'
            });
        }
        
        // Move file to proper storage location
        const storageDir = path.join(projectRoot, "apps", "data-comparison", "storage", "config");
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }
        
        const finalPath = path.join(storageDir, req.file.originalname);
        fs.renameSync(req.file.path, finalPath);
        
        console.log('[DataComparison] ✅ Config uploaded and validated:', {
            filename: req.file.originalname,
            orgs: config.orgs.length,
            path: finalPath
        });
        
        res.json({
            success: true,
            filename: req.file.originalname,
            path: finalPath,
            message: 'Configuration uploaded successfully',
            summary: {
                orgs: config.orgs.length,
                orgNames: config.metadata?.orgNames || config.orgs.map(org => org.username || org.alias),
                uploaded: new Date().toISOString()
            },
            config: config
        });
        
    } catch (error) {
        console.error('[DataComparison] ❌ Config upload failed:', error);
        
        // Clean up uploaded file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to upload configuration',
            message: error.message
        });
    }
});

// ========================================
// HEALTH CHECK
// ========================================

router.get("/health", (req, res) => {
    try {
        const state = stateManager.getState();
        res.json({
            app: "data-comparison",
            status: "healthy",
            currentState: state,
            displayName: stateManager.getDisplayName(),
            stateStatus: stateManager.getStatus(),
            timestamp: new Date().toISOString(),
            version: "2.0.0",
            routes: {
                main: "/",
                configGenerator: "/config-generator", 
                orgSelection: "/org-selection",
                objectSelection: "/object-selection",
                filterConfiguration: "/filter-configuration",
                dynamicUI: "/:state-ui",
                api: "/api/state",
                orgs: "/api/data-comparison/orgs",
                orgsValidate: "/api/data-comparison/orgs/validate",
                configGenerate: "/api/data-comparison/config/generate", 
                orgsList: "/api/orgs/list",
                objects: "/api/objects/common",
                fields: "/api/objects/:objectName/fields",
                validation: "/api/validation/object",
                configUpdate: "/api/config/update",
                filters: "/api/config/filters",
                filtersSave: "/api/config/filters/save",
                finalize: "/api/config/finalize",
                upload: "/api/config/upload",
                comparisonStart: "/api/comparison/start",
                comparisonStatus: "/api/comparison/status/:id",
                comparisonDownload: "/api/comparison/:id/download",
                pythonCheck: "/api/python/check",
                pythonInstall: "/api/python/install",
                graphqlTest: "/api/test/graphql/:username"
            }
        });
    } catch (error) {
        res.status(500).json({
            app: "data-comparison",
            status: "error",
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

console.log('[DataComparison] ✅ Routes configured successfully');
console.log('[DataComparison] Available routes:');
console.log('  GET  / -> Shell + welcome UI');
console.log('  GET  /config-generator -> Shell + config UI');
console.log('  GET  /org-selection -> Shell + org UI');
console.log('  GET  /object-selection -> Shell + object selection UI');
console.log('  GET  /filter-configuration -> Shell + filter config UI');
console.log('  GET  /:state-ui -> Dynamic appView generation');
console.log('  GET  /api/state -> State info');
console.log('  POST /api/state/set -> Update state');
console.log('  GET  /api/data-comparison/orgs -> Load orgs for config generator');
console.log('  POST /api/data-comparison/orgs/validate -> Validate orgs for config generator');
console.log('  POST /api/data-comparison/config/generate -> Generate config for config generator');
console.log('  POST /api/orgs/list -> Load orgs for components');
console.log('  POST /api/objects/common -> Get common objects');
console.log('  POST /api/objects/:objectName/fields -> Get object fields');
console.log('  POST /api/validation/object -> Validate object config');
console.log('  POST /api/config/update -> Update configuration');
console.log('  POST /api/config/filters -> Get filter configs');
console.log('  POST /api/config/filters/save -> Save filter config');
console.log('  POST /api/config/finalize -> Finalize configuration');
console.log('  POST /api/config/upload -> Upload configuration file');
console.log('  GET  /health -> Health check');

module.exports = router;