// apps/data-comparison/components/modules/sfdxRunner/index.js

const { exec } = require('child_process');
const { promisify } = require('util');
let vscode;
try {
    vscode = require('vscode');
} catch (error) {
    vscode = null;
}
const { createLogger } = require('../../../../../shared/utils/logger');

const execAsync = promisify(exec);

/**
 * SFDX CLI Error Class
 */
class SFDXError extends Error {
    constructor(message, command, stderr, exitCode) {
        super(message);
        this.name = 'SFDXError';
        this.command = command;
        this.stderr = stderr;
        this.exitCode = exitCode;
    }
}

/**
 * Simple SFDX CLI Runner
 * Auto-detects SF CLI path or uses VS Code setting
 */
class SFDXRunner {
    constructor(options = {}) {
        this.logger = options.logger || createLogger({ 
            appName: 'SFDXRunner',
            location: 'sfdxRunner/index.js'
        });
        
        this.defaultMaxBuffer = 50 * 1024 * 1024; // 50MB
        this.sfdxPath = null;
        this.isInitialized = false;
    }

    /**
     * Auto-detect SFDX/SF CLI path
     */
    async detectSFPath() {
        this.logger.info('🔍 Auto-detecting Salesforce CLI path...');
        
        // Try different detection commands based on platform
        const commands = process.platform === 'win32' 
            ? ['where sf', 'where sfdx', 'where sf.exe', 'where sfdx.exe'] 
            : ['which sf', 'which sfdx', 'command -v sf', 'command -v sfdx'];
        
        for (const cmd of commands) {
            try {
                this.logger.debug('Trying detection command', { command: cmd });
                const { stdout } = await execAsync(cmd, { 
                    maxBuffer: this.defaultMaxBuffer,
                    encoding: 'utf8',
                    timeout: 5000 // 5 second timeout
                });
                
                const path = stdout.trim().split('\n')[0]; // Take first result
                if (path && path.length > 0) {
                    this.logger.info('✅ SF CLI auto-detected', { path, command: cmd });
                    return path;
                }
            } catch (error) {
                this.logger.debug('Detection command failed', { 
                    command: cmd, 
                    error: error.message 
                });
                continue;
            }
        }
        
        this.logger.warn('❌ Auto-detection failed');
        return null;
    }

    /**
     * Get SFDX path from VS Code settings
     */
   getVSCodeSetting() {
        // Skip if vscode not available (server environment)
        if (!vscode) {
            this.logger.debug('VS Code not available - skipping settings check');
            return null;
        }
        
        try {
            const config = vscode.workspace.getConfiguration('cpq-toolset');
            const sfdxPath = config.get('salesforceCliPath');
            
            if (sfdxPath && sfdxPath.trim() !== '') {
                this.logger.info('Using SF CLI path from VS Code settings', { path: sfdxPath });
                return sfdxPath.trim();
            }
            
            this.logger.debug('No Salesforce CLI path configured in VS Code settings');
            return null;
        } catch (error) {
            this.logger.error('Failed to read VS Code settings', { error: error.message });
            return null;
        }
    }

    /**
     * Try common installation paths as final fallback
     */
    async tryCommonPaths() {
        this.logger.info('🔍 Trying common installation paths...');
        
        const commonPaths = process.platform === 'win32' 
            ? [
                'C:\\Program Files\\Salesforce CLI\\bin\\sf.exe',
                'C:\\Program Files\\Salesforce CLI\\bin\\sfdx.exe',
                'sf.exe', 
                'sfdx.exe'
              ]
            : [
                '/usr/local/bin/sf',
                '/usr/local/bin/sfdx',
                '/opt/homebrew/bin/sf',
                '/opt/homebrew/bin/sfdx',
                'sf',
                'sfdx'
              ];
        
        for (const path of commonPaths) {
            try {
                this.logger.debug('Testing common path', { path });
                await execAsync(`"${path}" --version`, { 
                    maxBuffer: this.defaultMaxBuffer,
                    timeout: 5000
                });
                this.logger.info('✅ SF CLI found at common path', { path });
                return path;
            } catch (error) {
                continue;
            }
        }
        
        this.logger.error('❌ No SF CLI found in common paths');
        return null;
    }

