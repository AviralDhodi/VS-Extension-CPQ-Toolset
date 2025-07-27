# Salesforce Comparison Toolset - Comprehensive Code Documentation

## Project Structure Overview

```
/Extension 2/
├── extension.js                 # VS Code extension entry point
├── server.js                    # Express server
├── package.json                 # Project manifest
├── scripts/                     # Build and deployment scripts
├── shared/                      # Shared utilities and modules
├── apps/                        # Application modules
├── runtime/                     # Runtime copy (created by build)
├── dist/                        # Distribution files
└── py/                          # Embedded Python for Windows
```

## Core Files Documentation

### 1. extension.js (VS Code Extension Entry Point)
**Purpose**: Manages VS Code extension lifecycle and server launching
**Key Functions**:
- `activate(context)`: Registers VS Code commands and initializes extension
- `launchCPQToolset()`: Starts server and opens browser
- `killProcessOnPort(port)`: Clears port conflicts cross-platform
- `getNodeExecutable(extensionPath)`: Detects bundled vs system Node.js
- `startServer(extensionPath)`: Spawns server process with proper environment
- `openBrowser()`: Opens default browser to localhost:3030
- `deactivate()`: Cleanup on extension shutdown

**Important Features**:
- Port 3030 conflict resolution for Windows/Mac/Linux
- Bundled Node.js detection for Windows
- Output channel for server logs
- Status bar integration

### 2. server.js (Express Server)
**Purpose**: HTTP server providing REST API and web interface
**Key Components**:
- Express middleware stack (compression, CORS, JSON parsing)
- Dynamic app loading from `/apps` directory
- Static file serving with binary file support
- Multer configuration for file uploads (10MB limit)
- Health check endpoint (`/health`)
- Debug endpoints (`/debug`, `/debug/routes`)
- Graceful shutdown handling

**Route Loading**:
- Loads shared routes from `/shared/routes`
- Dynamically loads app routes from each app's `/routes/index.js`
- 404 and error handlers

### 3. package.json
**Key Scripts**:
- `dev`: Run development server
- `build`: Build runtime directory
- `build:extension`: Build VS Code extension
- `package`: Create VSIX package
- `publish`: Publish to VS Code marketplace

**Dependencies**:
- Express ecosystem (compression, cors, multer)
- Python integration (python-shell)
- Data processing (csv-parse, xlsx)
- File locking (proper-lockfile)

## Shared Utilities (/shared/utils/)

### 1. pathResolver.js
**Purpose**: Singleton path resolution for bundled vs development modes
**Key Methods**:
- `constructor()`: Detects bundled mode and sets paths
- `resolve()`: Base path resolution
- `resolveRuntime()`: Runtime-specific paths
- `getAppPath()`: App directory paths
- `getWorkerPath()`: Worker script paths
- `getPythonScript()`: Python script paths
- `getAvailableApps()`: Lists installed apps

**Bundled Mode Detection**:
```javascript
this.isBundled = process.argv[1]?.includes('server-bundle.js') || 
                 process.env.CPQ_BUNDLED === 'true';
```

### 2. sfdxRunner.js
**Purpose**: Wrapper for Salesforce CLI commands
**Key Methods**:
- `detectCLI()`: Auto-detects sf vs sfdx CLI
- `executeCommand()`: Runs CLI commands with timeout
- `getAuthenticatedOrgs()`: Lists authenticated orgs
- `getObjects()`: Retrieves object list from org
- `getObjectFields()`: Gets field metadata
- `executeSOQL()`: Runs SOQL queries (50K limit)
- `listMetadata()`: Lists metadata components

**Features**:
- Automatic CLI type detection
- Unified interface for sf/sfdx commands
- Error handling and logging

### 3. graphqlRunner.js
**Purpose**: SOQL query builder and executor
**Key Methods**:
- `buildSOQLQuery()`: Constructs SOQL with filters
- `fetchObjectDataForOrg()`: Fetches data from specific org
- `fetchMultiOrgData()`: Parallel multi-org fetching
- `validateConfiguration()`: Config validation
- `testOrgConnections()`: Connection testing

**50K Limit Implementation**:
```javascript
const limit = orgSpecificFilters.limit || 50000;
query += ` LIMIT ${limit}`;
```

### 4. graphqlCLIRunner.js
**Purpose**: GraphQL query execution via SF CLI
**Key Functions**:
- `buildGraphQLQuery()`: Constructs GraphQL queries
- `executeGraphQLQuery()`: Executes via SF CLI with pagination

### 5. pythonRunner.js
**Purpose**: Python script execution wrapper
**Features**:
- Embedded Python detection for Windows
- Virtual environment support
- Cross-platform Python detection
- Dependency installation handling

### 6. logger.js
**Purpose**: Winston-based logging system
**Features**:
- File and console logging
- Log rotation
- Request middleware
- Configurable log levels

### 7. pkgFileReader.js
**Purpose**: File system operations wrapper
**Note**: Simplified after removing pkg support
**Methods**: Standard fs operations (readFileSync, writeFileSync, etc.)

### 8. constants.js
**Purpose**: Shared constants and configurations

## Applications (/apps/)

### Data Comparison App (/apps/data-comparison/)

#### Structure:
```
data-comparison/
├── index.js              # App metadata
├── routes/index.js       # Express routes
├── state/index.js        # State management
├── components/           # UI components
├── worker/               # Worker processes
└── python/               # Python scripts
```

#### Key Components:

##### routes/index.js
**Endpoints**:
- `GET /`: App homepage
- `POST /save-config`: Save comparison configuration
- `GET /get-saved-configs`: List saved configs
- `POST /run-comparison`: Execute comparison (NOW ALWAYS USES GRAPHQL)
- `GET /comparison-status/:id`: Check progress
- Various data fetching endpoints

