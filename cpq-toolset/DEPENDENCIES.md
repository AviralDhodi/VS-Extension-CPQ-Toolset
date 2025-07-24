# CPQ Toolset v3 - Dependencies List

## Node.js Dependencies

### Production Dependencies (Required for runtime)
- **express** - Web framework for the local server
- **cors** - CORS middleware for Express
- **compression** - Response compression middleware
- **multer** - File upload handling
- **uuid** - UUID generation
- **python-shell** - Python script execution from Node.js
- **csv-parse** - CSV parsing (specifically csv-parse/sync)
- **xlsx** - Excel file reading/writing
- **glob** - File pattern matching
- **rotating-file-stream** - Log file rotation (in package.json but not found in code)
- **sqlite3** - SQLite database (in package.json but not found in code)
- **lucide** - Icons (in package.json but not found in code)
- **mocha** - Testing framework (should be in devDependencies)
- **open** - Open URLs/files (in package.json but not found in code)

### Development Dependencies
- **@vscode/vsce** - VS Code extension packaging
- **esbuild** - JavaScript bundler
- **eslint** - Linting
- **eslint-config-standard** - ESLint standard config
- **eslint-plugin-import** - Import linting
- **eslint-plugin-node** - Node.js linting
- **eslint-plugin-promise** - Promise linting
- **fs-extra** - Extended file system operations

### Node.js Built-in Modules (No installation needed)
- assert
- child_process
- fs
- https
- os
- path
- util

### VS Code API (Available in extension context)
- vscode

## Python Dependencies

### Required Python Packages
- **pandas** (>=1.5.0) - Data manipulation and analysis
- **numpy** (>=1.21.0) - Numerical operations
- **dask** (>=2023.1.0) - Parallel computing
- **pyarrow** (>=10.0.0) - Parquet file support
- **openpyxl** (>=3.0.0) - Excel file generation
- **lxml** (>=4.9.0) - XML parsing

### Python Standard Library (No installation needed)
- argparse
- collections
- datetime
- gc
- itertools
- json
- logging
- os
- pathlib
- shutil
- sys
- tempfile
- time
- typing
- xml.etree.ElementTree

## External Tools Required

### System Dependencies
- **Salesforce CLI** (sf or sfdx) - For Salesforce operations
- **Python 3.8+** - Python runtime (bundled for Windows in /py directory)

## Notes for Bundling

1. **For Windows bundling with pkg or similar:**
   - All Node.js production dependencies need to be bundled
   - Child process spawning needs special handling
   - File paths need to be resolved relative to the bundled executable
   - Python.exe and all Python packages are pre-bundled in /py directory

2. **Dependencies to remove from package.json:**
   - mocha (should be in devDependencies)
   - Unused dependencies: rotating-file-stream, sqlite3, lucide, open

3. **Missing from package.json but used:**
   - glob (used in data-comparison/routes/index.js)

4. **Python bundling strategy:**
   - Windows: Use embedded Python in /py directory
   - Mac/Linux: Use system Python or VS Code configured path