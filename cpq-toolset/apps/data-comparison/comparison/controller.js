// apps/data-comparison/comparison/controller.js

const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('../../../shared/logging/logger');

const execAsync = promisify(exec);

class ComparisonController {
    constructor() {
        this.logger = createLogger({ appName: 'ComparisonController' });
        this.pythonAvailable = null;
        this.sqliteAvailable = null;
        
        // Thresholds for engine selection
        this.LARGE_DATASET_THRESHOLD = {
            TOTAL_RECORDS: 10000,    // Total records across all orgs
            RECORDS_PER_ORG: 2000,   // Records per org
            ORGS_COUNT: 5,           // Number of orgs
            FIELDS_COUNT: 50         // Fields to compare
        };
    }

    async checkPythonAvailability() {
        if (this.pythonAvailable !== null) {
            return this.pythonAvailable;
        }

        try {
            // Try python3 first, then python
            const commands = ['python3 --version', 'python --version'];
            
            for (const cmd of commands) {
                try {
                    const { stdout } = await execAsync(cmd);
                    if (stdout.includes('Python 3.')) {
                        this.pythonAvailable = cmd.split(' ')[0]; // 'python3' or 'python'
                        this.logger.info(`Python available: ${this.pythonAvailable} (${stdout.trim()})`);
                        return this.pythonAvailable;
                    }
                } catch (cmdError) {
                    continue;
                }
            }
            
            this.pythonAvailable = false;
            this.logger.warn('Python 3 not found in PATH');
            return false;
            
        } catch (error) {
            this.pythonAvailable = false;
            this.logger.error('Error checking Python availability:', error);
            return false;
        }
    }

    async checkSQLiteAvailability() {
        if (this.sqliteAvailable !== null) {
            return this.sqliteAvailable;
        }

        try {
            // Try to require sqlite3
            require('sqlite3');
            this.sqliteAvailable = true;
            this.logger.info('SQLite3 module available');
            return true;
        } catch (error) {
            this.sqliteAvailable = false;
            this.logger.warn('SQLite3 module not available, will use file-based engine');
            return false;
        }
    }

    analyzeDatasetSize(config, orgData) {
        const analysis = {
            totalRecords: 0,
            maxRecordsPerOrg: 0,
            orgCount: Object.keys(config.orgs || {}).length,
            objectCount: Object.keys(config.objects || {}).length,
            totalFields: 0,
            isLarge: false,
            factors: []
        };

        // Analyze org data if provided
        if (orgData) {
            for (const [objectName, objectOrgData] of Object.entries(orgData)) {
                for (const [orgName, records] of Object.entries(objectOrgData)) {
                    analysis.totalRecords += records.length;
                    analysis.maxRecordsPerOrg = Math.max(analysis.maxRecordsPerOrg, records.length);
                }
            }
        }

        // Analyze field counts
        for (const [objectName, objectConfig] of Object.entries(config.objects || {})) {
            const fields = objectConfig.Fields || [];
            analysis.totalFields += fields.length;
        }

        // Determine if dataset is large
        const thresholds = this.LARGE_DATASET_THRESHOLD;
        
        if (analysis.totalRecords > thresholds.TOTAL_RECORDS) {
            analysis.isLarge = true;
            analysis.factors.push(`Total records: ${analysis.totalRecords} > ${thresholds.TOTAL_RECORDS}`);
        }
        
        if (analysis.maxRecordsPerOrg > thresholds.RECORDS_PER_ORG) {
            analysis.isLarge = true;
            analysis.factors.push(`Max records per org: ${analysis.maxRecordsPerOrg} > ${thresholds.RECORDS_PER_ORG}`);
        }
        
        if (analysis.orgCount > thresholds.ORGS_COUNT) {
            analysis.isLarge = true;
            analysis.factors.push(`Org count: ${analysis.orgCount} > ${thresholds.ORGS_COUNT}`);
        }
        
        if (analysis.totalFields > thresholds.FIELDS_COUNT) {
            analysis.isLarge = true;
            analysis.factors.push(`Total fields: ${analysis.totalFields} > ${thresholds.FIELDS_COUNT}`);
        }

        return analysis;
    }

