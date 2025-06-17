const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const lockfile = require('proper-lockfile'); // npm install proper-lockfile
const { executeGraphQLQuery } = require('../sfdx/graphql_cli_runner');
const { createLogger } = require('../../../shared/logging/logger');

const logger = createLogger({ appName: 'Fetcher' });

// 1. Read and parse the environment payload
const payloadRaw = process.env.FETCHER_PAYLOAD;
if (!payloadRaw) {
    logger.error('❌ No FETCHER_PAYLOAD received');
    process.exit(1);
}

let payload;
try {
    payload = JSON.parse(payloadRaw);
} catch (err) {
    logger.error('❌ Failed to parse FETCHER_PAYLOAD', { error: err.message });
    process.exit(1);
}

const { orgUsername, comparisonId, objects } = payload;
const baseFetcherId = process.env.FETCHER_INDEX || uuidv4(); // base ID per process

logger.info('🚀 Fetcher started', {
    orgUsername,
    comparisonId,
    objectCount: objects.length,
    fetcherId: baseFetcherId
});

// Ensure buffer dir exists
const bufferDir = path.resolve(__dirname, `../data-extract/${comparisonId}/.buffers`);
if (!fs.existsSync(bufferDir)) {
    fs.mkdirSync(bufferDir, { recursive: true });
}

(async () => {
    let objectCounter = 0;

    for (const objectEntry of objects) {
        const fetcherId = `${baseFetcherId}_${objectCounter++}`; // append object-specific index
        const { name: objectName, config: objectConfig } = objectEntry;
        const query = require('../sfdx/commands').dataComparisonSFDX.buildGraphQLQuery(objectName, objectConfig);

        let hasNextPage = true;
        let cursor = null;
        let totalRecords = 0;
        let page = 0;

        const outputPath = path.join(
            bufferDir,
            `${fetcherId}_${orgUsername.replace(/[^a-zA-Z0-9]/g, '_')}__${objectName}.jsonl`
        );
        const stream = fs.createWriteStream(outputPath, { flags: 'a' });

        while (hasNextPage) {
            try {
                const result = await executeGraphQLQuery(query, orgUsername, cursor);
                const queryData = result?.data?.uiapi?.query?.[objectName];

                if (!queryData) {
                    logger.warn('⚠️ No data returned from GraphQL', { objectName, orgUsername });
                    break;
                }

                const records = queryData.edges?.map(edge => {
                    const node = edge.node;
                    const record = { Id: node.Id };
                    Object.keys(node).forEach(fieldKey => {
                        if (fieldKey !== 'Id') {
                            if (typeof node[fieldKey] === 'object' && node[fieldKey]?.value !== undefined) {
                                record[fieldKey] = node[fieldKey].value;
                            } else if (typeof node[fieldKey] === 'object') {
                                Object.keys(node[fieldKey]).forEach(subField => {
                                    if (node[fieldKey][subField]?.value !== undefined) {
                                        record[`${fieldKey}.${subField}`] = node[fieldKey][subField].value;
                                    }
                                });
                            }
                        }
                    });
                    return record;
                }) || [];

                // ⛳️ NEW: Per-page buffer file with file locking
                const pageOutputPath = path.join(
                    bufferDir,
                    `${fetcherId}_page${page}_${orgUsername.replace(/[^a-zA-Z0-9]/g, '_')}__${objectName}.jsonl`
                );

                // 🔒 CRITICAL SECTION START - System-level lock with proper-lockfile
                let releaseLock;
                try {
                    // Use proper-lockfile with realpath: false to allow locking non-existent files
                    releaseLock = await lockfile.lock(pageOutputPath, {
                        realpath: false, // Allow locking files that don't exist yet
                        stale: 10000, // 10 seconds stale timeout
                        retries: {
                            retries: 10, // More retries for coordination
                            minTimeout: 100,
                            maxTimeout: 1000
                        }
                    });
                    
                    logger.debug('🔒 Acquired system-level lock for file:', pageOutputPath);

                    // Write file (protected from concurrent access)
                    fs.writeFileSync(pageOutputPath, records.map(r => JSON.stringify(r)).join(os.EOL) + os.EOL, 'utf8');

                    // Read file content (still protected)
                    const fileContents = fs.readFileSync(pageOutputPath, 'utf8');
                    logger.debug('📦 Buffer File Content:', {
                        file: pageOutputPath,
                        contentPreview: fileContents.slice(0, 1000) // cap preview for safety
                    });

                } catch (lockError) {
                    logger.error('❌ Failed to acquire system lock or write file', {
                        file: pageOutputPath,
                        error: lockError.message
                    });
                    throw lockError;
                } finally {
                    // 🔓 CRITICAL SECTION END - Always release system-level lock
                    if (releaseLock) {
                        try {
                            await releaseLock();
                            logger.debug('🔓 Released system-level lock for file:', pageOutputPath);
                        } catch (releaseError) {
                            logger.warn('⚠️ Failed to release system lock (but continuing)', {
                                file: pageOutputPath,
                                error: releaseError.message
                            });
                        }
                    }
                }

                totalRecords += records.length;
                page++;

                hasNextPage = queryData.pageInfo?.hasNextPage || false;
                cursor = queryData.pageInfo?.endCursor;

                logger.info('📄 Page fetched', {
                    orgUsername,
                    objectName,
                    page,
                    bufferFile: pageOutputPath,
                    records: records.length,
                    totalRecords,
                    hasNextPage,
                });

            } catch (err) {
                logger.error('❌ Error during GraphQL fetch', {
                    orgUsername,
                    objectName,
                    cursor,
                    page,
                    error: err.message
                });
                break;
            }
        }

        stream.end();
        logger.info('✅ Finished writing buffer', { outputPath, totalRecords });
    }

    logger.info('🏁 Fetcher finished successfully', { fetcherId: baseFetcherId, orgUsername });
    process.exit(0);
})();