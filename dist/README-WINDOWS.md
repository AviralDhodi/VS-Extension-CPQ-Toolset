# CPQ Toolset v3 - Windows Bundle

This bundle includes Node.js for Windows, so you don't need to install Node.js separately.

## Running the Extension

### Option 1: Using Command Prompt (Recommended)
1. Open the VS Code terminal
2. Navigate to the extension's dist folder
3. Run: `cpq-toolset-win.bat`

### Option 2: Using PowerShell
1. Open PowerShell as Administrator (if needed)
2. Navigate to the extension's dist folder
3. If you get an execution policy error, run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`
4. Run: `.\cpq-toolset-win.ps1`

## Troubleshooting

### Port 3030 is already in use
The launcher scripts automatically try to kill any process using port 3030. If this fails:
1. Open Command Prompt as Administrator
2. Run: `netstat -ano | findstr :3030`
3. Note the PID (last column)
4. Run: `taskkill /F /PID [PID]`

### Node.js not found
If the bundled Node.js is not found, the scripts will try to use system Node.js.
Make sure the extension is properly extracted with the node-win64 folder.

## File Structure
```
dist/
├── cpq-toolset-win.bat     # Command Prompt launcher
├── cpq-toolset-win.ps1     # PowerShell launcher
├── node-win64/             # Bundled Node.js for Windows
│   └── node.exe
└── README-WINDOWS.md       # This file
```
