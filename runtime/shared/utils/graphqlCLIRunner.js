// CPQ Toolset v3 - GraphQL CLI Runner
// Based on v1 implementation with enhancements
const { execSync } = require('child_process');
const { logger } = require('./logger');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { getInstance: getFilterConverter } = require('./soqlToGraphQLFilter');

/**
 * Escapes a GraphQL query for inline CLI use, platform-specific.
 */
function escapeGraphQLForCLI(query) {
  const platform = os.platform();
  if (platform === 'win32') {
    // Windows - escape quotes in where clause AND after clause to fix string literal issues
    if ((query.includes('where:') || query.includes('after:')) && query.includes('"')) {
      return query.replace(/"/g, '\\"');
    }
    return query;
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
  // The cursor needs to be properly quoted as a string in GraphQL
  const platform = os.platform();
  const safeCursor = cursor; // Use cursor as-is, quotes handled in template

  // Find the object name and its opening parenthesis
  const objectMatch = query.match(/([\w_]+)\s*\(\s*first\s*:\s*\d+/);
  if (!objectMatch) return query;

  const objectName = objectMatch[1];
  const objectStart = query.indexOf(objectMatch[0]);
  
  // Find the matching closing parenthesis for this object
  let parenCount = 0;
  let objectEnd = -1;
  let inString = false;
  let stringChar = null;
  
  for (let i = objectStart; i < query.length; i++) {
    const char = query[i];
    
    // Handle string literals
    if ((char === '"' || char === "'") && (i === 0 || query[i-1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = null;
      }
    }
    
    // Count parentheses only when not in string
    if (!inString) {
      if (char === '(') parenCount++;
      else if (char === ')') {
        parenCount--;
        if (parenCount === 0) {
          objectEnd = i;
          break;
        }
      }
    }
  }

  if (objectEnd === -1) return query;

  // Extract the object portion and inject after cursor
  const beforeObject = query.substring(0, objectStart);
  const objectPortion = query.substring(objectStart, objectEnd);
  const afterObject = query.substring(objectEnd);

  // Insert after cursor before the closing parenthesis
  const modifiedObject = objectPortion + `, after: "${safeCursor}"`;
  
  return beforeObject + modifiedObject + afterObject;
}

/**
 * Build GraphQL query for Salesforce UI API with ID sorting and optional upperbound
 */
function buildGraphQLQuery(objectName, fields, limit = 1000, filter = null, upperbound = null) {
  // Convert field names to GraphQL format
  const fieldQueries = fields.map(field => {
    // Skip relationship fields that traverse to specific fields (e.g., SBQQ__Rule__c.SR_ExternalID__c)
    // These often cause GraphQL errors in older CLI versions
    if (field.includes('.') && field.includes('__c.')) {
      logger.debug(`Skipping relationship field that may not be supported: ${field}`);
      return null;
    } else if (field.includes('.')) {
      // Relationship field - e.g., Account.Name becomes Account { Name { value } }
      const [relation, relField] = field.split('.');
      return `${relation} { ${relField} { value } }`;
    } else {
      // Simple field
      return `${field} { value }`;
    }
  }).filter(f => f !== null).join('\n          ');

  // Build parameters for comprehensive pagination
  let whereClause = '';
  let upperboundClause = '';
  
  if (upperbound && upperbound !== null) {
    upperboundClause = `, upperBound: ${upperbound}`; // Note: upperBound with capital B, no quotes for integer
  }
  
  if (filter) {
    // Format the filter object for GraphQL query
    // We need to ensure proper formatting without quotes around field names in GraphQL
    const formatGraphQLFilter = (obj) => {
      if (Array.isArray(obj)) {
        return '[' + obj.map(formatGraphQLFilter).join(', ') + ']';
      } else if (typeof obj === 'object' && obj !== null) {
        const pairs = [];
        for (const [key, value] of Object.entries(obj)) {
          pairs.push(`${key}: ${formatGraphQLFilter(value)}`);
        }
        return '{' + pairs.join(', ') + '}';
      } else if (typeof obj === 'string') {
        return JSON.stringify(obj);
      } else {
        return JSON.stringify(obj);
      }
    };
    
    whereClause = `, where: ${formatGraphQLFilter(filter)}`;
  }

  const query = `
    query ${objectName}Query {
      uiapi {
        query {
          ${objectName}(first: ${limit}${whereClause}${upperboundClause}) {
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

  // Log the query construction for debugging
  logger.debug('🔨 Built GraphQL Query', {
    objectName,
    limit,
    hasFilter: !!filter,
    hasUpperbound: !!upperbound,
    queryParams: `first: ${limit}${whereClause}${upperboundClause}`
  });

  return query;
}

/**
 * Executes GraphQL query via CLI, cross-platform compatible
 * @param {string} query - GraphQL query
 * @param {string} username - Target org username
 * @param {string} cursor - Pagination cursor
 * @param {Object} options - Additional options
 * @param {string} options.outputFile - Path to stream output to file
 * @param {boolean} options.includeHeaders - Include HTTP headers in output
 */
async function executeGraphQLQuery(query, username, cursor = null, options = {}) {
  const finalQuery = injectAfterCursor(query, cursor);
  
  // Convert multi-line GraphQL to single line to avoid JSON parsing errors
  const singleLineQuery = finalQuery.replace(/\s+/g, ' ').trim();
  
  // Use proper escaping for the command
  const escapedQuery = escapeGraphQLForCLI(singleLineQuery);
  
  // Build command with optional stream-to-file
  let cmd = `sf api request graphql --target-org ${username} --body "${escapedQuery}"`;
  
  if (options.outputFile) {
    cmd += ` --stream-to-file "${options.outputFile}"`;
    if (options.includeHeaders) {
      cmd += ' --include';
    }
  }
  
  try {
    
    logger.info('🔧 Executing CLI Command', { 
      username, 
      hasCursor: !!cursor,
      queryLength: finalQuery.length,
      command: cmd,
      rawQuery: finalQuery,
      escapedQuery: escapedQuery 
    });
    
    // Execute command
    const output = execSync(cmd, { 
      encoding: 'utf8',
      maxBuffer: options.outputFile ? 1024 * 1024 : 50 * 1024 * 1024 // Smaller buffer when streaming to file
    });
    
    // If streaming to file, read the result from the file
    if (options.outputFile) {
      try {
        const fileContent = fs.readFileSync(options.outputFile, 'utf8');
        
        // If headers were included, parse the response differently
        if (options.includeHeaders) {
          // The file contains headers followed by body, separated by blank line
          const parts = fileContent.split('\n\n');
          const body = parts[parts.length - 1]; // Last part is the JSON body
          const result = JSON.parse(body);
          
          // Check for GraphQL errors
          if (result.errors && result.errors.length > 0) {
            const errorMessages = result.errors.map(e => e.message).join(', ');
            throw new Error(`GraphQL errors: ${errorMessages}`);
          }
          
          return result;
        } else {
          // Direct JSON response
          const result = JSON.parse(fileContent);
          
          // Check for GraphQL errors
          if (result.errors && result.errors.length > 0) {
            const errorMessages = result.errors.map(e => e.message).join(', ');
            throw new Error(`GraphQL errors: ${errorMessages}`);
          }
          
          return result;
        }
      } catch (parseErr) {
        logger.error('Failed to parse streamed file output', {
          error: parseErr.message,
          file: options.outputFile
        });
        throw new Error(`JSON parse error from file: ${parseErr.message}`);
      }
    } else {
      // Original in-memory processing
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
    }

  } catch (err) {
    // Filter out beta warnings from error message and stderr
    const cleanErrorMessage = err.message ? err.message.replace(/Warning: This command is currently in beta.*?\n/g, '') : err.message;
    const filteredStderr = err.stderr && !err.stderr.includes('Warning') ? err.stderr : '';
    
    logger.error('GraphQL CLI execution failed', {
      error: cleanErrorMessage,
      username,
      cursor,
      command: cmd,
      stdout: err.stdout,
      ...(filteredStderr && { stderr: filteredStderr })
    });
    
    // Create clean error to throw
    const cleanError = new Error(cleanErrorMessage);
    cleanError.stdout = err.stdout;
    cleanError.stderr = filteredStderr;
    throw cleanError;
  }
}

/**
 * Executes GraphQL query with streaming to temporary file for better performance
 * This is optimized for large data sets
 */
async function executeGraphQLQueryStreaming(query, username, cursor = null) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `graphql-response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.json`);
  
  try {
    // Execute with streaming to temp file
    const result = await executeGraphQLQuery(query, username, cursor, {
      outputFile: tmpFile,
      includeHeaders: false // We only need the JSON body
    });
    
    return result;
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch (cleanupErr) {
      logger.warn('Failed to clean up temp file', { file: tmpFile, error: cleanupErr.message });
    }
  }
}

/**
 * Fetch all records for an object using pagination
 */
async function fetchAllRecords(objectName, fields, username, options = {}) {
  const { 
    pageSize = 1000, 
    maxRecords = null,
    onProgress = null,
    filter = null 
  } = options;
  
  const allRecords = [];
  let hasNextPage = true;
  let cursor = null;
  let pageNumber = 0;
  
  // Filter out problematic relationship fields before building query
  const safeFields = fields.filter(field => {
    // Skip fields that are likely to cause GraphQL errors
    if (field.includes('.') && field.includes('__c.')) {
      logger.warn(`Filtering out relationship field ${field} to prevent GraphQL errors`);
      return false;
    }
    return true;
  });
  
  const query = buildGraphQLQuery(objectName, safeFields, pageSize, filter);
  
  while (hasNextPage) {
    try {
      // Use streaming for better performance with large datasets
      const useStreaming = options.useStreaming !== false; // Default to true
      const result = useStreaming 
        ? await executeGraphQLQueryStreaming(query, username, cursor)
        : await executeGraphQLQuery(query, username, cursor);
      
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
  executeGraphQLQueryStreaming,
  buildGraphQLQuery,
  fetchAllRecords,
  injectAfterCursor,
  escapeGraphQLForCLI
};