// CPQ Toolset v3 - Spawn GraphQL Fetchers with Pagination Support
const { fork, spawn } = require('child_process');
const fs = require('fs');
const pkgReader = require('../../../shared/utils/pkgFileReader');
const path = require('path');
const { logger } = require('../../../shared/utils/logger');

/**
 * Split array into chunks for parallel processing
 */
function splitArrayIntoChunks(array, chunks) {
    const result = [];
    const chunkSize = Math.ceil(array.length / chunks);
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
}

/**
 * Check if buffer directory is empty
 */
function isBufferDirEmpty(bufferDir) {
    if (!pkgReader.existsSync(bufferDir)) return true;
    const files = pkgReader.readdirSync(bufferDir);
    return files.filter(f => f.endsWith('.jsonl') || f.endsWith('.lock')).length === 0;
}

/**
 * Wait for all buffers to be processed
 */
function waitForBuffersToClear(bufferDir, timeout = 60000, interval = 500) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (isBufferDirEmpty(bufferDir)) {
                logger.info('[Success] Buffer directory is clear');
                return resolve();
            }
            if (Date.now() - start > timeout) {
                return reject(new Error('Timeout waiting for buffers to clear'));
            }
            
            // Log progress
            const remainingFiles = pkgReader.readdirSync(bufferDir)
                .filter(f => f.endsWith('.jsonl'));
            logger.debug(`⏳ Waiting for ${remainingFiles.length} buffer files to be processed...`);
            
            setTimeout(check, interval);
        };
        check();
    });
}

/**
 * Get max concurrent workers from VS Code settings or environment
 */
function getMaxConcurrentWorkers() {
    // First check environment variable
    if (process.env.MAX_CONCURRENT_WORKERS) {
        return parseInt(process.env.MAX_CONCURRENT_WORKERS, 10);
    }
    
    // Try to get from VS Code settings
    try {
        const vscode = require('vscode');
        const setting = vscode.workspace.getConfiguration('cpq-toolset').get('maxConcurrentWorkers');
        if (setting) {
            return parseInt(setting, 10);
        }
    } catch (error) {
        // Not in VS Code context
    }
    
    // Default to number of CPUs
    const cpuCount = require('os').cpus().length;
    return Math.max(2, Math.min(cpuCount - 1, 4)); // Between 2 and 4 workers
}

/**
 * Spawn GraphQL fetchers with pagination support
 */
