const { execSync } = require('child_process');
const { createLogger } = require('../../../shared/logging/logger');
const logger = createLogger({ appName: 'GraphQL' });
const os = require('os');
console.log('🔥 graphql_cli_runner.js executing from:', __filename);


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
    /*logger.info('🔄 Received Query :', {
            query,
            cursor
        });*/
    const finalQuery = injectAfterCursor(query, cursor);
    /*logger.info('🔄 After Inject Query :', {
            finalQuery
        });*/
    const escapedQuery = escapeGraphQLForCLI(finalQuery);
   /* logger.info('🔄 After Escape Query :', {
            escapedQuery
        });*/
    const cmd = `sf api request graphql --target-org ${username} --body "${escapedQuery}"`;
    logger.info('🔄 Full cmd:', {
            cmd
        });
    const output = execSync(cmd, { encoding: 'utf8' });
    /*logger.info('🔄 Raw Output :', {
            output
        });*/
    if (!output || output.trim() === '') {
      throw new Error(`Empty CLI response. Command was:\n${cmd}`);
    }

    try {
      return JSON.parse(output);
    } catch (parseErr) {
      console.error('❌ Failed to parse CLI JSON output.\n');
      console.error('🔹 Raw Output:\n', output);
      console.error('🔹 CLI Command:\n', cmd);
      throw new Error(`JSON parse error: ${parseErr.message}`);
    }

  } catch (err) {
    console.error('GraphQL CLI execution failed:', err.message);
    throw err;
  }
}


module.exports = {
  executeGraphQLQuery,
  injectAfterCursor,
  escapeGraphQLForCLI
};