    async selectComparisonEngine(config, orgData = null) {
        const datasetAnalysis = this.analyzeDatasetSize(config, orgData);
        const pythonAvailable = await this.checkPythonAvailability();
        const sqliteAvailable = await this.checkSQLiteAvailability();
        
        let selectedEngine = 'file';  // Default fallback
        let reason = '';

        if (datasetAnalysis.isLarge && pythonAvailable) {
            selectedEngine = 'python';
            reason = `Large dataset detected (${datasetAnalysis.factors.join(', ')}). Using Python for optimal performance.`;
        } else if (datasetAnalysis.isLarge && sqliteAvailable) {
            selectedEngine = 'nodejs-sqlite';
            reason = `Large dataset detected, Python not available. Using Node.js with SQLite.`;
        } else if (sqliteAvailable) {
            selectedEngine = 'nodejs-sqlite';
            reason = `Medium dataset. Using Node.js with SQLite engine.`;
        } else {
            selectedEngine = 'file';
            reason = `Using file-based engine (no native dependencies required).`;
            if (datasetAnalysis.isLarge) {
                reason += ` WARNING: Large dataset detected but optimal engines unavailable - performance may be slower.`;
            }
        }

        this.logger.info(`Engine selection: ${selectedEngine}. ${reason}`);
        
        return {
            engine: selectedEngine,
            reason: reason,
            datasetAnalysis: datasetAnalysis,
            pythonAvailable: !!pythonAvailable,
            sqliteAvailable: !!sqliteAvailable
        };
    }

    async processComparisonWithNodeJSSQLite(comparisonId, config, orgData) {
        this.logger.info(`Starting Node.js SQLite comparison for ${comparisonId}`);
        
        const NodeJSComparisonEngine = require('./nodejs-engine');
        const engine = new NodeJSComparisonEngine(comparisonId, config);
        const results = {};

        try {
            for (const [objectName, objectConfig] of Object.entries(config.objects || {})) {
                if (orgData[objectName]) {
                    this.logger.info(`Processing object ${objectName} with Node.js SQLite engine`);
                    
                    const objectResult = await engine.processObjectComparison(objectName, orgData[objectName]);
                    results[objectName] = objectResult;
                    
                    // Update global state if available
                    if (global.comparisonStates && global.comparisonStates[comparisonId]) {
                        global.comparisonStates[comparisonId].progress.completedObjects++;
                        global.comparisonStates[comparisonId].results[objectName] = objectResult;
                    }
                }
            }

            return {
                success: true,
                engine: 'nodejs-sqlite',
                results: results
            };

        } catch (error) {
            this.logger.error(`Node.js SQLite comparison failed for ${comparisonId}:`, error);
            throw error;
        } finally {
            engine.cleanup();
        }
    }

    async processComparisonWithFile(comparisonId, config, orgData) {
        this.logger.info(`Starting file-based comparison for ${comparisonId}`);
        
        const FileBasedComparisonEngine = require('./file-engine');
        const engine = new FileBasedComparisonEngine(comparisonId, config);
        const results = {};

        try {
            for (const [objectName, objectConfig] of Object.entries(config.objects || {})) {
                if (orgData[objectName]) {
                    this.logger.info(`Processing object ${objectName} with file-based engine`);
                    
                    const objectResult = await engine.processObjectComparison(objectName, orgData[objectName]);
                    results[objectName] = objectResult;
                    
                    // Update global state if available
                    if (global.comparisonStates && global.comparisonStates[comparisonId]) {
                        global.comparisonStates[comparisonId].progress.completedObjects++;
                        global.comparisonStates[comparisonId].results[objectName] = objectResult;
                    }
                }
            }

            return {
                success: true,
                engine: 'file',
                results: results
            };

        } catch (error) {
            this.logger.error(`File-based comparison failed for ${comparisonId}:`, error);
            throw error;
        } finally {
            engine.cleanup();
        }
    }

