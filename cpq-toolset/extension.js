// CPQ Toolset v3 - VS Code Extension Entry Point
const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let serverProcess = null;
const SERVER_PORT = 3030;

/**
 * Extension activation
 */
function activate(context) {
  console.log('CPQ Toolset v3 is activating...');

  // Register launch command
  const disposable = vscode.commands.registerCommand('cpq-toolset.launch', async () => {
    try {
      await launchCPQToolset(context);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to launch CPQ Toolset: ${error.message}`);
    }
  });

  context.subscriptions.push(disposable);

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
 * Start the Express server
 */
function startServer(extensionPath) {
  return new Promise((resolve, reject) => {
    // Check for bundled server first, then fall back to dev server
    let serverPath = path.join(extensionPath, 'server-bundle.js');
    let isBundled = true;
    
    if (!fs.existsSync(serverPath)) {
      serverPath = path.join(extensionPath, 'server.js');
      isBundled = false;
      
      if (!fs.existsSync(serverPath)) {
        reject(new Error('Server file not found'));
        return;
      }
    }

    console.log(`Starting CPQ Toolset server (${isBundled ? 'bundled' : 'development'})...`);

    // Get Node.js executable
    const nodeExecutable = getNodeExecutable();

    serverProcess = spawn(nodeExecutable, [serverPath], {
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
function getNodeExecutable() {
  // Check VS Code settings for custom Node path
  const config = vscode.workspace.getConfiguration('cpq-toolset');
  const customNodePath = config.get('nodePath');
  
  if (customNodePath && fs.existsSync(customNodePath)) {
    return customNodePath;
  }
  
  // For bundled extensions, we might need to use a bundled Node.js
  // This is a placeholder for future implementation
  // const bundledNode = path.join(__dirname, 'node', process.platform, 'node');
  // if (fs.existsSync(bundledNode)) {
  //   return bundledNode;
  // }
  
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