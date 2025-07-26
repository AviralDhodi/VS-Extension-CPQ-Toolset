
# Change Log

All notable changes to the CPQ Toolset VS Code extension will be documented in this file.

## [3.0.14] - 2025-07-26

### Fixed
- Fixed component JavaScript files not loading in pkg mode
- Added proper component file serving routes that use pkgFileReader
- Removed express.static routes that don't work with pkg virtual filesystem
- JavaScript and CSS files are now properly served from the bundled executable

## [3.0.13] - 2025-07-26

### Fixed
- Fixed PathResolver to use real filesystem paths instead of snapshot paths when running as pkg
- Removed redundant path resolution logic in PythonRunner
- Extension root now correctly points to the VS Code extension directory

## [3.0.12] - 2025-07-26

### Fixed
- Fixed Python detection when running as pkg executable to use real filesystem paths
- Pkg executable now correctly finds Python in the extension directory instead of snapshot filesystem
- Apps will now load properly when using bundled executable

## [3.0.11] - 2025-07-25

### Fixed
- Fixed executable path detection to check both `bin/` and `dist/bin/` locations
- Fixed Python path detection to check both `runtime/py/` and `py/` locations
- Extension now properly finds bundled executables and Python in installed extension directory

## [3.0.10] - 2025-07-25

### Fixed
- Fixed .vscodeignore paths to properly include bin and py directories
- Executables and Python bundle are now correctly packaged in VS Code extension
- Extension will now use bundled executables instead of falling back to Node.js

## [3.0.9] - 2025-07-25

### Fixed
- Added detailed debugging for executable path resolution
- Made Windows shell commands more robust with explicit cmd.exe
- Added better error handling for port clearing failures
- Added directory existence checks and file listing for troubleshooting

## [3.0.8] - 2025-07-25

### Fixed
- Fixed "spawn node ENOENT" error on client machines without Node.js
- Updated build-extension script to properly include executable binaries
- Ensured dist/bin directory is included in VS Code extension package

## [3.0.7] - 2025-07-25

### Fixed
- Fixed Windows bundled executable routing issues
- Enhanced route loading with better debugging for pkg mode
- Fixed pkgFileReader.existsSync to properly handle directories and JS files in pkg bundles
- Added missing pkgFileReader functions (writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync)
- Added debug endpoint (/debug/routes) to diagnose routing issues
- Added 404 handler with helpful error messages
- Improved pkg mode detection for app routes
- Fixed Babel parse errors in permissions-analyser worker files
- Made port clearing failures non-fatal to ensure extension always starts

### Added
- VS Code output channel for server logs (CPQ Toolset: Show Output command)
- Stop, Restart, and Show Output commands in VS Code
- Automatic killing of existing processes on port 3030 before starting server (cross-platform)
- Better logging visibility when running from VS Code extension

## [3.0.6] - 2025-07-25

### Fixed
- Fixed all fs operations app-wide to use pkg-compatible methods
- Replaced fs.existsSync, fs.readFileSync, fs.writeFileSync, and fs.mkdirSync with pkgReader equivalents throughout all apps
- Fixed file operations in worker processes (fetcher, bufferAppendWriter, duplicateResolver, etc.)
- Fixed file operations in data-comparison routes and state management
- Fixed file operations in permissions-analyser routes
- Ensured all functionalities work properly in bundled mode without Node.js or Python installed

## [3.0.5] - 2025-07-25

### Fixed
- Fixed component JavaScript and CSS not loading in bundled mode
- Updated app routes to use pkgFileReader for all file operations
- Added static file serving routes for component assets
- Fixed button click handlers not working in both apps

## [3.0.4] - 2025-07-25

### Fixed
- Fixed pkg bundling to work with any directory name (removed hardcoded paths)
- Fixed PathResolver to correctly detect pkg snapshot filesystem paths
- Fixed static file serving in bundled mode using pkgFileReader
- Fixed getAvailableApps to work in pkg mode with hardcoded app list
- Updated all file operations to use pkg-compatible methods
- Extension now works correctly on machines without Node.js installed

## [3.0.3] - 2025-07-25

### Fixed
- Fixed root route (/) not loading in pkg bundles
- Server now serves the home page correctly

## [3.0.2] - 2025-07-25

### Fixed
- Fixed executables not being included in VS Code extension package
- Updated .vscodeignore to include dist/bin directory

## [3.0.0] - 2025-07-25

### Added
- Initial release of CPQ Toolset v3
- Data Comparison tool with GraphQL pagination support
- Permissions Analyser for comparing profiles and permission sets
- Standalone executable support via pkg bundling
- Multi-platform support (Windows, macOS, Linux)
- SLDS 2.0 UI framework
- Parallel worker processes for improved performance
- Duplicate foreign key detection and resolution
- CSV and JSON export formats
- Git-like diff viewer for field-level comparisons

### Features
- Compare Salesforce CPQ data across unlimited organizations
- Analyze permissions across multiple orgs
- Configure field-level comparisons with foreign key mapping
- Validate lookup relationships
- Export detailed comparison reports

### Technical
- Node.js 16+ support
- Python integration for data processing
- Express.js web server
- Worker process management
- File locking for concurrent operations

## [Unreleased]

### Planned
- Python embedding for Windows
- Enhanced VS Code settings integration
- Real-time comparison progress in VS Code output
- Direct org authentication from VS Code
- Comparison history and saved sessions