    /**
     * Initialize and find SFDX CLI path
     */
    async initialize() {
        if (this.isInitialized && this.sfdxPath) {
            return this.sfdxPath;
        }

        this.logger.info('🚀 Initializing SFDX CLI Runner...');

        // Step 1: Try auto-detection
        this.sfdxPath = await this.detectSFPath();
        
        // Step 2: Try VS Code settings
        if (!this.sfdxPath) {
            this.sfdxPath = this.getVSCodeSetting();
        }
        
        // Step 3: Try common paths
        if (!this.sfdxPath) {
            this.sfdxPath = await this.tryCommonPaths();
        }
        
        // Step 4: Give up and throw error
        if (!this.sfdxPath) {
            const errorMessage = `
❌ Salesforce CLI not found!

Please either:
1. Install Salesforce CLI: https://developer.salesforce.com/tools/cli
2. Set the CLI path in VS Code settings:
   - Open VS Code Settings (Ctrl+,)
   - Search for "cpq-toolset.salesforceCliPath"
   - Set the full path to your sf/sfdx executable

Examples:
- Windows: C:\\Program Files\\Salesforce CLI\\bin\\sf.exe
- macOS: /usr/local/bin/sf
- Linux: /usr/local/bin/sf
            `.trim();
            
            this.logger.error(errorMessage);
            throw new Error(errorMessage);
        }

        // Verify the path works
        try {
            await this.testCLI();
            this.isInitialized = true;
            this.logger.info('🎉 SFDX CLI Runner initialized successfully', { path: this.sfdxPath });
            return this.sfdxPath;
        } catch (error) {
            this.logger.error('❌ SF CLI path verification failed', { 
                path: this.sfdxPath, 
                error: error.message 
            });
            throw new Error(`Salesforce CLI found but not working: ${error.message}`);
        }
    }

    /**
     * Test if CLI is working
     */
    async testCLI() {
        const command = `"${this.sfdxPath}" --version`;
        const { stdout } = await execAsync(command, { 
            maxBuffer: this.defaultMaxBuffer,
            timeout: 10000
        });
        
        this.logger.debug('CLI test successful', { version: stdout.trim() });
        return stdout.trim();
    }

    /**
     * Execute a CLI command
     */
    async run(command, options = {}) {
        await this.initialize();
        
        // Build full command
        const fullCommand = command.startsWith('sfdx') || command.startsWith('sf')
            ? command.replace(/^(sfdx|sf)/, `"${this.sfdxPath}"`)
            : `"${this.sfdxPath}" ${command}`;
        
        this.logger.info('🔄 Executing SF command', { 
            command: fullCommand.length > 100 ? fullCommand.substring(0, 100) + '...' : fullCommand 
        });
        
        try {
            const execOptions = {
                encoding: 'utf8',
                maxBuffer: options.maxBuffer || this.defaultMaxBuffer,
                timeout: options.timeout || 120000, // 2 minutes default
                env: {
                    ...process.env,
                    SF_DISABLE_TELEMETRY: 'true',
                    SF_CONFIG_DIR: process.env.SF_CONFIG_DIR || `${process.env.HOME}/.sf`
                },
                cwd: options.cwd || process.env.HOME,
                ...options
            };

            const { stdout, stderr } = await execAsync(fullCommand, execOptions);

            if (stderr && stderr.trim()) {
                this.logger.warn('Command stderr output', { 
                    command: fullCommand.substring(0, 50) + '...', 
                    stderr: stderr.trim() 
                });
            }

            const result = stdout.trim();
            this.logger.debug('✅ Command completed', { 
                command: fullCommand.substring(0, 50) + '...',
                outputLength: result.length 
            });

            return result;
            
        } catch (error) {
            this.logger.error('❌ Command execution failed', { 
                command: fullCommand.substring(0, 50) + '...',
                error: error.message,
                stderr: error.stderr,
                exitCode: error.code
            });
            
            throw new SFDXError(
                `SF command failed: ${error.message}`,
                fullCommand,
                error.stderr,
                error.code
            );
        }
    }

    /**
     * Execute command and parse JSON output
     */
    async runWithJson(command) {
        // Auto-add --json flag if not present
        let finalCommand = command;
        if (!command.includes('--json') && !command.includes('-j')) {
            finalCommand = `${command} --json`;
        }

        const output = await this.run(finalCommand);
        
        try {
            const result = JSON.parse(output);
            this.logger.debug('✅ JSON parsing successful', { 
                command: finalCommand.substring(0, 50) + '...',
                hasResult: !!result
            });
            return result;
        } catch (parseError) {
            this.logger.error('❌ JSON parse failed', {
                command: finalCommand.substring(0, 50) + '...',
                parseError: parseError.message,
                rawOutput: output.substring(0, 200) + '...'
            });
            throw new Error(`Failed to parse SF output as JSON: ${parseError.message}`);
        }
    }

    /**
     * Build command with parameters
     */
    buildCommand(baseCommand, params = {}) {
        let command = baseCommand;
        
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (typeof value === 'boolean') {
                    if (value) command += ` --${key}`;
                } else {
                    command += ` --${key} ${value}`;
                }
            }
        });

        return command;
    }

    /**
     * Get current CLI path
     */
    getCliPath() {
        return this.sfdxPath;
    }

    /**
     * Check if runner is initialized
     */
    isReady() {
        return this.isInitialized && !!this.sfdxPath;
    }
}

// Singleton instance
let defaultRunner = null;

/**
 * Get default SFDX runner instance
 */
function getDefaultRunner() {
    if (!defaultRunner) {
        defaultRunner = new SFDXRunner();
    }
    return defaultRunner;
}

/**
 * Create new SFDX runner instance
 */
function createRunner(options = {}) {
    return new SFDXRunner(options);
}

module.exports = {
    SFDXRunner,
    SFDXError,
    getDefaultRunner,
    createRunner
};