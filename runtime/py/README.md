# Embedded Python for CPQ Toolset

This directory contains an embedded Python 3.13 distribution for Windows users.

## Installation Instructions

### Windows Users

1. Open Command Prompt or PowerShell
2. Navigate to this directory: `cd path\to\extension\py`
3. Run the installer: `install-dependencies.bat`

This will:
- Install pip (if not already installed)
- Install all required Python packages:
  - pandas (for data manipulation)
  - numpy (for numerical operations)
  - dask (for parallel processing)
  - pyarrow (for Parquet file support)
  - openpyxl (for Excel file generation)
  - lxml (for XML parsing)

### Manual Installation

If the automated installer fails, you can install packages manually:

1. First install pip:
   ```
   python.exe get-pip.py
   ```

2. Then install packages:
   ```
   python.exe -m pip install pandas numpy dask pyarrow openpyxl lxml
   ```

## Troubleshooting

### "pip is not recognized" error
- Make sure you're running commands from the `py` directory
- Use `python.exe -m pip` instead of just `pip`

### SSL Certificate errors
- Try adding `--trusted-host pypi.org --trusted-host files.pythonhosted.org` to pip commands

### Permission errors
- Run Command Prompt as Administrator
- Or use `--user` flag with pip install

## Verification

To verify the installation:
```
python.exe -m pip list
```

This should show all installed packages.

## Note for Developers

The `python313._pth` file has been configured to:
- Include the Lib directory
- Include Lib/site-packages for installed packages  
- Import site to enable full Python functionality

Do not modify the `python313._pth` file unless you understand the implications.