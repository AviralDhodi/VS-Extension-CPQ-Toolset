# CPQ Toolset v3 - Windows PowerShell Launcher

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = Join-Path $scriptDir "node-win64\node.exe"
$serverJs = Join-Path $scriptDir "..\server.js"
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
