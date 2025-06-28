const { execSync } = require('child_process');
const { createLogger } = require('./logger');
const os = require('os');

const logger = createLogger({ appName: 'GraphQL', location: 'graphqlRunner' });

/**
 * Escapes a GraphQL query for inline CLI use, platform-specific.
 * Falls back to stdin-compatible piping if needed.
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
 * Executes GraphQL query via CLI, cross-platform compatible
 */
function executeGraphQLQuery(query, username, cursor) {
    try {
        const finalQuery = injectAfterCursor(query, cursor);
        const escapedQuery = escapeGraphQLForCLI(finalQuery);
        const cmd = `sf api request graphql --target-org ${username} --body "${escapedQuery}"`;
        
        logger.debug('Executing GraphQL query', { 
            cmd: cmd.length > 200 ? cmd.substring(0, 200) + '...' : cmd 
        });
        
        const output = execSync(cmd, { encoding: 'utf8' });
        
        if (!output || output.trim() === '') {
            throw new Error(`Empty CLI response. Command was:\n${cmd}`);
        }

        try {
            return JSON.parse(output);
        } catch (parseErr) {
            logger.error('Failed to parse CLI JSON output', {
                parseError: parseErr.message,
                rawOutput: output.substring(0, 500) + '...',
                command: cmd
            });
            throw new Error(`JSON parse error: ${parseErr.message}`);
        }

    } catch (err) {
        logger.error('GraphQL CLI execution failed', { error: err.message });
        throw err;
    }
}

class GraphQLRunner {
    constructor(sfdxRunner, logger = null) {
        this.sfdxRunner = sfdxRunner;
        this.logger = logger || createLogger({ appName: 'GraphQL', location: 'GraphQLRunner' });
    }

    async executeQuery(query, username, cursor = null) {
        try {
            const finalQuery = injectAfterCursor(query, cursor);
            const command = `api request graphql --target-org ${username} --body "${escapeGraphQLForCLI(finalQuery)}"`;
            
            this.logger.debug('Executing GraphQL query via SFDX runner', {
                queryLength: finalQuery.length,
                username,
                hasCursor: !!cursor
            });

            const result = await this.sfdxRunner.runWithJsonOutput(command);
            return result;
        } catch (error) {
            this.logger.error('GraphQL query execution failed', {
                error: error.message,
                username,
                queryLength: query.length
            });
            throw error;
        }
    }

    async executeQueryWithPagination(query, username, pageHandler) {
        let cursor = null;
        let hasNextPage = true;
        let totalRecords = 0;

        while (hasNextPage) {
            const result = await this.executeQuery(query, username, cursor);
            
            if (result.data) {
                // Find the first object in the data that has edges
                const objectKey = Object.keys(result.data)[0];
                const objectData = result.data[objectKey];
                
                if (objectData && objectData.edges) {
                    totalRecords += objectData.edges.length;
                    
                    if (pageHandler) {
                        await pageHandler(objectData.edges, totalRecords);
                    }
                    
                    // Check for next page
                    if (objectData.pageInfo && objectData.pageInfo.hasNextPage) {
                        cursor = objectData.pageInfo.endCursor;
                    } else {
                        hasNextPage = false;
                    }
                } else {
                    hasNextPage = false;
                }
            } else {
                hasNextPage = false;
            }
        }

        this.logger.info('GraphQL pagination completed', {
            totalRecords,
            username
        });

        return totalRecords;
    }
}

module.exports = {
    executeGraphQLQuery,
    injectAfterCursor,
    escapeGraphQLForCLI,
    GraphQLRunner
};