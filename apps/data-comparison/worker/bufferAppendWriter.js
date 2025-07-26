// CPQ Toolset v3 - Buffer Append Writer (Based on v1)
const fs = require('fs');
const pkgReader = require('../../../shared/utils/pkgFileReader');
const path = require('path');
const os = require('os');
const lockfile = require('proper-lockfile');
const { logger } = require('../../../shared/utils/logger');

const baseDir = process.env.BASE_DIR || path.resolve(__dirname, '../storage/data-extract');
const comparisonId = process.env.COMPARISON_ID;

if (!comparisonId) {
    logger.error('❌ No COMPARISON_ID provided');
    process.exit(1);
}

logger.info('🌀 Buffer AppendWriter started', { 
    baseDir, 
    comparisonId,
    pid: process.pid 
});

function ensureDir(dirPath) {
    if (!pkgReader.existsSync(dirPath)) {
        pkgReader.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Extract metadata from buffer filename
 */
function extractMetaFromFilename(filename) {
    // Format: fetcherId_pageN_orgName__objectName.jsonl
    const match = filename.match(/^[^_]+(?:_\d+)?(?:_page\d+)?_([^_]+(?:_[^_]+)*)__([^\.]+)\.jsonl$/);
    if (!match) return null;

    const [, orgNameRaw, objectName] = match;
    const orgName = orgNameRaw.replace(/[^a-zA-Z0-9_]/g, '_');
    return { orgName, objectName };
}

/**
 * Append buffer file to target JSONL
 */
async function appendBufferToTarget(bufferPath, comparisonId) {
    const fileName = path.basename(bufferPath);
    const meta = extractMetaFromFilename(fileName);
    
    if (!meta) {
        logger.warn('❌ Skipping malformed buffer filename', { fileName });
        return;
    }

    const { orgName, objectName } = meta;
    const targetPath = path.join(baseDir, comparisonId, orgName, `${objectName}.jsonl`);
    const targetDir = path.dirname(targetPath);

    let releaseLock;
    try {
        // Acquire lock on buffer file
        releaseLock = await lockfile.lock(bufferPath, {
            realpath: false,
            stale: 15000,
            retries: { 
                retries: 5, 
                minTimeout: 100, 
                maxTimeout: 500 
            }
        });

        logger.debug('🔒 Lock acquired', { bufferPath });

        // Check if file still exists
        if (!pkgReader.existsSync(bufferPath)) {
            logger.debug('📁 Buffer disappeared after lock, skipping:', bufferPath);
            return;
        }

        // Ensure target directory exists
        ensureDir(targetDir);

        // Read buffer content
        const lines = pkgReader.readFileSync(bufferPath, 'utf8')
            .split(/\r?\n/)
            .filter(Boolean);

        if (lines.length === 0) {
            fs.unlinkSync(bufferPath);
            logger.debug('🧹 Deleted empty buffer file', { bufferPath });
            return;
        }

        // Append to target file
        const stream = fs.createWriteStream(targetPath, { flags: 'a' });
        
        await new Promise((resolve, reject) => {
            stream.on('error', reject);
            stream.on('finish', resolve);
            
            lines.forEach(line => {
                stream.write(line + os.EOL);
            });
            
            stream.end();
        });

        logger.info('✅ Appended buffer → target', {
            from: path.relative(baseDir, bufferPath),
            to: path.relative(baseDir, targetPath),
            lines: lines.length
        });

        // Delete processed buffer file
        fs.unlinkSync(bufferPath);
        logger.debug('🧹 Deleted processed buffer', { bufferPath });

    } catch (error) {
        if (error.code === 'ELOCKED') {
            logger.debug('⏸️ File in use, skipping for now', { bufferPath });
            return;
        }
        logger.error('❌ Append failed', { 
            bufferPath, 
            error: error.message 
        });
    } finally {
        if (releaseLock) {
            try {
                await releaseLock();
                logger.debug('🔓 Released lock', { bufferPath });
            } catch (releaseError) {
                logger.warn('⚠️ Lock release failed', { 
                    bufferPath, 
                    error: releaseError.message 
                });
            }
        }
    }
}

/**
 * Process existing buffer files
 */
async function processExistingBuffers() {
    const bufferDir = path.join(baseDir, comparisonId, '.buffers');
    
    if (!pkgReader.existsSync(bufferDir)) {
        logger.info('📁 No buffer directory found, creating...', { bufferDir });
        ensureDir(bufferDir);
        return;
    }
    
    const files = pkgReader.readdirSync(bufferDir)
        .filter(f => f.endsWith('.jsonl'));
    
    if (files.length > 0) {
        logger.info(`📦 Found ${files.length} existing buffer files to process`);
        
        for (const file of files) {
            const fullPath = path.join(bufferDir, file);
            await appendBufferToTarget(fullPath, comparisonId);
        }
    }
}

/**
 * Monitor buffer directory for new files
 */
function monitorBufferDirectory() {
    const bufferDir = path.join(baseDir, comparisonId, '.buffers');
    ensureDir(bufferDir);
    
    logger.info('👀 Watching buffer directory for incoming files...', { bufferDir });

    // Process any existing files first
    processExistingBuffers().catch(err => {
        logger.error('❌ Error processing existing buffers', { error: err.message });
    });

    // Watch for new files
    const watcher = fs.watch(bufferDir, { persistent: true }, async (eventType, filename) => {
        if (!filename || !filename.endsWith('.jsonl')) return;
        
        if (eventType === 'rename') {
            // New file created or file deleted
            const fullPath = path.join(bufferDir, filename);
            
            // Small delay to ensure file is fully written
            setTimeout(async () => {
                try {
                    if (pkgReader.existsSync(fullPath)) {
                        await appendBufferToTarget(fullPath, comparisonId);
                    }
                } catch (error) {
                    logger.error('❌ Error processing buffer', { 
                        file: fullPath, 
                        error: error.message 
                    });
                }
            }, 100);
        }
    });

    // Handle process termination
    process.on('SIGTERM', () => {
        logger.info('🛑 Received SIGTERM, shutting down gracefully...');
        watcher.close();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        logger.info('🛑 Received SIGINT, shutting down gracefully...');
        watcher.close();
        process.exit(0);
    });

    // Periodic check for stuck files
    setInterval(async () => {
        try {
            const files = pkgReader.readdirSync(bufferDir)
                .filter(f => f.endsWith('.jsonl'));
            
            if (files.length > 0) {
                logger.debug(`🔄 Periodic check found ${files.length} buffer files`);
                
                for (const file of files) {
                    const fullPath = path.join(bufferDir, file);
                    const stats = fs.statSync(fullPath);
                    
                    // If file hasn't been modified in last 30 seconds, try to process it
                    if (Date.now() - stats.mtimeMs > 30000) {
                        await appendBufferToTarget(fullPath, comparisonId);
                    }
                }
            }
        } catch (error) {
            logger.error('❌ Error in periodic check', { error: error.message });
        }
    }, 10000); // Check every 10 seconds
}

// Start monitoring
monitorBufferDirectory();