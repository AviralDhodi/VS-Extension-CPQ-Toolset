"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const child_process_1 = require("child_process");
const http = require("http");
let serverProcess = null;
const SERVER_PORT = 3000;
function activate(context) {
    console.log('CPQ Toolset extension is now active!');
    // Register the launch command
    let disposable = vscode.commands.registerCommand('cpq-toolset.launch', async () => {
        try {
            // Start Express server if not running
            if (!serverProcess) {
                await startServer(context);
            }
            // Open browser to dashboard
            const url = `http://localhost:${SERVER_PORT}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
            vscode.window.showInformationMessage('CPQ Toolset launched!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to launch CPQ Toolset: ${error}`);
        }
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
async function startServer(context) {
    return new Promise((resolve, reject) => {
        // Get SFDX path from VS Code configuration
        const config = vscode.workspace.getConfiguration('cpq-toolset');
        const sfdxPath = config.get('sfdxPath');
        // Get path to server directory
        const serverPath = path.join(context.extensionPath, '..', 'server');
        // Prepare environment variables
        const env = { ...process.env };
        if (sfdxPath && sfdxPath.trim()) {
            env.SFDX_PATH = sfdxPath.trim();
            console.log(`Using configured SFDX path: ${sfdxPath}`);
        }
        else {
            console.log('No SFDX path configured, using auto-detection');
        }
        // Start the Express server
        serverProcess = (0, child_process_1.spawn)('node', ['src/server.js'], {
            cwd: serverPath,
            stdio: 'pipe',
            env: env
        });
        serverProcess.stdout.on('data', (data) => {
            console.log(`Server: ${data.toString()}`);
        });
        serverProcess.stderr.on('data', (data) => {
            console.error(`Server Error: ${data.toString()}`);
        });
        serverProcess.on('error', (error) => {
            reject(new Error(`Failed to start server: ${error.message}`));
        });
        serverProcess.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`Server exited with code ${code}`));
            }
        });
        // Wait for server to be ready by checking health endpoint
        waitForServerReady()
            .then(resolve)
            .catch(reject);
    });
}
async function waitForServerReady() {
    const maxAttempts = 30; // 30 seconds max
    let attempts = 0;
    return new Promise((resolve, reject) => {
        const checkServer = () => {
            attempts++;
            const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
                if (res.statusCode === 200) {
                    console.log('Server is ready!');
                    resolve();
                }
                else if (attempts >= maxAttempts) {
                    reject(new Error('Server failed to start within 30 seconds'));
                }
                else {
                    setTimeout(checkServer, 1000);
                }
            });
            req.on('error', (error) => {
                if (attempts >= maxAttempts) {
                    reject(new Error(`Server health check failed: ${error.message}`));
                }
                else {
                    setTimeout(checkServer, 1000);
                }
            });
            req.setTimeout(1000, () => {
                req.destroy();
                if (attempts >= maxAttempts) {
                    reject(new Error('Server health check timeout'));
                }
                else {
                    setTimeout(checkServer, 1000);
                }
            });
        };
        // Start checking after a brief delay
        setTimeout(checkServer, 1000);
    });
}
function deactivate() {
    if (serverProcess) {
        console.log('Shutting down CPQ Toolset server...');
        serverProcess.kill('SIGTERM');
        // Force kill after 5 seconds if graceful shutdown fails
        setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
                console.log('Force killing server process...');
                serverProcess.kill('SIGKILL');
            }
        }, 5000);
        serverProcess = null;
    }
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map