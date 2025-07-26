// CPQ Toolset v3 - VS Code Extension Entry Point
const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let serverProcess = null;
let outputChannel = null;
const SERVER_PORT = 3030;

/**
 * Extension activation
 */
function activate(context) {
  console.log('CPQ Toolset v3 is activating...');
  
  // Create output channel for server logs
  outputChannel = vscode.window.createOutputChannel('CPQ Toolset');

  // Register launch command
  const launchCommand = vscode.commands.registerCommand('cpq-toolset.launch', async () => {
    try {
      await launchCPQToolset(context);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to launch CPQ Toolset: ${error.message}`);
    }
  });
  context.subscriptions.push(launchCommand);
  
  // Register stop command
  const stopCommand = vscode.commands.registerCommand('cpq-toolset.stop', async () => {
    try {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        vscode.window.showInformationMessage('CPQ Toolset server stopped');
      } else {
        vscode.window.showInformationMessage('CPQ Toolset server is not running');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to stop server: ${error.message}`);
    }
  });
  context.subscriptions.push(stopCommand);
  
  // Register restart command
  const restartCommand = vscode.commands.registerCommand('cpq-toolset.restart', async () => {
    try {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }
      await startServer(context.extensionPath);
      vscode.window.showInformationMessage('CPQ Toolset server restarted');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to restart server: ${error.message}`);
    }
  });
  context.subscriptions.push(restartCommand);
  
  // Register show output command
  const showOutputCommand = vscode.commands.registerCommand('cpq-toolset.showOutput', () => {
    if (outputChannel) {
      outputChannel.show();
    }
  });
  context.subscriptions.push(showOutputCommand);

  // Add status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = 'CPQ Toolset';
  statusBarItem.tooltip = 'Launch CPQ Toolset';
  statusBarItem.command = 'cpq-toolset.launch';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Cleanup on deactivation
  context.subscriptions.push({
    dispose: () => {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
        serverProcess = null;
      }
    }
  });

  console.log('CPQ Toolset v3 activated');
}

/**
 * Launch the CPQ Toolset server and open browser
 */
async function launchCPQToolset(context) {
  try {
    // Start server if not already running
    if (!serverProcess || serverProcess.killed) {
      await startServer(context.extensionPath);
    }

    // Open browser
    await openBrowser();

    vscode.window.showInformationMessage('CPQ Toolset launched successfully!');
  } catch (error) {
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
      outputChannel.appendLine(`Attempting to clear port ${port} on ${platform}...`);
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
              outputChannel.appendLine(`Port check info: ${error.message || 'No process found on port'}`);
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
            resolve();
          } else {
            // Fallback to fuser
            exec(`fuser -k ${port}/tcp`, (fuserError) => {
              if (!fuserError) {
                console.log(`Killed process on port ${port} using fuser`);
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
      outputChannel.appendLine(`Warning: Could not clear port ${port}: ${error.message}`);
      outputChannel.appendLine('The server will attempt to start anyway...');
    }
    // Don't throw - we want to continue even if kill fails
  }
}

/**
 * Start the Express server
 */
function startServer(extensionPath) {
  return new Promise(async (resolve, reject) => {
    const platform = process.platform;
    const arch = process.arch === 'x64' ? 'x64' : 'x64'; // pkg only supports x64 for now
    
    // Kill port before starting
    try {
      if (outputChannel) {
        outputChannel.appendLine(`Checking for existing processes on port ${SERVER_PORT}...`);
      }
      await killProcessOnPort(SERVER_PORT);
      
      // Small delay to ensure port is freed
      await new Promise(res => setTimeout(res, 500));
    } catch (error) {
      console.warn('Port clearing failed, but continuing:', error);
      if (outputChannel) {
        outputChannel.appendLine(`Warning: Port clearing failed: ${error.message}`);
        outputChannel.appendLine('Attempting to start server anyway...');
      }
    }
    
    // Use traditional Node.js approach
    let serverPath = path.join(extensionPath, 'server-bundle.js');
    let isBundled = true;
    
    if (!fs.existsSync(serverPath)) {
      serverPath = path.join(extensionPath, 'server-bundle.js');
      isBundled = false;
      
      if (!fs.existsSync(serverPath)) {
        reject(new Error('Server file not found'));
        return;
      }
    }
    
    console.log(`Starting CPQ Toolset server (${isBundled ? 'bundled' : 'development'})...`);
    const serverExecutable = getNodeExecutable(extensionPath);
    const serverArgs = [serverPath];

    serverProcess = spawn(serverExecutable, serverArgs, {
      stdio: 'pipe',
      cwd: extensionPath,
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
      console.log('Server:', output.trim());
      
      // Send to output channel
      if (outputChannel) {
        outputChannel.appendLine(output.trim());
      }

      // Look for server ready signal
      if (output.includes('CPQ Toolset v3 running') && !startupComplete) {
        startupComplete = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Server Error:', error);
      errorBuffer += error;
      
      // Send errors to output channel
      if (outputChannel) {
        outputChannel.appendLine(`[ERROR] ${error.trim()}`);
      }

      // Check for specific errors
      if (error.includes('EADDRINUSE')) {
        if (!startupComplete) {
          reject(new Error(`Port ${SERVER_PORT} is already in use`));
        }
      } else if (error.includes('MODULE_NOT_FOUND')) {
        if (!startupComplete) {
          reject(new Error('Missing dependencies. Please run npm install.'));
        }
      }
    });

    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
      serverProcess = null;
      
      if (!startupComplete && code !== 0) {
        reject(new Error(`Server failed to start (exit code ${code}): ${errorBuffer}`));
      }
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start server:', error);
      if (!startupComplete) {
        reject(error);
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!startupComplete) {
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
    bundledNode = path.join(extensionPath, 'dist', 'node-win64', 'node.exe');
    if (!fs.existsSync(bundledNode)) {
      // Try alternative location
      bundledNode = path.join(extensionPath, 'node-win64', 'node.exe');
    }
  }
  // Future: Add support for Mac and Linux bundled Node.js
  // else if (platform === 'darwin') {
  //   bundledNode = path.join(extensionPath, 'dist', 'node-darwin', 'node');
  // } else if (platform === 'linux') {
  //   bundledNode = path.join(extensionPath, 'dist', 'node-linux', 'node');
  // }
  
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

  try {
    // Use VS Code's built-in browser opening
    await vscode.env.openExternal(vscode.Uri.parse(url));
  } catch (error) {
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
  console.log('CPQ Toolset v3 deactivating...');

  if (serverProcess) {
    serverProcess.kill('SIGTERM'); // Graceful shutdown
    serverProcess = null;
  }

  console.log('CPQ Toolset v3 deactivated');
}

module.exports = {
  activate,
  deactivate
};