    async processComparisonWithPython(comparisonId, config, orgData) {
        this.logger.info(`Starting Python comparison for ${comparisonId}`);
        
        const pythonCommand = this.pythonAvailable;
        const scriptPath = path.join(__dirname, '../python/multi_org_comparison.py');
        
        // Prepare arguments for Python script
        const configJson = JSON.stringify(config);
        const orgDataJson = JSON.stringify(orgData);

        return new Promise((resolve, reject) => {
            const pythonProcess = spawn(pythonCommand, [
                scriptPath,
                comparisonId,
                configJson,
                orgDataJson
            ], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    PYTHONUNBUFFERED: '1'
                }
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this.logger.info(`Python stdout: ${output.trim()}`);
                
                // Update progress if state tracking is available
                if (global.comparisonStates && global.comparisonStates[comparisonId]) {
                    // Parse progress updates from Python output
                    if (output.includes('Completed comparison for')) {
                        global.comparisonStates[comparisonId].progress.completedObjects++;
                    }
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.logger.warn(`Python stderr: ${output.trim()}`);
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    this.logger.info(`Python comparison completed successfully for ${comparisonId}`);
                    
                    resolve({
                        success: true,
                        engine: 'python',
                        stdout: stdout,
                        stderr: stderr
                    });
                } else {
                    this.logger.error(`Python comparison failed with code ${code} for ${comparisonId}`);
                    reject(new Error(`Python process exited with code ${code}. Stderr: ${stderr}`));
                }
            });

            pythonProcess.on('error', (error) => {
                this.logger.error(`Python process error for ${comparisonId}:`, error);
                reject(error);
            });

            // Set timeout for long-running processes
            setTimeout(() => {
                if (!pythonProcess.killed) {
                    pythonProcess.kill();
                    reject(new Error('Python comparison timed out'));
                }
            }, 30 * 60 * 1000); // 30 minutes timeout
        });
    }

    async processComparison(comparisonId, config, orgData) {
        try {
            // Select appropriate engine
            const engineSelection = await this.selectComparisonEngine(config, orgData);
            
            // Update global state with engine selection
            if (global.comparisonStates && global.comparisonStates[comparisonId]) {
                global.comparisonStates[comparisonId].engineInfo = engineSelection;
            }

            let result;

            if (engineSelection.engine === 'python') {
                try {
                    result = await this.processComparisonWithPython(comparisonId, config, orgData);
                } catch (pythonError) {
                    this.logger.error(`Python comparison failed, falling back:`, pythonError);
                    
                    // Fallback to SQLite if available, otherwise file-based
                    if (engineSelection.sqliteAvailable) {
                        result = await this.processComparisonWithNodeJSSQLite(comparisonId, config, orgData);
                        result.fallbackUsed = true;
                        result.fallbackReason = `Python failed: ${pythonError.message}`;
                    } else {
                        result = await this.processComparisonWithFile(comparisonId, config, orgData);
                        result.fallbackUsed = true;
                        result.fallbackReason = `Python failed, SQLite unavailable: ${pythonError.message}`;
                    }
                }
            } else if (engineSelection.engine === 'nodejs-sqlite') {
                try {
                    result = await this.processComparisonWithNodeJSSQLite(comparisonId, config, orgData);
                } catch (sqliteError) {
                    this.logger.error(`SQLite comparison failed, falling back to file-based:`, sqliteError);
                    
                    // Fallback to file-based
                    result = await this.processComparisonWithFile(comparisonId, config, orgData);
                    result.fallbackUsed = true;
                    result.fallbackReason = `SQLite failed: ${sqliteError.message}`;
                }
            } else {
                // Use file-based engine
                result = await this.processComparisonWithFile(comparisonId, config, orgData);
            }

            return result;

        } catch (error) {
            this.logger.error(`Comparison processing failed for ${comparisonId}:`, error);
            throw error;
        }
    }

    async getComparisonResults(comparisonId, objectName) {
        // Try to get results from different engines in order of preference
        
        const engines = ['nodejs-sqlite', 'file', 'python'];
        
        for (const engineType of engines) {
            try {
                const config = global.comparisonStates?.[comparisonId]?.config;
                if (!config) continue;
                
                let engine;
                let results;
                
                if (engineType === 'nodejs-sqlite' && this.sqliteAvailable) {
                    const NodeJSComparisonEngine = require('./nodejs-engine');
                    engine = new NodeJSComparisonEngine(comparisonId, config);
                    results = await engine.getComparisonResults(objectName);
                    engine.cleanup();
                } else if (engineType === 'file') {
                    const FileBasedComparisonEngine = require('./file-engine');
                    engine = new FileBasedComparisonEngine(comparisonId, config);
                    results = await engine.getComparisonResults(objectName);
                    engine.cleanup();
                }
                
                if (results) {
                    return { source: engineType, results };
                }
                
            } catch (engineError) {
                this.logger.debug(`${engineType} results not available: ${engineError.message}`);
                continue;
            }
        }

        throw new Error(`No comparison results found for ${comparisonId}/${objectName}`);
    }

    getEngineCapabilities() {
        return {
            python: {
                available: !!this.pythonAvailable,
                maxRecommendedRecords: 'unlimited',
                maxRecommendedOrgs: 'unlimited', 
                performance: 'excellent',
                memoryUsage: 'low',
                dependencies: 'Python 3.x'
            },
            'nodejs-sqlite': {
                available: !!this.sqliteAvailable,
                maxRecommendedRecords: this.LARGE_DATASET_THRESHOLD.TOTAL_RECORDS,
                maxRecommendedOrgs: this.LARGE_DATASET_THRESHOLD.ORGS_COUNT,
                performance: 'good',
                memoryUsage: 'medium',
                dependencies: 'SQLite3 native module'
            },
            file: {
                available: true,
                maxRecommendedRecords: this.LARGE_DATASET_THRESHOLD.TOTAL_RECORDS / 2,
                maxRecommendedOrgs: this.LARGE_DATASET_THRESHOLD.ORGS_COUNT / 2,
                performance: 'fair',
                memoryUsage: 'high',
                dependencies: 'None (pure JavaScript)'
            }
        };
    }
}

module.exports = ComparisonController;