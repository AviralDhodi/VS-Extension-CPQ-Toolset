// CPQ Toolset v3 - VS Code Extension Entry Point (Platform-Specific Build)
const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { soqlToConfigCommand } = require('./soqlToConfig');

let serverProcess = null;
let outputChannel = null;
const SERVER_PORT = 3030;

/**
 * Extension activation
 */
async function activate(context) {
  // Create output channel for server logs and show it automatically
  outputChannel = vscode.window.createOutputChannel('CPQ Toolset');
  outputChannel.show(true); // true = preserve focus on current editor
  
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] CPQ Toolset v3 is activating...`);
  outputChannel.appendLine(`[${timestamp}] Extension Path: ${context.extensionPath}`);
  outputChannel.appendLine(`[${timestamp}] Platform: ${process.platform}`);
  outputChannel.appendLine(`[${timestamp}] VS Code Version: ${vscode.version}`);
  outputChannel.appendLine('============================================================');
  
  console.log('CPQ Toolset v3 is activating...');
  
  // Platform-specific modules are pre-packaged in this build
  outputChannel.appendLine(`[${timestamp}] Platform-specific build - modules pre-packaged`);

  // Register launch command
  const launchCommand = vscode.commands.registerCommand('cpq-toolset.launch', async () => {
    outputChannel.appendLine(`[${new Date().toISOString()}] [COMMAND] Launch command invoked`);
    try {
      await launchCPQToolset(context);
    } catch (error) {
      outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Launch command failed: ${error.message}`);
      vscode.window.showErrorMessage(`Failed to launch CPQ Toolset: ${error.message}`);
    }
  });
  context.subscriptions.push(launchCommand);
  
  // Register stop command
  const stopCommand = vscode.commands.registerCommand('cpq-toolset.stop', async () => {
    outputChannel.appendLine(`[${new Date().toISOString()}] [COMMAND] Stop command invoked`);
    try {
      if (serverProcess) {
        outputChannel.appendLine(`[${new Date().toISOString()}] Stopping server...`);
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        outputChannel.appendLine(`[${new Date().toISOString()}] Server stopped`);
        vscode.window.showInformationMessage('CPQ Toolset server stopped');
      } else {
        outputChannel.appendLine(`[${new Date().toISOString()}] Server is not running`);
        vscode.window.showInformationMessage('CPQ Toolset server is not running');
      }
    } catch (error) {
      outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Failed to stop server: ${error.message}`);
      vscode.window.showErrorMessage(`Failed to stop server: ${error.message}`);
    }
  });
  context.subscriptions.push(stopCommand);
  
  
  // Register show output command
  const showOutputCommand = vscode.commands.registerCommand('cpq-toolset.showOutput', () => {
    outputChannel.appendLine(`[${new Date().toISOString()}] [COMMAND] Show output command invoked`);
    if (outputChannel) {
      outputChannel.show();
    }
  });
  context.subscriptions.push(showOutputCommand);
  
  // Register SOQL to Config command
  const soqlToConfigCmd = vscode.commands.registerCommand('cpq-toolset.soqlToConfig', async () => {
    outputChannel.appendLine(`[${new Date().toISOString()}] [COMMAND] SOQL to Config command invoked`);
    try {
      await soqlToConfigCommand();
    } catch (error) {
      outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] SOQL to Config failed: ${error.message}`);
      vscode.window.showErrorMessage(`Failed to convert SOQL to config: ${error.message}`);
    }
  });
  context.subscriptions.push(soqlToConfigCmd);

  // Add status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = 'CPQ Toolset';
  statusBarItem.tooltip = 'Launch CPQ Toolset';
  statusBarItem.command = 'cpq-toolset.launch';
  statusBarItem.show();
  outputChannel.appendLine(`[${new Date().toISOString()}] Status bar item created and shown`);
  context.subscriptions.push(statusBarItem);

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (outputChannel) {
        outputChannel.appendLine(`[${new Date().toISOString()}] Cleanup: Disposing resources`);
      }
      if (serverProcess) {
        if (outputChannel) {
          outputChannel.appendLine(`[${new Date().toISOString()}] Cleanup: Killing server process`);
        }
        serverProcess.kill('SIGTERM');
        serverProcess = null;
      }
    }
  });

  // Override console.log to also send to output channel
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = (...args) => {
    originalLog(...args);
    if (outputChannel) {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      outputChannel.appendLine(`[${timestamp}] [LOG] ${message}`);
    }
  };
  
  console.error = (...args) => {
    originalError(...args);
    if (outputChannel) {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      outputChannel.appendLine(`[${timestamp}] [ERROR] ${message}`);
    }
  };
  
  console.warn = (...args) => {
    originalWarn(...args);
    if (outputChannel) {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      outputChannel.appendLine(`[${timestamp}] [WARN] ${message}`);
    }
  };

  outputChannel.appendLine(`[${new Date().toISOString()}] CPQ Toolset v3 activated successfully`);
  outputChannel.appendLine('============================================================');
  console.log('CPQ Toolset v3 activated');
}