async function spawnGraphQLFetchers(config, comparisonId, inputNumberOfProcesses, progressCallback) {
    const numberOfOrgs = config.orgs.length;
    const numberOfFetchers = inputNumberOfProcesses || getMaxConcurrentWorkers();
    const processPerOrg = Math.max(1, Math.floor(numberOfFetchers / numberOfOrgs));
    const objectEntries = Object.entries(config.objects);
    const fetcherScript = path.resolve(__dirname, './graphqlFetcher.js');
    const appendWriterScript = path.resolve(__dirname, './bufferAppendWriter.js');
    
    // Use dataDir from config if provided, otherwise use default
    const dataDir = config.dataDir || path.resolve(__dirname, `../storage/data-extract/${comparisonId}`);
    const bufferDir = path.join(dataDir, '.buffers');

    logger.info('[Starting] Starting GraphQL fetchers', {
        numberOfOrgs,
        numberOfFetchers,
        processPerOrg,
        totalObjects: objectEntries.length,
        comparisonId
    });

    // Ensure buffer directory exists
    if (!pkgReader.existsSync(bufferDir)) {
        pkgReader.mkdirSync(bufferDir, { recursive: true });
    }

    const fetcherPromises = [];
    
    // Progress tracking
    let totalFetchers = 0;
    let completedFetchers = 0;
    let currentObject = null;
    const totalObjects = objectEntries.length;
    
    const updateProgress = (objectName = null) => {
      if (objectName) {
        currentObject = objectName;
      }
      if (progressCallback && totalFetchers > 0) {
        const percentage = Math.floor((completedFetchers / totalFetchers) * 100);
        progressCallback({
          percentage,
          completed: completedFetchers,
          total: totalFetchers,
          totalObjects,
          currentObject
        });
      }
    };

    // 🌀 Start appendWriter first
    logger.info('📂 Starting AppendWriter process...');
    let appendWriterProcess;
    
    // Fork appendWriter process
    appendWriterProcess = fork(appendWriterScript, [], {
        stdio: 'inherit',
        env: { 
            ...process.env,
            COMPARISON_ID: comparisonId,
            BASE_DIR: path.dirname(dataDir)
        }
    });
    
    appendWriterProcess.on('error', (error) => {
        logger.error('❌ AppendWriter process error', { error: error.message });
    });

    // Process each org
    for (const org of config.orgs) {
        // Support both object format {username, alias} and string format
        const username = org.username || org;
        const alias = org.alias || org;

        // Split objects into chunks for parallel processing
        const chunks = processPerOrg > 1
            ? splitArrayIntoChunks(objectEntries, processPerOrg)
            : [objectEntries]; // all in one process

        chunks.forEach((chunk, index) => {
            totalFetchers++; // Count each fetcher
            
            // Update progress with first object in chunk
            const firstObjectInChunk = chunk[0][0];
            updateProgress(firstObjectInChunk);
            
            const payload = {
                orgUsername: username,
                orgAlias: alias,  // Pass alias for folder naming
                comparisonId,
                objects: chunk.map(([name, config]) => ({ name, config }))
            };

            const fetcherIndex = `${alias.replace(/[@.]/g, '_')}_${index}`;

            fetcherPromises.push(
                new Promise((resolve, reject) => {
                    // Fork fetcher process
                    const child = fork(fetcherScript, [], {
                        stdio: 'inherit',
                        env: { 
                            ...process.env,
                            FETCHER_PAYLOAD: JSON.stringify(payload),
                            FETCHER_INDEX: fetcherIndex,
                            DATA_DIR: dataDir
                        }
                    });

                    let hasCompleted = false;

                    child.on('message', (message) => {
                        if (message.type === 'FETCH_PROGRESS') {
                            logger.debug('📊 Fetcher progress', message.data);
                            // Update progress when individual fetchers report progress
                            if (message.data && (message.data.object || message.data.objectName)) {
                                updateProgress(message.data.object || message.data.objectName);
                            }
                        }
                    });

                    child.on('exit', (code) => {
                        if (!hasCompleted) {
                            hasCompleted = true;
                            completedFetchers++;
                            updateProgress();
                            
                            if (code === 0) {
                                logger.info('[Success] Fetcher completed', { 
                                    org: username, 
                                    index,
                                    fetcherIndex,
                                    progress: `${completedFetchers}/${totalFetchers}`
                                });
                                resolve();
                            } else {
                                const error = new Error(`Fetcher exited with code ${code}`);
                                logger.error('❌ Fetcher failed', { 
                                    org: username, 
                                    index,
                                    code,
                                    fetcherIndex 
                                });
                                reject(error);
                            }
                        }
                    });

                    child.on('error', (error) => {
                        if (!hasCompleted) {
                            hasCompleted = true;
                            logger.error('❌ Fetcher process error', { 
                                org: username, 
                                index,
                                error: error.message 
                            });
                            reject(error);
                        }
                    });

                    logger.info('[Processing] Spawned GraphQL fetcher', {
                        org: username,
                        index,
                        objectCount: chunk.length,
                        fetcherIndex
                    });
                })
            );
        });
    }
    
    // Initial progress update
    updateProgress();

    try {
        // Wait for all fetchers to complete
        await Promise.all(fetcherPromises);
        logger.info('[Success] All GraphQL fetchers completed');

        // Wait for appendWriter to finish processing remaining buffers
        logger.info('⏳ Waiting for AppendWriter to process remaining buffers...');
        await waitForBuffersToClear(bufferDir);
        logger.info('[Success] All buffers processed');

        // Gracefully shutdown appendWriter
        appendWriterProcess.kill('SIGTERM');
        
        // Give it a moment to clean up
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        logger.info('🏁 All GraphQL fetchers and AppendWriter completed successfully');

        return {
            success: true,
            numberOfFetchers,
            numberOfOrgs,
            totalObjects: objectEntries.length
        };

    } catch (error) {
        logger.error('❌ Error during GraphQL fetching', { error: error.message });
        
        // Kill appendWriter on error
        try {
            appendWriterProcess.kill('SIGKILL');
        } catch (killError) {
            logger.warn('[Warning] Failed to kill AppendWriter', { error: killError.message });
        }
        
        throw error;
    }
}

// Export for use in other modules
module.exports = { 
    spawnGraphQLFetchers,
    getMaxConcurrentWorkers 
};