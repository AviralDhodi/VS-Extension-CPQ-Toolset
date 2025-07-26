// CPQ Toolset v3 - GraphQL Fetcher Worker with Pagination
const fs = require('fs');
const pkgReader = require('../../../shared/utils/pkgFileReader');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const lockfile = require('proper-lockfile');
const { executeGraphQLQuery, buildGraphQLQuery } = require('../../../shared/utils/graphqlCLIRunner');
const { logger } = require('../../../shared/utils/logger');

// Read and parse the environment payload
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
const baseFetcherId = process.env.FETCHER_INDEX || uuidv4();

logger.info('🚀 GraphQL Fetcher started', {
    orgUsername,
    comparisonId,
    objectCount: objects.length,
    fetcherId: baseFetcherId
});

// Ensure buffer dir exists
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, `../storage/data-extract/${comparisonId}`);
const bufferDir = path.join(dataDir, '.buffers');
if (!pkgReader.existsSync(bufferDir)) {
    pkgReader.mkdirSync(bufferDir, { recursive: true });
}

/**
 * Convert SOQL field list to GraphQL fields
 */
function convertFieldsToGraphQL(fields) {
    return fields.filter(field => field !== 'Id'); // Id is always included
}

/**
 * Process GraphQL records to match SOQL format
 */
function processGraphQLRecords(records, objectName, org) {
    return records.map((record, index) => {
        // Add metadata for tracking
        record._sourceOrg = org;
        record._objectName = objectName;
        record._fetchTimestamp = new Date().toISOString();
        record._recordIndex = index;
        
        // Handle null values consistently
        for (const [key, value] of Object.entries(record)) {
            if (value === null || value === undefined) {
                record[key] = null;
            }
        }
        
        return record;
    });
}

(async () => {
    let objectCounter = 0;

    for (const objectEntry of objects) {
        const fetcherId = `${baseFetcherId}_${objectCounter++}`;
        const { name: objectName, config: objectConfig } = objectEntry;
        
        const graphqlFields = convertFieldsToGraphQL(objectConfig.fields || []);
        const query = buildGraphQLQuery(objectName, graphqlFields, 200);

        let hasNextPage = true;
        let cursor = null;
        let totalRecords = 0;
        let page = 0;
        let allRecords = [];

        while (hasNextPage) {
            try {
                const result = await executeGraphQLQuery(query, orgUsername, cursor);
                const queryData = result?.data?.uiapi?.query?.[objectName];

                if (!queryData) {
                    logger.warn('⚠️ No data returned from GraphQL', { objectName, orgUsername });
                    break;
                }

                // Extract and process records
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

                // Process records
                const processedRecords = processGraphQLRecords(records, objectName, orgUsername);
                allRecords.push(...processedRecords);

                // Write page buffer file
                const pageOutputPath = path.join(
                    bufferDir,
                    `${fetcherId}_page${page}_${orgUsername.replace(/[^a-zA-Z0-9]/g, '_')}__${objectName}.jsonl`
                );

                // Use file locking for safe concurrent writes
                let releaseLock;
                try {
                    releaseLock = await lockfile.lock(pageOutputPath, {
                        realpath: false,
                        stale: 10000,
                        retries: {
                            retries: 10,
                            minTimeout: 100,
                            maxTimeout: 1000
                        }
                    });
                    
                    logger.debug('🔒 Acquired lock for file:', pageOutputPath);

                    // Write records to buffer file
                    pkgReader.writeFileSync(
                        pageOutputPath, 
                        processedRecords.map(r => JSON.stringify(r)).join(os.EOL) + os.EOL, 
                        'utf8'
                    );

                } catch (lockError) {
                    logger.error('❌ Failed to acquire lock or write file', {
                        file: pageOutputPath,
                        error: lockError.message
                    });
                    throw lockError;
                } finally {
                    if (releaseLock) {
                        try {
                            await releaseLock();
                            logger.debug('🔓 Released lock for file:', pageOutputPath);
                        } catch (releaseError) {
                            logger.warn('⚠️ Failed to release lock', {
                                file: pageOutputPath,
                                error: releaseError.message
                            });
                        }
                    }
                }

                totalRecords += records.length;
                page++;

                // Check pagination
                hasNextPage = queryData.pageInfo?.hasNextPage || false;
                cursor = queryData.pageInfo?.endCursor;

                logger.info('📄 GraphQL page fetched', {
                    orgUsername,
                    objectName,
                    page,
                    bufferFile: pageOutputPath,
                    records: records.length,
                    totalRecords,
                    hasNextPage,
                });

                // Send progress to parent if available
                if (process.send) {
                    process.send({
                        type: 'FETCH_PROGRESS',
                        data: {
                            objectName,
                            org: orgUsername,
                            page,
                            recordsInPage: records.length,
                            totalRecords,
                            hasNextPage
                        }
                    });
                }

            } catch (err) {
                logger.error('❌ Error during GraphQL fetch', {
                    orgUsername,
                    objectName,
                    cursor,
                    page,
                    error: err.message
                });
                
                // Send error to parent
                if (process.send) {
                    process.send({
                        type: 'FETCH_ERROR',
                        data: {
                            objectName,
                            org: orgUsername,
                            error: err.message
                        }
                    });
                }
                
                break;
            }
        }

        logger.info('✅ Finished fetching object', { 
            objectName, 
            totalRecords,
            pages: page 
        });
    }

    logger.info('🏁 GraphQL Fetcher finished successfully', { 
        fetcherId: baseFetcherId, 
        orgUsername 
    });
    
    process.exit(0);
})();