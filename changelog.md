# Change Log

All notable changes to the Salesforce Comparison Toolset extension will be documented in this file.

## [3.5.0] - 2025-08-08

### Added
- Platform-specific builds for optimal performance and size
- macOS ARM64 edition (~71MB) with native Apple Silicon support
- Windows x64 edition (~243MB) with embedded Python runtime
- Automatic platform detection in VS Code Marketplace
- Platform-specific build system (`scripts/build-platform-extension.js`)
- Publishing automation script (`scripts/publish-extensions.sh`)

### Changed
- Extension now distributed as two separate packages (macOS and Windows)
- Reduced extension size by 60-80% through platform optimization
- Removed platform-module-loader in favor of pre-packaged native modules
- Windows build includes all DLL dependencies for canvas module
- macOS build uses system Python instead of embedded Python

### Fixed
- Canvas module compatibility issues across platforms
- "Not a valid Win32 application" errors completely eliminated
- Extension size reduced from 400MB+ to platform-specific sizes

### Technical Details
- Windows: Includes embedded Python 3.13, Windows Node.js runtime, pre-compiled canvas with DLLs
- macOS: Includes macOS Node.js runtime, pre-compiled canvas for ARM64, uses system Python

## [3.4.4] - 2025-08-08

### Changed
- Replaced canvas dependency with sharp + SVG generation for cross-platform compatibility
- Charts are now generated as SVG and converted to PNG using sharp
- Eliminated "not a valid Win32 application" error on Windows

### Fixed
- Report generation now works on all platforms (Windows, macOS, Linux)
- No more native module compilation issues

## [3.4.3] - 2025-08-08

### Fixed
- Added missing pdfkit and canvas dependencies to runtime package.json
- Fixed "Cannot find module 'pdfkit'" error preventing /data-comparison route from loading
- Data comparison route now properly mounts

## [3.4.2] - 2025-08-08

### Fixed
- Added missing soqlToConfig.js file to runtime directory
- Fixed "Config Generator SOQL option" not appearing in context menu
- Updated build scripts to include SOQL conversion functionality

## [3.4.1] - 2025-08-07

### Fixed
- Corrected .vscodeignore to properly include embedded Node.js and Python runtimes
- Ensured standalone functionality without requiring external dependencies

## [3.4.0] - 2025-08-07

### Added
- Comprehensive SLDS (Salesforce Lightning Design System) compliance
- Username display in comparison viewer instead of aliases
- Development guide documentation

### Changed
- Improved CSV parsing for large multi-line fields
- Enhanced performance for large code field comparisons
- Updated UI components to use SLDS design tokens
- Optimized file structure by removing unused code

### Fixed
- CSV parsing issues with special characters and multi-line values
- Foreign key resolver UI issues with radio buttons and hover effects
- PDF report generation to be more professional and business-focused
- Truncation of large field values in comparison viewer

### Removed
- All emoji usage from codebase
- Unused legacy files and empty directories
- Redundant Python scripts and worker files
- Claude-specific configuration files

## [3.3.0] - Previous Release

### Added
- Initial VS Code extension support
- Multi-org comparison functionality
- PDF report generation
- Duplicate foreign key resolution

### Changed
- Improved data extraction performance
- Enhanced error handling

### Fixed
- Various UI bugs
- Data comparison accuracy issues