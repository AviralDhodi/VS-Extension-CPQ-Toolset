@echo off
echo CPQ Toolset - Python Dependencies Installer
echo ==========================================
echo.

REM Check if we're in the right directory
if not exist python.exe (
    echo ERROR: python.exe not found in current directory!
    echo Please run this script from the py directory.
    pause
    exit /b 1
)

REM Run the Python installer script
echo Running Python package installer...
python.exe get-pip.py

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ==========================================
    echo Installation completed successfully!
    echo.
    echo You can now use the CPQ Toolset extension.
) else (
    echo.
    echo ==========================================
    echo Installation failed!
    echo Please check the error messages above.
)

echo.
pause