**Important Change**: Always uses GraphQL fetcher now:
```javascript
// Always use GraphQL fetcher for unlimited record support
const spawnGraphQLFetchers = require(...'spawnGraphQLFetchers.js');
await spawnGraphQLFetchers(graphqlConfig, comparisonId);
```

##### Worker Processes:

###### spawnGraphQLFetchers.js
**Purpose**: Orchestrates parallel GraphQL data fetching
**Key Features**:
- Spawns multiple fetcher workers
- Spawns single append writer
- Configurable concurrency (default 2-4 workers)
- Buffer directory management
- Progress tracking

**Process Architecture**:
```
Main Process
├── spawnGraphQLFetchers (orchestrator)
│   ├── graphqlFetcher.js (worker 1)
│   ├── graphqlFetcher.js (worker 2)
│   ├── graphqlFetcher.js (worker N)
│   └── bufferAppendWriter.js (consolidator)
```

###### graphqlFetcher.js
**Purpose**: Worker process for GraphQL data fetching
**Key Features**:
- Pagination support (NO LIMIT!)
- Buffer file writing per page
- File locking for concurrent writes
- Progress reporting to parent

**Pagination Loop**:
```javascript
while (hasNextPage) {
    const result = await executeGraphQLQuery(query, orgUsername, cursor);
    // Process records...
    hasNextPage = queryData.pageInfo?.hasNextPage || false;
    cursor = queryData.pageInfo?.endCursor;
}
```

###### bufferAppendWriter.js
**Purpose**: Consolidates buffer files into final JSONL
**Key Features**:
- File system watcher
- Lock-based file processing
- Automatic cleanup
- Graceful shutdown

###### DELETED FILES:
- `fetcher.js` - Old SOQL fetcher (limited to 50K)
- `spawnFetchers.js` - Old orchestrator for SOQL fetcher

##### Python Scripts:

###### multi_org_comparison.py
**Purpose**: Legacy comparison implementation
**Features**:
- Chunk size parameter (NOT a limit)
- All-vs-all org comparison
- Field exclusion support
- JSONL/CSV/Parquet support

###### multi_org_comparison_optimized.py
**Purpose**: High-performance comparison using set operations
**Key Features**:
- Set-based comparison for performance
- Mega DataFrame approach
- Blacklist support for duplicate FKs
- Same interface as legacy version

**NO HARD LIMITS in either Python script!**

###### duplicate_fk_detector_jsonl.py
**Purpose**: Detects duplicate foreign keys in JSONL files
**Output**: Creates blacklist file for exclusion

##### UI Components:

###### configGenerator/improved-index.html & .js
**Purpose**: Configuration UI for comparisons
**Recent Changes**:
- REMOVED fetch method selector
- Always uses GraphQL mode
- No more "SOQL (Fast, up to 50K)" option

### Permissions Analyser App (/apps/permissions-analyser/)
Similar structure to data-comparison app

## Build Scripts (/scripts/)

### build.js
**Purpose**: Main build script
**Process**:
1. Cleans previous builds
2. Creates runtime directory
3. Copies apps, shared, py folders
4. Creates minimal package.json
5. Installs production dependencies
6. Verifies Python bundle

### build-extension.js
**Purpose**: Builds VS Code extension
**Process**:
1. Runs main build
2. Creates dist directory
3. Copies runtime to dist
4. Bundles with esbuild
5. Copies VS Code specific files

### build-vscode-extension.js
**Purpose**: Complete extension packaging
**Features**:
- Runs all build steps
- Creates VSIX package
- Handles Windows Node.js bundling

### bundle-node-windows.js
**Purpose**: Bundles Node.js for Windows
**Process**:
1. Copies node.exe from Downloads
2. Creates launcher scripts (.bat, .ps1)

## Data Flow

### Comparison Execution Flow:
1. User configures comparison in UI
2. Configuration saved as JSON
3. `/run-comparison` endpoint called
4. **Always uses spawnGraphQLFetchers.js**
5. Multiple workers fetch data in parallel
6. Each worker paginates through ALL records
7. Buffer files written per page
8. AppendWriter consolidates to final JSONL
9. Python script compares JSONL files
10. Results returned as CSV/JSON

### Record Limits:
- **SOQL**: 50K hard limit (Salesforce platform)
- **GraphQL**: NO LIMIT (pagination support)
- **JSONL**: NO LIMIT
- **Python**: NO LIMIT (chunk_size is for memory efficiency)
- **UI**: Previously showed both options, now GraphQL only

## Configuration Files

### Comparison Configuration Format:
```json
{
  "version": "2.0.0",
  "orgs": [...],
  "objects": {
    "ObjectName": {
      "fields": [...],
      "foreignKey": "...",
      "orgFilters": {...}
    }
  },
  "fetchMethod": "graphql"  // Always graphql now
}
```

## Windows Python Embedding

Location: `/py/` directory
Contents:
- Python 3.13 executable
- Core libraries
- install-dependencies.bat for packages

## Performance Optimizations

1. **Parallel Workers**: 2-4 concurrent fetchers
2. **Buffer Files**: Prevents memory overload
3. **Set-based Comparison**: O(n) vs O(n²) performance
4. **Parquet Caching**: JSONL converted to Parquet
5. **Streaming**: File append operations

## Security Considerations

1. File path sanitization
2. Input validation
3. No hardcoded credentials
4. Proper error handling
5. File locking for concurrent access

## Recent Changes Summary

1. **Removed SOQL mode** - Only GraphQL now
2. **Deleted fetcher.js and spawnFetchers.js**
3. **Updated UI** - No fetch method selector
4. **Always unlimited records** via pagination
5. **Simplified codebase** - One path instead of two