const fs = require('fs');
const path = require('path');
const os = require('os');
const lockfile = require('proper-lockfile');
const { createLogger } = require('../../../shared/logging/logger');

const logger = createLogger({ appName: 'AppendWriter' });

const baseDir = path.resolve(__dirname, '../data-extract');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function extractMetaFromFilename(filename) {
    const match = filename.match(/^[^_]+(?:_\d+)?(?:_page\d+)?_([^_]+(?:_[^_]+)*)__([^\.]+)\.jsonl$/);
    if (!match) return null;

    const [ , orgNameRaw, objectName ] = match;
    const orgName = orgNameRaw.replace(/[^a-zA-Z0-9_]/g, '_');
    return { orgName, objectName };
}

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
        releaseLock = await lockfile.lock(bufferPath, {
            realpath: false,
            stale: 15000,
            retries: { retries: 2, minTimeout: 100, maxTimeout: 500 }
        });

        logger.debug('🔒 Lock acquired', { bufferPath });

        if (!fs.existsSync(bufferPath)) {
            logger.debug('📁 Buffer disappeared after lock, skipping:', bufferPath);
            return;
        }

        ensureDir(targetDir);
        const lines = fs.readFileSync(bufferPath, 'utf8').split(/\r?\n/).filter(Boolean);

        if (lines.length === 0) {
            fs.unlinkSync(bufferPath);
            logger.debug('🧹 Deleted empty buffer file', { bufferPath });
            return;
        }

        const stream = fs.createWriteStream(targetPath, { flags: 'a' });
        lines.forEach(line => stream.write(line + os.EOL));
        stream.end();

        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        logger.info('✅ Appended buffer → target', {
            from: path.relative(baseDir, bufferPath),
            to: path.relative(baseDir, targetPath),
            lines: lines.length
        });

        fs.unlinkSync(bufferPath);

    } catch (error) {
        if (error.code === 'ELOCKED') {
            logger.debug('⏸️ File in use, skipping for now', { bufferPath });
            return;
        }
        logger.error('❌ Append failed', { bufferPath, error: error.message });
    } finally {
        if (releaseLock) {
            try {
                await releaseLock();
                logger.debug('🔓 Released lock', { bufferPath });
            } catch (releaseError) {
                logger.warn('⚠️ Lock release failed', { bufferPath, error: releaseError.message });
            }
        }
    }
}

function monitorAllBuffers() {
    logger.info('🌀 Watching all .buffers for incoming files...');

    fs.watch(baseDir, { recursive: true }, async (event, filename) => {
        if (!filename || !filename.endsWith('.jsonl')) return;

        const fullPath = path.join(baseDir, filename);
        if (!fullPath.includes(path.sep + '.buffers' + path.sep)) return;

        const relativeParts = fullPath.split(path.sep);
        const buffersIndex = relativeParts.findIndex(p => p === '.buffers');
        if (buffersIndex === -1) return;

        const comparisonId = relativeParts[buffersIndex - 1];
        if (!comparisonId) return;

        setTimeout(async () => {
            try {
                if (fs.existsSync(fullPath)) {
                    await appendBufferToTarget(fullPath, comparisonId);
                }
            } catch (error) {
                logger.error('❌ Error processing buffer', { file: fullPath, error: error.message });
            }
        }, 100); // debounce
    });
}

monitorAllBuffers();
