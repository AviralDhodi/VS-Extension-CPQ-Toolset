const vscode = require('vscode');
const path = require("path");
const { fork, exec } = require("child_process");

function activate(context) {
  // Start the server
  const serverPath = path.join(__dirname, "bundledServer.js");
  const child = fork(serverPath, [], { stdio: "inherit" });

  // ✅ Register the correct command
  const disposable = vscode.commands.registerCommand('cpq-toolset.launch', () => {
    const port = 3030;
    const url = `http://localhost:${port}`;

    const openCmd = process.platform === 'win32' ? `start ${url}` :
                    process.platform === 'darwin' ? `open ${url}` :
                    `xdg-open ${url}`;

    exec(openCmd, (err) => {
      if (err) {
        vscode.window.showErrorMessage(`Failed to open browser: ${err.message}`);
      } else {
        vscode.window.showInformationMessage(`CPQ Toolset opened in browser`);
      }
    });
  });

  // Add both disposables
  context.subscriptions.push(disposable);
  context.subscriptions.push({
    dispose: () => child.kill()
  });
}

module.exports = { activate };
