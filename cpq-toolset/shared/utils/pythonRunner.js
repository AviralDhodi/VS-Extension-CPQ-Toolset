const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');
const { getInstance: getPathResolver } = require('./pathResolver');
const { logger } = require('./logger');

class PythonRunner {
  constructor() {
    this.pathResolver = getPathResolver();
    this.pythonPath = this.detectPython();
    this.isInitialized = false;
  }

  /**
   * Detect Python installation - check VS Code setting first, then embedded Python, then system Python
   */
  detectPython() {
    const os = require('os');
    const platform = os.platform();
    
    // Check VS Code setting first
    try {
      const vscode = require('vscode');
      const configuredPath = vscode.workspace.getConfiguration('cpq-toolset').get('pythonPath');
      if (configuredPath && fs.existsSync(configuredPath)) {
        const { execSync } = require('child_process');
        const version = execSync(`"${configuredPath}" --version`, { encoding: 'utf8' }).trim();
        logger.info(`Using configured Python: ${configuredPath} (${version})`);
        return configuredPath;
      }
    } catch (error) {
      // Not running in VS Code context or setting not available
    }
    
    // Check for embedded Python on Windows first
    if (platform === 'win32') {
      try {
        // Look for embedded Python in the py directory relative to extension root
        const embeddedPythonPath = path.join(this.pathResolver.extensionRoot, 'py', 'python.exe');
        logger.info(`Checking for embedded Python at: ${embeddedPythonPath}`);
        
        if (fs.existsSync(embeddedPythonPath)) {
          const { execSync } = require('child_process');
          const version = execSync(`"${embeddedPythonPath}" --version`, { encoding: 'utf8' }).trim();
          logger.info(`Found embedded Python: ${embeddedPythonPath} (${version})`);
          return embeddedPythonPath;
        } else {
          logger.warn(`Embedded Python not found at: ${embeddedPythonPath}`);
        }
      } catch (error) {
        logger.warn('Failed to check embedded Python:', error.message);
      }
    }
    
    // Fall back to system Python
    const pythonCommands = platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python', 'py'];
    
    for (const cmd of pythonCommands) {
      try {
        const { execSync } = require('child_process');
        const version = execSync(`${cmd} --version`, { encoding: 'utf8' }).trim();
        logger.info(`Found system Python: ${cmd} (${version})`);
        return cmd;
      } catch (error) {
        // Continue to next command
      }
    }
    
    logger.error('Python not found in PATH or as embedded installation');
    throw new Error('Python is required but not found. Please install Python 3.8 or higher.');
  }

  /**
   * Initialize Python environment
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Check Python version using direct command
      const { execSync } = require('child_process');
      // Properly quote the Python path if it contains spaces
      const pythonCmd = this.pythonPath.includes(' ') && process.platform === 'win32'
        ? `"${this.pythonPath}"`
        : this.pythonPath;
      const versionCmd = `${pythonCmd} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"`
      const versionCheck = execSync(versionCmd, { 
        encoding: 'utf8',
        shell: process.platform === 'win32' // Use shell on Windows to handle quoted paths
      }).trim();

      const [major, minor] = versionCheck.split('.').map(Number);
      if (major < 3 || (major === 3 && minor < 8)) {
        throw new Error(`Python 3.8+ required, found ${versionCheck}`);
      }

      logger.info(`Python environment initialized: ${versionCheck}`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize Python environment:', error);
      throw error;
    }
  }

  /**
   * Check if required Python packages are installed
   */
  async checkDependencies() {
    const requiredPackages = ['pandas', 'numpy', 'pyarrow', 'openpyxl', 'dask', 'lxml'];
    const missingPackages = [];

    for (const pkg of requiredPackages) {
      try {
        await this.runScript(`import ${pkg}`, [], { mode: 'text' });
      } catch (error) {
        missingPackages.push(pkg);
      }
    }

    if (missingPackages.length > 0) {
      logger.warn(`Missing Python packages: ${missingPackages.join(', ')}`);
      return { 
        installed: false, 
        missing: missingPackages,
        command: `${this.pythonPath} -m pip install ${missingPackages.join(' ')}`
      };
    }

    return { installed: true, missing: [] };
  }

  /**
   * Install Python dependencies
   */
  async installDependencies() {
    logger.info('Installing Python dependencies...');
    
    // First check if pip is available
    try {
      await this.runCommand(['-m', 'pip', '--version']);
    } catch (error) {
      logger.error('Pip is not installed!');
      
      // For embedded Python on Windows, provide instructions
      if (this.pythonPath.includes('py\\python.exe') || this.pythonPath.includes('py/python.exe')) {
        throw new Error(
          'Pip is not installed in embedded Python.\n' +
          'Please run install-dependencies.bat from the py directory to install pip and required packages.'
        );
      }
      throw new Error('Pip is required but not found. Please install pip first.');
    }
    
    const requirementsPath = this.pathResolver.getSharedModule('python', 'requirements.txt');
    
    if (fs.existsSync(requirementsPath)) {
      // Install from requirements file
      await this.runCommand(['-m', 'pip', 'install', '-r', requirementsPath]);
    } else {
      // Install essential packages
      const packages = ['pandas>=1.5.0', 'numpy>=1.21.0', 'pyarrow>=10.0.0', 'openpyxl>=3.0.0', 'dask>=2023.1.0', 'lxml>=4.9.0'];
      await this.runCommand(['-m', 'pip', 'install', ...packages]);
    }
    
    logger.info('Python dependencies installed successfully');
  }

