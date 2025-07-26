#!/usr/bin/env node
// CPQ Toolset v3 - Bundle Node.js for Windows

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const NODE_WIN_PATH = '/Users/aviraldhodi/Downloads/node-v22.17.1-win-x64';
const EXTENSION_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(EXTENSION_ROOT, 'dist');
const NODE_DIR = path.join(DIST_DIR, 'node-win64');

console.log('=== CPQ Toolset v3 - Windows Node.js Bundling ===\n');

// Step 1: Ensure dist directory exists
console.log('1. Creating dist directory...');
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// Step 2: Copy Windows Node.js
console.log('2. Copying Windows Node.js binary...');
if (!fs.existsSync(NODE_WIN_PATH)) {
  console.error(`Error: Windows Node.js not found at ${NODE_WIN_PATH}`);
  console.error('Please download Node.js for Windows and extract it to the Downloads folder.');
  process.exit(1);
}

// Create node directory in dist
if (!fs.existsSync(NODE_DIR)) {
  fs.mkdirSync(NODE_DIR, { recursive: true });
}

// Copy node.exe
const nodeExePath = path.join(NODE_WIN_PATH, 'node.exe');
const targetNodePath = path.join(NODE_DIR, 'node.exe');
if (fs.existsSync(nodeExePath)) {
  fs.copyFileSync(nodeExePath, targetNodePath);
  console.log(`   ✓ Copied node.exe to ${targetNodePath}`);
} else {
  console.error(`   ✗ node.exe not found at ${nodeExePath}`);
  process.exit(1);
}

// Step 3: Create Windows launcher script
console.log('3. Creating Windows launcher script...');
const launcherContent = `@echo off
setlocal

:: CPQ Toolset v3 - Windows Launcher
:: This script launches the CPQ Toolset server using the bundled Node.js

:: Get the directory where this script is located
set SCRIPT_DIR=%~dp0

:: Set paths
set NODE_EXE=%SCRIPT_DIR%node-win64\\node.exe
set SERVER_JS=%SCRIPT_DIR%..\\server.js
set EXTENSION_ROOT=%SCRIPT_DIR%..

:: Check if bundled Node.js exists
if not exist "%NODE_EXE%" (
    echo Error: Bundled Node.js not found at %NODE_EXE%
    echo Trying system Node.js...
    set NODE_EXE=node
)

:: Check if server.js exists
if not exist "%SERVER_JS%" (
    echo Error: server.js not found at %SERVER_JS%
    exit /b 1
)

:: Set environment variables
set NODE_ENV=production
set EXTENSION_ROOT=%EXTENSION_ROOT%
set CPQ_BUNDLED=true
set PORT=3030

:: Kill any existing process on port 3030
echo Checking for existing processes on port 3030...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3030') do (
    echo Killing process %%a on port 3030...
    taskkill /F /PID %%a 2>nul
)

:: Wait a moment for port to be freed
timeout /t 1 /nobreak >nul

:: Launch the server
echo Starting CPQ Toolset server...
echo Using Node.js: %NODE_EXE%
echo Server path: %SERVER_JS%
echo.

"%NODE_EXE%" "%SERVER_JS%"

endlocal
`;

const launcherPath = path.join(DIST_DIR, 'cpq-toolset-win.bat');
fs.writeFileSync(launcherPath, launcherContent);
console.log(`   ✓ Created launcher: ${launcherPath}`);

// Step 4: Create PowerShell launcher (alternative)
console.log('4. Creating PowerShell launcher script...');
const psLauncherContent = `# CPQ Toolset v3 - Windows PowerShell Launcher

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = Join-Path $scriptDir "node-win64\\node.exe"
$serverJs = Join-Path $scriptDir "..\\server.js"
$extensionRoot = Join-Path $scriptDir ".."

# Check if bundled Node.js exists
if (-not (Test-Path $nodeExe)) {
    Write-Host "Error: Bundled Node.js not found at $nodeExe" -ForegroundColor Red
    Write-Host "Trying system Node.js..." -ForegroundColor Yellow
    $nodeExe = "node"
}

# Check if server.js exists
if (-not (Test-Path $serverJs)) {
    Write-Host "Error: server.js not found at $serverJs" -ForegroundColor Red
    exit 1
}

# Set environment variables
$env:NODE_ENV = "production"
$env:EXTENSION_ROOT = $extensionRoot
$env:CPQ_BUNDLED = "true"
$env:PORT = "3030"

# Kill any existing process on port 3030
Write-Host "Checking for existing processes on port 3030..." -ForegroundColor Cyan
$connections = Get-NetTCPConnection -LocalPort 3030 -ErrorAction SilentlyContinue
if ($connections) {
    foreach ($conn in $connections) {
        $process = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Killing process $($process.Name) (PID: $($process.Id)) on port 3030..." -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force
        }
    }
    Start-Sleep -Seconds 1
}

# Launch the server
Write-Host "Starting CPQ Toolset server..." -ForegroundColor Green
Write-Host "Using Node.js: $nodeExe" -ForegroundColor Cyan
Write-Host "Server path: $serverJs" -ForegroundColor Cyan
Write-Host ""

& $nodeExe $serverJs
`;

const psLauncherPath = path.join(DIST_DIR, 'cpq-toolset-win.ps1');
fs.writeFileSync(psLauncherPath, psLauncherContent);
console.log(`   ✓ Created PowerShell launcher: ${psLauncherPath}`);

// Step 5: Update extension.js to detect bundled Node.js
console.log('5. Updating extension.js for Windows Node.js support...');
// This is already handled in getNodeExecutable function

// Step 6: Create README for Windows users
console.log('6. Creating Windows README...');
const readmeContent = `# CPQ Toolset v3 - Windows Bundle

This bundle includes Node.js for Windows, so you don't need to install Node.js separately.

## Running the Extension

### Option 1: Using Command Prompt (Recommended)
1. Open the VS Code terminal
2. Navigate to the extension's dist folder
3. Run: \`cpq-toolset-win.bat\`

### Option 2: Using PowerShell
1. Open PowerShell as Administrator (if needed)
2. Navigate to the extension's dist folder
3. If you get an execution policy error, run: \`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser\`
4. Run: \`.\\cpq-toolset-win.ps1\`

## Troubleshooting

### Port 3030 is already in use
The launcher scripts automatically try to kill any process using port 3030. If this fails:
1. Open Command Prompt as Administrator
2. Run: \`netstat -ano | findstr :3030\`
3. Note the PID (last column)
4. Run: \`taskkill /F /PID [PID]\`

### Node.js not found
If the bundled Node.js is not found, the scripts will try to use system Node.js.
Make sure the extension is properly extracted with the node-win64 folder.

## File Structure
\`\`\`
dist/
├── cpq-toolset-win.bat     # Command Prompt launcher
├── cpq-toolset-win.ps1     # PowerShell launcher
├── node-win64/             # Bundled Node.js for Windows
│   └── node.exe
└── README-WINDOWS.md       # This file
\`\`\`
`;

const readmePath = path.join(DIST_DIR, 'README-WINDOWS.md');
fs.writeFileSync(readmePath, readmeContent);
console.log(`   ✓ Created README: ${readmePath}`);

console.log('\n✅ Windows Node.js bundling complete!');
console.log('\nNext steps:');
console.log('1. Run "npm run build" to bundle the server code');
console.log('2. Run "npm run build:extension" to create the VS Code extension package');
console.log('3. The extension will include the bundled Node.js for Windows');