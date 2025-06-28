const { exec } = require('child_process');
const { promisify } = require('util');
const { defaultLogger } = require('./logger');

const execAsync = promisify(exec);

class SFDXError extends Error {
    constructor(message, command, stderr, exitCode) {
        super(message);
        this.name = 'SFDXError';
        this.command = command;
        this.stderr = stderr;
        this.exitCode = exitCode;
    }
}

class SFDXRunner {
    constructor(logger = defaultLogger) {
        this.logger = logger;
        this.defaultMaxBuffer = 50 * 1024 * 1024; // Increased to 50MB
        this.sfdxPath = null;
    }

    async findSFDXPath() {
        if (this.sfdxPath) return this.sfdxPath;
        
        // Check env variable first (set by VS Code extension)
        if (process.env.SFDX_PATH) {
            this.logger.info('Using SFDX path from environment', { path: process.env.SFDX_PATH });
            this.sfdxPath = process.env.SFDX_PATH;
            return this.sfdxPath;
        }
        
        // Auto-detect - try multiple commands without timeout
        const commands = process.platform === 'win32' 
            ? ['where sf', 'where sfdx', 'where sf.exe', 'where sfdx.exe'] 
            : ['which sf', 'which sfdx', 'command -v sf', 'command -v sfdx'];
        
        for (const cmd of commands) {
            try {
                this.logger.debug('Trying SFDX detection command', { command: cmd });
                const { stdout } = await execAsync(cmd, { 
                    maxBuffer: this.defaultMaxBuffer,
                    encoding: 'utf8'
                });
                
                const path = stdout.trim().split('\n')[0]; // Take first result
                if (path && path.length > 0) {
                    this.logger.info('SFDX CLI found', { path, command: cmd });
                    this.sfdxPath = path;
                    return this.sfdxPath;
                }
            } catch (error) {
                this.logger.debug('SFDX detection failed for command', { 
                    command: cmd, 
                    error: error.message 
                });
                continue;
            }
        }
        
        // Try common installation paths as fallback
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
                this.logger.debug('Trying common SFDX path', { path });
                await execAsync(`"${path}" --version`, { 
                    maxBuffer: this.defaultMaxBuffer 
                });
                this.logger.info('SFDX CLI found at common path', { path });
                this.sfdxPath = path;
                return this.sfdxPath;
            } catch (error) {
                continue;
            }
        }
        
        throw new Error('SFDX CLI not found. Please install Salesforce CLI or set cpq-toolset.sfdxPath in VS Code settings.');
    }

    async run(command, options = {}) {
        const sfdxPath = await this.findSFDXPath();
        const fullCommand = command.startsWith('sfdx') || command.startsWith('sf')
            ? command.replace(/^(sfdx|sf)/, `"${sfdxPath}"`)
            : `"${sfdxPath}" ${command}`;
        
        this.logger.info('Executing SFDX command', { command: fullCommand });
        
        try {
            const execOptions = {
                encoding: 'utf8',
                maxBuffer: options.maxBuffer || this.defaultMaxBuffer,
                env: {
                    ...process.env,
                    PATH: process.env.PATH,
                    HOME: process.env.HOME,
                    SF_CONFIG_DIR: process.env.SF_CONFIG_DIR || `${process.env.HOME}/.sf`,
                    SF_DISABLE_TELEMETRY: 'true'
                },
                cwd: options.cwd || process.env.HOME,
                ...options
            };

            // Remove timeout from options if present
            delete execOptions.timeout;

            const { stdout, stderr } = await execAsync(fullCommand, execOptions);

            if (stderr && stderr.trim()) {
                this.logger.warn('SFDX command stderr output', { 
                    command: fullCommand, 
                    stderr: stderr.trim() 
                });
            }

            const result = stdout.trim();
            this.logger.debug('SFDX command completed', { 
                command: fullCommand,
                outputLength: result.length 
            });

            return result;
            
        } catch (error) {
            this.logger.error('SFDX command execution failed', { 
                command: fullCommand,
                error: error.message,
                stderr: error.stderr,
                exitCode: error.code
            });
            
            throw new SFDXError(
                `SFDX command failed: ${error.message}`,
                fullCommand,
                error.stderr,
                error.code
            );
        }
    }

    async runWithJsonOutput(command) {
        // Auto-add --json flag if not present
        let finalCommand = command;
        if (!command.includes('--json') && !command.includes('-j')) {
            finalCommand = `${command} --json`;
        }

        const sfdxPath = await this.findSFDXPath();
        const fullCommand = `"${sfdxPath}" ${finalCommand}`;

        this.logger.debug('Executing SFDX command', {
            command: fullCommand.length > 100 ? fullCommand.substring(0, 100) + '...' : fullCommand
        });

        return new Promise((resolve, reject) => {
            exec(fullCommand, { 
                timeout: 120000,
                maxBuffer: 10 * 1024 * 1024
            }, (error, stdout, stderr) => {
                
                if (error) {
                    this.logger.error('SFDX command failed', {
                        command: fullCommand,
                        error: error.message,
                        exitCode: error.code
                    });
                    reject(error);
                    return;
                }

                if (stderr && !stdout) {
                    this.logger.error('SFDX stderr without stdout', {
                        command: fullCommand,
                        stderr: stderr
                    });
                    reject(new Error(`SFDX Error: ${stderr}`));
                    return;
                }

                try {
                    const result = JSON.parse(stdout);
                    
                    this.logger.debug('SFDX command completed', {
                        command: fullCommand.substring(0, 50) + '...',
                        hasResult: !!result,
                        resultType: typeof result
                    });

                    resolve(result);
                } catch (parseError) {
                    this.logger.error('JSON parse failed', {
                        command: fullCommand,
                        parseError: parseError.message,
                        rawOutput: stdout.substring(0, 200) + '...'
                    });
                    reject(new Error(`Failed to parse SFDX output: ${parseError.message}`));
                }
            });
        });
    }

    async checkSFDXInstallation() {
        try {
            const output = await this.run('--version');
            this.logger.info('SFDX CLI detected', { version: output });
            return true;
        } catch (error) {
            this.logger.error('SFDX CLI not found or not working', { error: error.message });
            return false;
        }
    }

    async runBatch(commands, options = {}) {
        const results = [];
        const { parallel = false, continueOnError = false } = options;

        if (parallel) {
            // Run commands in parallel
            const promises = commands.map(async (cmd, index) => {
                try {
                    const result = await this.run(cmd.command, cmd.options);
                    return { index, success: true, result, command: cmd.command };
                } catch (error) {
                    if (!continueOnError) throw error;
                    return { index, success: false, error, command: cmd.command };
                }
            });

            const batchResults = await Promise.allSettled(promises);
            return batchResults.map(result => 
                result.status === 'fulfilled' ? result.value : result.reason
            );
        } else {
            // Run commands sequentially
            for (const cmd of commands) {
                try {
                    const result = await this.run(cmd.command, cmd.options);
                    results.push({ success: true, result, command: cmd.command });
                } catch (error) {
                    if (!continueOnError) throw error;
                    results.push({ success: false, error, command: cmd.command });
                }
            }
            return results;
        }
    }

    // Helper method for common command patterns
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
}

// Singleton instance
let runnerInstance = null;

function getSFDXRunner(logger = defaultLogger) {
    if (!runnerInstance) {
        runnerInstance = new SFDXRunner(logger);
    }
    return runnerInstance;
}

module.exports = {
    SFDXRunner,
    SFDXError,
    getSFDXRunner
};