  /**
   * Run a Python script file
   */
  async runScriptFile(scriptPath, args = [], options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      const defaultOptions = {
        mode: 'json',
        pythonPath: this.pythonPath,
        pythonOptions: ['-u'], // Unbuffered output
        scriptPath: path.dirname(scriptPath),
        args: args,
        // Handle Windows paths with spaces
        ...(process.platform === 'win32' && this.pythonPath.includes(' ') ? { shell: true } : {})
      };

      const pyshell = new PythonShell(path.basename(scriptPath), {
        ...defaultOptions,
        ...options
      });

      let result = null;
      const output = [];
      const errors = [];

      pyshell.on('message', (message) => {
        output.push(message);
        if (options.mode === 'json') {
          result = message;
        }
      });

      pyshell.on('stderr', (stderr) => {
        errors.push(stderr);
        logger.warn(`Python stderr: ${stderr}`);
      });

      pyshell.on('error', (err) => {
        logger.error('Python error:', err);
      });

      pyshell.end((err, code, signal) => {
        if (options.mode === 'exit_code') {
          // For exit_code mode, we want to return the exit code and stderr
          resolve({
            exitCode: code || 0,
            stdout: output.join('\n'),
            stderr: errors.join('\n')
          });
        } else if (err) {
          reject(err);
        } else {
          if (options.mode === 'text') {
            resolve(output.join('\n'));
          } else {
            resolve(result || output);
          }
        }
      });
    });
  }

  /**
   * Run inline Python code
   */
  async runScript(code, args = [], options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      PythonShell.runString(code, {
        mode: options.mode || 'text',
        pythonPath: this.pythonPath,
        args: args,
        // Handle Windows paths with spaces
        ...(process.platform === 'win32' && this.pythonPath.includes(' ') ? { shell: true } : {})
      }, (err, results) => {
        if (err) {
          reject(err);
        } else {
          resolve(options.mode === 'text' ? results.join('\n') : results);
        }
      });
    });
  }

  /**
   * Run Python command directly
   */
  async runCommand(args) {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      // Handle paths with spaces on Windows
      const pythonPath = this.pythonPath.includes(' ') && process.platform === 'win32' 
        ? `"${this.pythonPath}"`
        : this.pythonPath;
      
      const process = spawn(pythonPath, args, {
        shell: process.platform === 'win32' // Use shell on Windows to handle quoted paths
      });
      
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });

      process.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Run multi-org comparison
   */
  async runMultiOrgComparison(comparisonId, configPath, outputPath, progressCallback) {
    const scriptPath = this.pathResolver.getPythonScript('data-comparison', 'multi_org_comparison.py');
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error('Multi-org comparison script not found');
    }

    logger.info(`Running multi-org comparison: ${comparisonId}`);

    // Set up progress monitoring
    const progressFile = path.join(path.dirname(outputPath), `${comparisonId}_progress.json`);
    let progressInterval = null;

    if (progressCallback) {
      progressInterval = setInterval(() => {
        try {
          if (fs.existsSync(progressFile)) {
            const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
            progressCallback(progress);
          }
        } catch (error) {
          // Ignore errors reading progress file
        }
      }, 1000);
    }

    try {
      // The Python script expects base_path (data directory) as main argument
      const dataDir = this.pathResolver.getStoragePath('data-comparison', 'data-extract', comparisonId);
      
      // Create output directory
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Call Python script with base_path as positional argument
      const result = await this.runScriptFile(scriptPath, [
        dataDir,  // base_path - main positional argument
        '--output-dir', outputDir,
        '--chunk-size', '50000'
      ], { mode: 'text' });  // Use text mode since the script doesn't output JSON

      if (progressInterval) {
        clearInterval(progressInterval);
      }

      // Clean up progress file
      if (fs.existsSync(progressFile)) {
        fs.unlinkSync(progressFile);
      }

      logger.info(`Multi-org comparison completed: ${comparisonId}`);
      return result;
    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      logger.error(`Multi-org comparison failed: ${comparisonId}`, error);
      throw error;
    }
  }

  /**
   * Convert data to Parquet format
   */
  async convertToParquet(inputPath, outputPath) {
    const code = `
import pandas as pd
import pyarrow.parquet as pq
import json
import sys

input_path = sys.argv[1]
output_path = sys.argv[2]

# Read JSONL file
data = []
with open(input_path, 'r') as f:
    for line in f:
        if line.strip():
            data.append(json.loads(line))

# Convert to DataFrame
df = pd.DataFrame(data)

# Write to Parquet
pq.write_table(pd.DataFrame(df).to_arrow(), output_path, compression='snappy')

print(json.dumps({
    'success': True,
    'rows': len(df),
    'columns': list(df.columns),
    'output': output_path
}))
`;

    return await this.runScript(code, [inputPath, outputPath], { mode: 'json' });
  }
}

// Singleton instance
let instance = null;

module.exports = {
  PythonRunner,
  getInstance: () => {
    if (!instance) {
      instance = new PythonRunner();
    }
    return instance;
  }
};