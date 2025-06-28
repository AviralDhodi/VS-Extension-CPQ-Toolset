const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger({ appName: 'AppendWriter', location: 'worker/appendWriter' });

const baseDir = path.resolve(__dirname, '../storage/data-extract');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function extractMetaFromFilename(filename) {
    const match = filename.match(/^[^_]+(?:_\d+)?(?:_page\d+)?_([^_]+(?:_[^_]+)*)__([^\.]+)\.jsonl$/);
    if (!match) return null;

    const [, orgNameRaw, objectName] = match;
    const orgName = orgNameRaw.replace(/[^a-zA-Z0-9_]/g, '_');
    return { orgName, objectName };
}

// Simple file locking using fs with retry mechanism
async function withFileLock(filePath, operation, maxRetries = 5) {
    const lockPath = filePath + '.lock';
    let attempts = 0;
    
    while (attempts < maxRetries) {
        try {
            // Try to create lock file exclusively
            fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
            
            try {
                const result = await operation();
                return result;
            } finally {
                // Always remove lock file
                try {
                    fs.unlinkSync(lockPath);
                } catch (e) {
                    logger.warn('Failed to remove lock file', { lockPath, error: e.message });
                }
            }
        } catch (error) {
            if (error.code === 'EEXIST') {
                // Lock file exists, wait and retry
                attempts++;
                const delay = Math.min(100 * attempts, 500); // Linear backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            } else {
                throw error;
            }
        }
    }
    
    throw new Error(`Failed to acquire lock after ${maxRetries} attempts: ${lockPath}`);
}

async function appendBufferToTarget(bufferPath, comparisonId) {
    const fileName = path.basename(bufferPath);
    const meta = extractMetaFromFilename(fileName);
    if (!meta) {
        logger.warn('Skipping malformed buffer filename', { fileName });
        return;
    }

    const { orgName, objectName } = meta;
    const targetPath = path.join(baseDir, comparisonId, orgName, `${objectName}.jsonl`);
    const targetDir = path.dirname(targetPath);

    try {
        await withFileLock(bufferPath, async () => {
            logger.debug('Lock acquired for buffer', { bufferPath });

            if (!fs.existsSync(bufferPath)) {
                logger.debug('Buffer disappeared after lock, skipping', { bufferPath });
                return;
            }

            ensureDir(targetDir);
            const lines = fs.readFileSync(bufferPath, 'utf8').split(/\r?\n/).filter(Boolean);

            if (lines.length === 0) {
                fs.unlinkSync(bufferPath);
                logger.debug('Deleted empty buffer file', { bufferPath });
                return;
            }

            // Append to target file
            const stream = fs.createWriteStream(targetPath, { flags: 'a' });
            lines.forEach(line => stream.write(line + os.EOL));
            stream.end();

            await new Promise((resolve, reject) => {
                stream.on('finish', resolve);
                stream.on('error', reject);
            });

            logger.info('Appended buffer to target', {
                from: path.relative(baseDir, bufferPath),
                to: path.relative(baseDir, targetPath),
                lines: lines.length
            });

            // Remove buffer file after successful append
            fs.unlinkSync(bufferPath);
        });

    } catch (error) {
        if (error.message.includes('Failed to acquire lock')) {
            logger.debug('File in use, skipping for now', { bufferPath });
            return;
        }
        logger.error('Append failed', { bufferPath, error: error.message });
    }
}

function monitorAllBuffers() {
    logger.info('Watching all .buffers for incoming files...');

    fs.watch(baseDir, { recursive: true }, async (event, filename) => {
        if (!filename || !filename.endsWith('.jsonl')) return;

        const fullPath = path.join(baseDir, filename);
        if (!fullPath.includes(path.sep + '.buffers' + path.sep)) return;

        const relativeParts = fullPath.split(path.sep);
        const buffersIndex = relativeParts.findIndex(p => p === '.buffers');
        if (buffersIndex === -1) return;

        const comparisonId = relativeParts[buffersIndex - 1];
        if (!comparisonId) return;

        // Debounce file operations
        setTimeout(async () => {
            try {
                if (fs.existsSync(fullPath)) {
                    await appendBufferToTarget(fullPath, comparisonId);
                }
            } catch (error) {
                logger.error('Error processing buffer', { 
                    file: fullPath, 
                    error: error.message 
                });
            }
        }, 100);
    });
}

monitorAllBuffers();