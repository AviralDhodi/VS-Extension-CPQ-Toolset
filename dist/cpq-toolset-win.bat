@echo off
setlocal

:: CPQ Toolset v3 - Windows Launcher
:: This script launches the CPQ Toolset server using the bundled Node.js

:: Get the directory where this script is located
set SCRIPT_DIR=%~dp0

:: Set paths
set NODE_EXE=%SCRIPT_DIR%node-win64\node.exe
set SERVER_JS=%SCRIPT_DIR%..\server.js
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
