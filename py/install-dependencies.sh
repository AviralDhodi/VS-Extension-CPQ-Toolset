#!/bin/bash

echo "CPQ Toolset - Python Dependencies Installer"
echo "=========================================="
echo

# Check if python.exe exists (for embedded Python)
if [ -f "python.exe" ]; then
    PYTHON_CMD="./python.exe"
elif [ -f "python" ]; then
    PYTHON_CMD="./python"
else
    echo "ERROR: Python executable not found in current directory!"
    echo "Please run this script from the py directory."
    exit 1
fi

# Run the Python installer script
echo "Running Python package installer..."
$PYTHON_CMD get-pip.py

if [ $? -eq 0 ]; then
    echo
    echo "=========================================="
    echo "Installation completed successfully!"
    echo
    echo "You can now use the CPQ Toolset extension."
else
    echo
    echo "=========================================="
    echo "Installation failed!"
    echo "Please check the error messages above."
fi