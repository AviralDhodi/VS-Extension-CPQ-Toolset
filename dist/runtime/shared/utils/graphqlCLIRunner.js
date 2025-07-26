// CPQ Toolset v3 - GraphQL CLI Runner
// Based on v1 implementation with enhancements
const { execSync } = require('child_process');
const { logger } = require('./logger');
const os = require('os');

/**
 * Escapes a GraphQL query for inline CLI use, platform-specific.
 */
function escapeGraphQLForCLI(query) {
  const platform = os.platform();
  if (platform === 'win32') {
    // Windows PowerShell
    return query.replace(/"/g, '`"'); // backtick escape for PowerShell
  } else {
    // macOS, Linux, WSL, Git Bash
    return query.replace(/"/g, '\\"'); // escape quotes for Bash
  }
}

/**
 * Replaces the after: cursor clause dynamically regardless of object name.
 */
function injectAfterCursor(query, cursor) {
  if (!cursor) return query;

  // Escape cursor safely for inline CLI injection
  const safeCursor = cursor.replace(/"/g, '\\"');

  // Match any object with a `first:` clause like: ObjectName(first: 200)
  const match = query.match(/(\w+)\s*\(\s*first\s*:\s*\d+\s*\)/);
  if (!match) return query;

  const objectName = match[1];

  // Inject after: "...", preserving original formatting
  return query.replace(
    new RegExp(`(${objectName}\\s*\\(\\s*first\\s*:\\s*\\d+\\s*)\\)`),
    `$1, after: "${safeCursor}")`
  );
}

/**
 * Build GraphQL query for Salesforce UI API
 */
function buildGraphQLQuery(objectName, fields, limit = 200) {
  // Convert field names to GraphQL format
  const fieldQueries = fields.map(field => {
    if (field.includes('.')) {
      // Relationship field - e.g., Account.Name becomes Account { Name { value } }
      const [relation, relField] = field.split('.');
      return `${relation} { ${relField} { value } }`;
    } else {
      // Simple field
      return `${field} { value }`;
    }
  }).join('\n          ');

  const query = `
    query ${objectName}Query {
      uiapi {
        query {
          ${objectName}(first: ${limit}) {
            edges {
              node {
                Id
                ${fieldQueries}
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `.trim();

  return query;
}

/**
 * Executes GraphQL query via CLI, cross-platform compatible
 */
async function executeGraphQLQuery(query, username, cursor = null) {
  try {
    const finalQuery = injectAfterCursor(query, cursor);
    const escapedQuery = escapeGraphQLForCLI(finalQuery);
    const cmd = `sf api request graphql --target-org ${username} --body "${escapedQuery}"`;
    
    logger.debug('Executing GraphQL query', { 
      username, 
      hasCursor: !!cursor,
      queryLength: finalQuery.length 
    });
    
    const output = execSync(cmd, { 
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large responses
    });
    
    if (!output || output.trim() === '') {
      throw new Error('Empty CLI response');
    }

    try {
      const result = JSON.parse(output);
      
      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(e => e.message).join(', ');
        throw new Error(`GraphQL errors: ${errorMessages}`);
      }
      
      return result;
    } catch (parseErr) {
      logger.error('Failed to parse CLI JSON output', {
        error: parseErr.message,
        outputLength: output.length,
        outputSample: output.substring(0, 500)
      });
      throw new Error(`JSON parse error: ${parseErr.message}`);
    }

  } catch (err) {
    logger.error('GraphQL CLI execution failed', {
      error: err.message,
      username,
      cursor
    });
    throw err;
  }
}

/**
 * Fetch all records for an object using pagination
 */
async function fetchAllRecords(objectName, fields, username, options = {}) {
  const { 
    pageSize = 200, 
    maxRecords = null,
    onProgress = null 
  } = options;
  
  const allRecords = [];
  let hasNextPage = true;
  let cursor = null;
  let pageNumber = 0;
  
  const query = buildGraphQLQuery(objectName, fields, pageSize);
  
  while (hasNextPage) {
    try {
      const result = await executeGraphQLQuery(query, username, cursor);
      const queryData = result?.data?.uiapi?.query?.[objectName];
      
      if (!queryData) {
        logger.warn('No data returned from GraphQL', { objectName, username });
        break;
      }
      
      // Extract records from edges
      const records = queryData.edges?.map(edge => {
        const node = edge.node;
        const record = { Id: node.Id };
        
        // Process each field
        Object.keys(node).forEach(fieldKey => {
          if (fieldKey !== 'Id') {
            if (typeof node[fieldKey] === 'object' && node[fieldKey]?.value !== undefined) {
              // Simple field with value
              record[fieldKey] = node[fieldKey].value;
            } else if (typeof node[fieldKey] === 'object') {
              // Relationship field
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
      
      allRecords.push(...records);
      pageNumber++;
      
      // Update pagination info
      hasNextPage = queryData.pageInfo?.hasNextPage || false;
      cursor = queryData.pageInfo?.endCursor;
      
      // Progress callback
      if (onProgress) {
        onProgress({
          pageNumber,
          recordsInPage: records.length,
          totalRecords: allRecords.length,
          hasNextPage,
          objectName,
          username
        });
      }
      
      logger.info('GraphQL page fetched', {
        objectName,
        username,
        pageNumber,
        recordsInPage: records.length,
        totalRecords: allRecords.length,
        hasNextPage
      });
      
      // Check max records limit
      if (maxRecords && allRecords.length >= maxRecords) {
        logger.info('Max records limit reached', {
          objectName,
          username,
          maxRecords,
          totalRecords: allRecords.length
        });
        break;
      }
      
    } catch (error) {
      logger.error('Error fetching GraphQL page', {
        objectName,
        username,
        pageNumber,
        error: error.message
      });
      
      // Decide whether to continue or fail
      if (options.continueOnError) {
        logger.warn('Continuing despite error (continueOnError=true)');
        break;
      } else {
        throw error;
      }
    }
  }
  
  return allRecords;
}

module.exports = {
  executeGraphQLQuery,
  buildGraphQLQuery,
  fetchAllRecords,
  injectAfterCursor,
  escapeGraphQLForCLI
};