/**
 * Launch the CPQ Toolset server and open browser
 */
async function launchCPQToolset(context) {
  outputChannel.appendLine('============================================================');
  outputChannel.appendLine(`[${new Date().toISOString()}] Launching CPQ Toolset...`);
  outputChannel.show(true); // Show output channel when launching
  
  try {
    // Always kill existing server process if running
    if (serverProcess && !serverProcess.killed) {
      outputChannel.appendLine(`[${new Date().toISOString()}] Stopping existing server process...`);
      serverProcess.kill('SIGTERM');
      serverProcess = null;
      // Wait a moment for process to clean up
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Start fresh server instance
    outputChannel.appendLine(`[${new Date().toISOString()}] Starting new server instance...`);
    await startServer(context.extensionPath);

    // Open browser
    outputChannel.appendLine(`[${new Date().toISOString()}] Opening browser...`);
    await openBrowser();

    outputChannel.appendLine(`[${new Date().toISOString()}] CPQ Toolset launched successfully!`);
    outputChannel.appendLine('============================================================');
    vscode.window.showInformationMessage('CPQ Toolset launched successfully!');
  } catch (error) {
    outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Launch failed: ${error.message}`);
    console.error('Launch failed:', error);
    throw error;
  }
}

/**
 * Kill any process using the specified port
 */
async function killProcessOnPort(port) {
  const platform = process.platform;
  
  try {
    console.log(`Attempting to clear port ${port} on ${platform}...`);
    if (outputChannel) {
      outputChannel.appendLine(`[${new Date().toISOString()}] Attempting to clear port ${port} on ${platform}...`);
    }
    if (platform === 'win32') {
      // Windows: Use netstat and taskkill
      const { exec } = require('child_process');
      const findCmd = `netstat -ano | findstr :${port}`;
      
      return new Promise((resolve) => {
        // Use cmd.exe explicitly on Windows
        exec(findCmd, { 
          shell: 'cmd.exe',
          windowsHide: true,
          encoding: 'utf8'
        }, (error, stdout) => {
          if (error || !stdout) {
            // No process found on port or command failed
            if (outputChannel && error) {
              outputChannel.appendLine(`[${new Date().toISOString()}] Port check info: ${error.message || 'No process found on port'}`);
            }
            resolve();
            return;
          }
          
          // Parse PIDs from netstat output
          const lines = stdout.trim().split('\n');
          const pids = new Set();
          
          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid)) {
              pids.add(pid);
            }
          });
          
          // Kill each PID
          const killPromises = Array.from(pids).map(pid => 
            new Promise((resolveKill) => {
              exec(`taskkill /F /PID ${pid}`, (killError) => {
                if (!killError) {
                  console.log(`Killed process ${pid} on port ${port}`);
                  if (outputChannel) {
                    outputChannel.appendLine(`[${new Date().toISOString()}] Killed process ${pid} on port ${port}`);
                  }
                }
                resolveKill();
              });
            })
          );
          
          Promise.all(killPromises).then(() => resolve());
        });
      });
    } else if (platform === 'darwin') {
      // macOS: Use lsof
      const { exec } = require('child_process');
      const cmd = `lsof -ti :${port} | xargs kill -9`;
      
      return new Promise((resolve) => {
        exec(cmd, (error) => {
          if (!error) {
            console.log(`Killed process on port ${port}`);
            if (outputChannel) {
              outputChannel.appendLine(`[${new Date().toISOString()}] Killed process on port ${port}`);
            }
          }
          // Always resolve, even if error (no process found)
          resolve();
        });
      });
    } else {
      // Linux: Use lsof or fuser
      const { exec } = require('child_process');
      
      return new Promise((resolve) => {
        // Try lsof first
        exec(`lsof -ti :${port} | xargs kill -9`, (error) => {
          if (!error) {
            console.log(`Killed process on port ${port} using lsof`);
            if (outputChannel) {
              outputChannel.appendLine(`[${new Date().toISOString()}] Killed process on port ${port} using lsof`);
            }
            resolve();
          } else {
            // Fallback to fuser
            exec(`fuser -k ${port}/tcp`, (fuserError) => {
              if (!fuserError) {
                console.log(`Killed process on port ${port} using fuser`);
                if (outputChannel) {
                  outputChannel.appendLine(`[${new Date().toISOString()}] Killed process on port ${port} using fuser`);
                }
              }
              resolve();
            });
          }
        });
      });
    }
  } catch (error) {
    console.warn(`Failed to kill process on port ${port}:`, error.message);
    if (outputChannel) {
      outputChannel.appendLine(`[${new Date().toISOString()}] [WARN] Could not clear port ${port}: ${error.message}`);
      outputChannel.appendLine(`[${new Date().toISOString()}] The server will attempt to start anyway...`);
    }
    // Don't throw - we want to continue even if kill fails
  }
}

/**
 * Start the Express server
 */
function startServer(extensionPath) {
  return new Promise(async (resolve, reject) => {
    outputChannel.appendLine('--------------------------------------------');
    outputChannel.appendLine(`[${new Date().toISOString()}] Starting server process...`);
    outputChannel.show(true); // Auto-show when starting server
    
    const platform = process.platform;
    const arch = process.arch === 'x64' ? 'x64' : 'x64'; // pkg only supports x64 for now
    
    // Kill port before starting
    try {
      outputChannel.appendLine(`[${new Date().toISOString()}] Checking for existing processes on port ${SERVER_PORT}...`);
      await killProcessOnPort(SERVER_PORT);
      
      // Small delay to ensure port is freed
      await new Promise(res => setTimeout(res, 500));
      outputChannel.appendLine(`[${new Date().toISOString()}] Port cleared successfully`);
    } catch (error) {
      console.warn('Port clearing failed, but continuing:', error);
      outputChannel.appendLine(`[${new Date().toISOString()}] [WARN] Port clearing failed: ${error.message}`);
      outputChannel.appendLine(`[${new Date().toISOString()}] Attempting to start server anyway...`);
    }
    
    // v3.1.16 - Fixed server path resolution
    let serverPath;
    let serverDir;
    let isBundled = false;
    
    // Check for runtime/server.js (packaged extension)
    const runtimeServerPath = path.join(extensionPath, 'runtime', 'server.js');
    const rootServerPath = path.join(extensionPath, 'server.js');
    
    if (fs.existsSync(runtimeServerPath)) {
      // Use runtime server (packaged extension)
      serverPath = runtimeServerPath;
      serverDir = path.join(extensionPath, 'runtime');
      outputChannel.appendLine(`[${new Date().toISOString()}] Using runtime server at: ${serverPath}`);
    } else if (fs.existsSync(rootServerPath)) {
      // Use root server (development mode)
      serverPath = rootServerPath;
      serverDir = extensionPath;
      outputChannel.appendLine(`[${new Date().toISOString()}] Using development server at: ${serverPath}`);
    } else {
      outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Server file not found in runtime or root`);
      reject(new Error('Server file not found'));
      return;
    }
    
    outputChannel.appendLine(`[${new Date().toISOString()}] Starting CPQ Toolset server`);
    outputChannel.appendLine(`[${new Date().toISOString()}] Server directory: ${serverDir}`);
    
    const serverExecutable = getNodeExecutable(extensionPath);
    outputChannel.appendLine(`[${new Date().toISOString()}] Node executable: ${serverExecutable}`);
    
    serverProcess = spawn(serverExecutable, [serverPath], {
      stdio: 'pipe',
      cwd: serverDir, // v3.1.16 - Always use the server's directory as working directory
      env: {
        ...process.env,
        NODE_ENV: 'production',
        EXTENSION_ROOT: extensionPath,
        CPQ_BUNDLED: isBundled ? 'true' : 'false',
        PORT: SERVER_PORT.toString()
      }
    });

    let startupComplete = false;
    let errorBuffer = '';

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        // Format server output with timestamp
        outputChannel.appendLine(`[${new Date().toISOString()}] [SERVER] ${line}`);
      });

      // Look for server ready signal
      if (output.includes('CPQ Toolset v3 running') && !startupComplete) {
        startupComplete = true;
        outputChannel.appendLine(`[${new Date().toISOString()}] [SUCCESS] Server started successfully!`);
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      errorBuffer += error;
      const lines = error.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        // Filter out beta warnings to reduce noise
        if (!line.includes('Warning: This command is currently in beta')) {
          // Format server errors with timestamp
          outputChannel.appendLine(`[${new Date().toISOString()}] [SERVER ERROR] ${line}`);
        }
      });

      // Check for specific errors
      if (error.includes('EADDRINUSE')) {
        if (!startupComplete) {
          outputChannel.appendLine(`[${new Date().toISOString()}] [FATAL] Port ${SERVER_PORT} is already in use`);
          reject(new Error(`Port ${SERVER_PORT} is already in use`));
        }
      } else if (error.includes('MODULE_NOT_FOUND')) {
        if (!startupComplete) {
          outputChannel.appendLine(`[${new Date().toISOString()}] [FATAL] Missing dependencies. Please run npm install.`);
          reject(new Error('Missing dependencies. Please run npm install.'));
        }
      }
    });

    serverProcess.on('close', (code) => {
      outputChannel.appendLine(`[${new Date().toISOString()}] [INFO] Server process exited with code ${code}`);
      serverProcess = null;
      
      if (!startupComplete && code !== 0) {
        outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Server failed to start. Exit code: ${code}`);
        if (errorBuffer) {
          outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Error details: ${errorBuffer}`);
        }
        reject(new Error(`Server failed to start (exit code ${code}): ${errorBuffer}`));
      }
    });

    serverProcess.on('error', (error) => {
      outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Failed to start server: ${error.message}`);
      if (!startupComplete) {
        reject(error);
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!startupComplete) {
        outputChannel.appendLine(`[${new Date().toISOString()}] [ERROR] Server startup timeout (10 seconds)`);
        reject(new Error('Server startup timeout'));
      }
    }, 10000);
  });
}

/**
 * Get Node.js executable path
 */
function getNodeExecutable(extensionPath) {
  // Check VS Code settings for custom Node path
  const config = vscode.workspace.getConfiguration('cpq-toolset');
  const customNodePath = config.get('nodePath');
  
  if (customNodePath && fs.existsSync(customNodePath)) {
    return customNodePath;
  }
  
  // Check for bundled Node.js
  const platform = process.platform;
  let bundledNode = null;
  
  if (platform === 'win32') {
    // Windows bundled Node.js
    bundledNode = path.join(extensionPath, 'NodeJS', 'win', 'node.exe');
    if (!fs.existsSync(bundledNode)) {
      // Try legacy location
      bundledNode = path.join(extensionPath, 'dist', 'node-win64', 'node.exe');
    }
  } else if (platform === 'darwin') {
    // macOS bundled Node.js
    bundledNode = path.join(extensionPath, 'NodeJS', 'mac', 'bin', 'node');
    if (!fs.existsSync(bundledNode)) {
      // Try legacy location
      bundledNode = path.join(extensionPath, 'dist', 'node-darwin', 'node');
    }
  } else if (platform === 'linux') {
    // Linux bundled Node.js
    bundledNode = path.join(extensionPath, 'NodeJS', 'linux', 'bin', 'node');
    if (!fs.existsSync(bundledNode)) {
      // Try legacy location
      bundledNode = path.join(extensionPath, 'dist', 'node-linux', 'node');
    }
  }
  
  if (bundledNode && fs.existsSync(bundledNode)) {
    console.log(`Using bundled Node.js: ${bundledNode}`);
    if (outputChannel) {
      outputChannel.appendLine(`Using bundled Node.js: ${bundledNode}`);
    }
    return bundledNode;
  }
  
  // Default to 'node' in PATH
  return 'node';
}

/**
 * Open browser to the application
 */
async function openBrowser() {
  const url = `http://localhost:${SERVER_PORT}`;
  
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] Opening browser to ${url}`);
  }

  try {
    // Use VS Code's built-in browser opening
    await vscode.env.openExternal(vscode.Uri.parse(url));
    if (outputChannel) {
      outputChannel.appendLine(`[${new Date().toISOString()}] Browser opened successfully`);
    }
  } catch (error) {
    if (outputChannel) {
      outputChannel.appendLine(`[${new Date().toISOString()}] [WARN] Failed to open browser automatically: ${error.message}`);
    }
    // Fallback: show message with URL
    const action = await vscode.window.showInformationMessage(
      `CPQ Toolset is running at ${url}`,
      'Open in Browser'
    );

    if (action === 'Open in Browser') {
      await vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }
}

/**
 * Extension deactivation
 */
function deactivate() {
  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] CPQ Toolset v3 deactivating...`);
  }
  console.log('CPQ Toolset v3 deactivating...');

  if (serverProcess) {
    if (outputChannel) {
      outputChannel.appendLine(`[${new Date().toISOString()}] Stopping server process...`);
    }
    serverProcess.kill('SIGTERM'); // Graceful shutdown
    serverProcess = null;
  }

  if (outputChannel) {
    outputChannel.appendLine(`[${new Date().toISOString()}] CPQ Toolset v3 deactivated`);
  }
  console.log('CPQ Toolset v3 deactivated');
}

module.exports = {
  activate,
  deactivate
};