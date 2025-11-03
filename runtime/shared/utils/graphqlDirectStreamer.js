// CPQ Toolset v3 - Direct GraphQL to JSONL Buffer Streamer
const { execSync } = require('child_process');
const { logger } = require('./logger');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Transforms GraphQL response to JSONL format for buffer files
 * @param {Object} graphqlResponse - Raw GraphQL response
 * @param {string} objectName - Salesforce object name
 * @param {string} orgUsername - Organization username
 * @returns {string} JSONL formatted records
 */
function transformGraphQLToJSONL(graphqlResponse, objectName, orgUsername) {
  const records = [];
  
  try {
    const queryData = graphqlResponse?.data?.uiapi?.query?.[objectName];
    
    if (!queryData || !queryData.edges) {
      return '';
    }
    
    // Process each edge/node
    queryData.edges.forEach(edge => {
      const node = edge.node;
      const record = {
        Id: node.Id,
        Org: orgUsername,
        ObjectName: objectName
      };
      
      // Flatten the GraphQL response structure
      Object.keys(node).forEach(fieldKey => {
        if (fieldKey !== 'Id') {
          if (typeof node[fieldKey] === 'object' && node[fieldKey]?.value !== undefined) {
            // Simple field with value
            record[fieldKey] = node[fieldKey].value;
          } else if (typeof node[fieldKey] === 'object' && node[fieldKey] !== null) {
            // Relationship field
            Object.keys(node[fieldKey]).forEach(subField => {
              if (node[fieldKey][subField]?.value !== undefined) {
                record[`${fieldKey}.${subField}`] = node[fieldKey][subField].value;
              }
            });
          }
        }
      });
      
      records.push(JSON.stringify(record));
    });
    
    return records.join('\\n') + (records.length > 0 ? '\\n' : '');
  } catch (error) {
    logger.error('Error transforming GraphQL to JSONL', { error: error.message });
    throw error;
  }
}

/**
 * Executes GraphQL query and streams directly to buffer file as JSONL
 * @param {string} query - GraphQL query
 * @param {string} username - Target org username
 * @param {string} bufferFilePath - Path to the buffer file
 * @param {string} objectName - Salesforce object name
 * @param {string} cursor - Pagination cursor
 * @param {boolean} append - Whether to append to existing file
 * @returns {Object} Result with pageInfo for pagination
 */
async function streamGraphQLToBuffer(query, username, bufferFilePath, objectName, cursor = null, append = false) {
  // First, we need to get the response to process it
  // Since SF CLI doesn't support direct transformation, we'll use a hybrid approach
  
  const tmpFile = path.join(os.tmpdir(), `graphql-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
  
  try {
    // Add cursor if provided
    let finalQuery = query;
    if (cursor) {
      // Inject after cursor into the query
      const match = query.match(/([\\w_]+)\\s*\\(\\s*first\\s*:\\s*\\d+/);
      if (match) {
        const objectMatch = match[0];
        finalQuery = query.replace(objectMatch, `${objectMatch}, after: "${cursor}"`);
      }
    }
    
    // Convert to single line for Windows compatibility
    const singleLineQuery = finalQuery.replace(/\\s+/g, ' ').trim();
    
    // Execute with streaming to temp file
    const cmd = `sf api request graphql --target-org ${username} --body "${singleLineQuery}" --stream-to-file "${tmpFile}"`;
    
    logger.debug('Executing GraphQL with direct streaming', {
      username,
      objectName,
      bufferFile: bufferFilePath,
      hasCursor: !!cursor
    });
    
    execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 // Small buffer since we're streaming
    });
    
    // Read and parse the response
    const responseContent = fs.readFileSync(tmpFile, 'utf8');
    const response = JSON.parse(responseContent);
    
    // Check for errors
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors.map(e => e.message).join(', ');
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }
    
    // Transform to JSONL
    const jsonlContent = transformGraphQLToJSONL(response, objectName, username);
    
    // Write to buffer file
    if (jsonlContent) {
      if (append) {
        fs.appendFileSync(bufferFilePath, jsonlContent, 'utf8');
      } else {
        fs.writeFileSync(bufferFilePath, jsonlContent, 'utf8');
      }
    }
    
    // Return pageInfo for pagination
    const queryData = response?.data?.uiapi?.query?.[objectName];
    return {
      hasNextPage: queryData?.pageInfo?.hasNextPage || false,
      endCursor: queryData?.pageInfo?.endCursor || null,
      recordCount: queryData?.edges?.length || 0
    };
    
  } catch (error) {
    logger.error('Failed to stream GraphQL to buffer', {
      error: error.message,
      username,
      objectName,
      bufferFile: bufferFilePath
    });
    throw error;
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch (cleanupErr) {
      logger.warn('Failed to clean up temp file', { file: tmpFile });
    }
  }
}

/**
 * Fetches all records for an object and streams directly to buffer file
 * @param {string} objectName - Salesforce object name
 * @param {Array} fields - Fields to fetch
 * @param {string} username - Target org username
 * @param {string} bufferFilePath - Path to the buffer file
 * @param {Object} options - Additional options
 * @returns {Object} Summary of fetched records
 */
async function fetchAllRecordsToBuffer(objectName, fields, username, bufferFilePath, options = {}) {
  const { 
    pageSize = 200,
    maxRecords = null,
    onProgress = null,
    filter = null
  } = options;
  
  let hasNextPage = true;
  let cursor = null;
  let totalRecords = 0;
  let pageNumber = 0;
  
  // Build the GraphQL query
  const { buildGraphQLQuery } = require('./graphqlCLIRunner');
  
  // Filter out problematic relationship fields
  const safeFields = fields.filter(field => {
    if (field.includes('.') && field.includes('__c.')) {
      logger.warn(`Filtering out relationship field ${field} to prevent GraphQL errors`);
      return false;
    }
    return true;
  });
  
  const query = buildGraphQLQuery(objectName, safeFields, pageSize, filter);
  
  while (hasNextPage && (!maxRecords || totalRecords < maxRecords)) {
    try {
      const result = await streamGraphQLToBuffer(
        query,
        username,
        bufferFilePath,
        objectName,
        cursor,
        pageNumber > 0 // Append after first page
      );
      
      totalRecords += result.recordCount;
      hasNextPage = result.hasNextPage;
      cursor = result.endCursor;
      pageNumber++;
      
      // Progress callback
      if (onProgress) {
        onProgress({
          pageNumber,
          recordsInPage: result.recordCount,
          totalRecords,
          hasNextPage,
          objectName,
          username
        });
      }
      
      logger.info('GraphQL page streamed to buffer', {
        objectName,
        username,
        pageNumber,
        recordsInPage: result.recordCount,
        totalRecords,
        hasNextPage,
        bufferFile: bufferFilePath
      });
      
      // Check max records limit
      if (maxRecords && totalRecords >= maxRecords) {
        logger.info('Max records limit reached', {
          objectName,
          username,
          maxRecords,
          totalRecords
        });
        break;
      }
      
    } catch (error) {
      logger.error('Error streaming GraphQL page to buffer', {
        objectName,
        username,
        pageNumber,
        error: error.message
      });
      
      if (options.continueOnError) {
        logger.warn('Continuing despite error (continueOnError=true)');
        break;
      } else {
        throw error;
      }
    }
  }
  
  return {
    totalRecords,
    pagesFetched: pageNumber,
    bufferFile: bufferFilePath
  };
}

module.exports = {
  streamGraphQLToBuffer,
  fetchAllRecordsToBuffer,
  transformGraphQLToJSONL
};