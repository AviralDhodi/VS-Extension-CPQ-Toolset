const fs = require('fs');
const path = require('path');
const os = require('os');
const { executeGraphQLQuery } = require('../../../shared/utils/graphqlRunner');
const { sfdxCommands } = require('../../../shared/utils/sfdxCommands');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger({ appName: 'Fetcher', location: 'worker/fetcher' });

// Generate a simple unique ID without external dependencies
function generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// Simple file locking using fs with retry mechanism
async function withFileLock(filePath, operation, maxRetries = 10) {
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
                const delay = Math.min(100 * Math.pow(2, attempts), 1000); // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            } else {
                throw error;
            }
        }
    }
    
    throw new Error(`Failed to acquire lock after ${maxRetries} attempts: ${lockPath}`);
}

// Read and parse the environment payload
const payloadRaw = process.env.FETCHER_PAYLOAD;
if (!payloadRaw) {
    logger.error('No FETCHER_PAYLOAD received');
    process.exit(1);
}

let payload;
try {
    payload = JSON.parse(payloadRaw);
} catch (err) {
    logger.error('Failed to parse FETCHER_PAYLOAD', { error: err.message });
    process.exit(1);
}

const { orgUsername, comparisonId, objects } = payload;
const baseFetcherId = process.env.FETCHER_INDEX || generateId();

logger.info('Fetcher started', {
    orgUsername,
    comparisonId,
    objectCount: objects.length,
    fetcherId: baseFetcherId
});

// Ensure buffer dir exists
const bufferDir = path.resolve(__dirname, `../storage/data-extract/${comparisonId}/.buffers`);
if (!fs.existsSync(bufferDir)) {
    fs.mkdirSync(bufferDir, { recursive: true });
}

(async () => {
    let objectCounter = 0;

    for (const objectEntry of objects) {
        const fetcherId = `${baseFetcherId}_${objectCounter++}`;
        const { name: objectName, config: objectConfig } = objectEntry;
        const query = sfdxCommands.buildGraphQLQuery(objectName, objectConfig);

        let hasNextPage = true;
        let cursor = null;
        let totalRecords = 0;
        let page = 0;

        while (hasNextPage) {
            try {
                const result = await executeGraphQLQuery(query, orgUsername, cursor);
                const queryData = result?.data?.uiapi?.query?.[objectName];

                if (!queryData) {
                    logger.warn('No data returned from GraphQL', { objectName, orgUsername });
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

                // Per-page buffer file with file locking
                const pageOutputPath = path.join(
                    bufferDir,
                    `${fetcherId}_page${page}_${orgUsername.replace(/[^a-zA-Z0-9]/g, '_')}__${objectName}.jsonl`
                );

                // Write with file locking
                await withFileLock(pageOutputPath, async () => {
                    logger.debug('Acquired lock for file', { file: pageOutputPath });
                    
                    const jsonlContent = records.map(r => JSON.stringify(r)).join(os.EOL) + os.EOL;
                    fs.writeFileSync(pageOutputPath, jsonlContent, 'utf8');
                    
                    logger.debug('Buffer file written', {
                        file: pageOutputPath,
                        recordCount: records.length,
                        contentSize: jsonlContent.length
                    });
                });

                totalRecords += records.length;
                page++;

                hasNextPage = queryData.pageInfo?.hasNextPage || false;
                cursor = queryData.pageInfo?.endCursor;

                logger.info('Page fetched', {
                    orgUsername,
                    objectName,
                    page,
                    bufferFile: pageOutputPath,
                    records: records.length,
                    totalRecords,
                    hasNextPage
                });

            } catch (err) {
                logger.error('Error during GraphQL fetch', {
                    orgUsername,
                    objectName,
                    cursor,
                    page,
                    error: err.message
                });
                break;
            }
        }

        logger.info('Object fetch completed', { 
            objectName, 
            orgUsername, 
            totalRecords 
        });
    }

    logger.info('Fetcher finished successfully', { 
        fetcherId: baseFetcherId, 
        orgUsername 
    });
    process.exit(0);
})();