const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const { createLogger } = require('./logger');

const execAsync = promisify(exec);
const logger = createLogger({ appName: 'PythonRunner', location: 'pythonRunner' });

class PythonRunner {
    constructor() {
        this.pythonPath = null;
        this.logger = logger;
        this.requirementsPath = path.join(__dirname, '../modules/python/requirements.txt');
    }

    async findPythonPath() {
        if (this.pythonPath) return this.pythonPath;

        // Try different Python commands
        const commands = process.platform === 'win32' 
            ? ['python', 'python3', 'py', 'py -3'] 
            : ['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3'];

        for (const cmd of commands) {
            try {
                const { stdout } = await execAsync(`${cmd} --version`);
                if (stdout.includes('Python 3.')) {
                    this.logger.info('Python found', { command: cmd, version: stdout.trim() });
                    this.pythonPath = cmd;
                    return this.pythonPath;
                }
            } catch (error) {
                continue;
            }
        }

        throw new Error('Python 3 not found. Please install Python 3.8+ and ensure it is in your PATH.');
    }

    async checkDependencies() {
        try {
            const pythonPath = await this.findPythonPath();
            
            // Check if required packages are installed
            const checkScript = `
import sys
required_packages = ['pandas', 'numpy', 'dask', 'pyarrow', 'openpyxl', 'xlsxwriter']
missing_packages = []

for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        missing_packages.append(package)

if missing_packages:
    print("MISSING:", ",".join(missing_packages))
else:
    print("ALL_INSTALLED")
`;

            const { stdout } = await execAsync(`${pythonPath} -c "${checkScript}"`);
            
            if (stdout.includes('MISSING:')) {
                const missing = stdout.replace('MISSING:', '').trim().split(',');
                this.logger.warn('Missing Python packages', { missing });
                return { installed: false, missing };
            } else {
                this.logger.info('All Python dependencies installed');
                return { installed: true, missing: [] };
            }
        } catch (error) {
            this.logger.error('Failed to check Python dependencies', { error: error.message });
            return { installed: false, missing: [], error: error.message };
        }
    }

    async installDependencies() {
        try {
            const pythonPath = await this.findPythonPath();
            
            this.logger.info('Installing Python dependencies', { requirementsFile: this.requirementsPath });
            
            const command = `${pythonPath} -m pip install -r "${this.requirementsPath}"`;
            const { stdout, stderr } = await execAsync(command, { 
                maxBuffer: 10 * 1024 * 1024,
                timeout: 300000 // 5 minutes
            });

            this.logger.info('Python dependencies installed successfully', { 
                stdout: stdout.substring(0, 500),
                stderr: stderr ? stderr.substring(0, 500) : null
            });

            return true;
        } catch (error) {
            this.logger.error('Failed to install Python dependencies', { 
                error: error.message,
                stderr: error.stderr
            });
            throw error;
        }
    }

    async runScript(scriptPath, args = [], options = {}) {
        try {
            const pythonPath = await this.findPythonPath();
            
            if (!fs.existsSync(scriptPath)) {
                throw new Error(`Python script not found: ${scriptPath}`);
            }

            this.logger.info('Executing Python script', { 
                scriptPath, 
                args: args.length,
                pythonPath 
            });

            const command = [pythonPath, scriptPath, ...args];
            
            return new Promise((resolve, reject) => {
                const child = spawn(command[0], command.slice(1), {
                    stdio: options.captureOutput ? 'pipe' : 'inherit',
                    cwd: options.cwd || process.cwd(),
                    env: {
                        ...process.env,
                        PYTHONPATH: options.pythonPath || process.env.PYTHONPATH,
                        PYTHONUNBUFFERED: '1'
                    }
                });

                let stdout = '';
                let stderr = '';

                if (options.captureOutput) {
                    child.stdout.on('data', (data) => {
                        stdout += data.toString();
                        if (options.onStdout) options.onStdout(data.toString());
                    });

                    child.stderr.on('data', (data) => {
                        stderr += data.toString();
                        if (options.onStderr) options.onStderr(data.toString());
                    });
                }

                child.on('close', (code) => {
                    if (code === 0) {
                        this.logger.info('Python script completed successfully', { 
                            scriptPath, 
                            exitCode: code 
                        });
                        resolve({ 
                            exitCode: code, 
                            stdout: stdout.trim(), 
                            stderr: stderr.trim() 
                        });
                    } else {
                        this.logger.error('Python script failed', { 
                            scriptPath, 
                            exitCode: code, 
                            stderr: stderr.trim() 
                        });
                        reject(new Error(`Python script failed with exit code ${code}: ${stderr}`));
                    }
                });

                child.on('error', (error) => {
                    this.logger.error('Python script execution error', { 
                        scriptPath, 
                        error: error.message 
                    });
                    reject(error);
                });
            });
        } catch (error) {
            this.logger.error('Failed to run Python script', { 
                scriptPath, 
                error: error.message 
            });
            throw error;
        }
    }

    async runMultiOrgComparison(comparisonId, configPath, outputPath) {
        const scriptPath = path.join(__dirname, '../../apps/data-comparison/python/multi_org_comparison.py');
        
        const args = [
            '--base-path', path.dirname(configPath),
            '--config-file', configPath,
            '--output-path', outputPath,
            '--comparison-id', comparisonId
        ];

        this.logger.info('Starting multi-org comparison', { 
            comparisonId, 
            configPath, 
            outputPath 
        });

        const result = await this.runScript(scriptPath, args, {
            captureOutput: true,
            onStdout: (data) => {
                // Log Python output in real-time
                this.logger.info('Python output', { data: data.trim() });
            },
            onStderr: (data) => {
                this.logger.warn('Python stderr', { data: data.trim() });
            }
        });

        return result;
    }
}

// Singleton instance
let pythonRunnerInstance = null;

function getPythonRunner() {
    if (!pythonRunnerInstance) {
        pythonRunnerInstance = new PythonRunner();
    }
    return pythonRunnerInstance;
}

module.exports = {
    PythonRunner,
    getPythonRunner
};