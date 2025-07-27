# Salesforce Comparison Toolset - Code Documentation

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Data Flow](#data-flow)
4. [50K Record Limitation Analysis](#50k-record-limitation-analysis)
5. [Key Files and Functions](#key-files-and-functions)

## Architecture Overview

The application is a VS Code extension that launches a local Express server (port 3030) to provide a web-based interface for Salesforce data comparison and permissions analysis.

### Technology Stack
- **Frontend**: HTML, CSS (SLDS), Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Data Processing**: Python scripts for comparison logic
- **Salesforce Integration**: SF CLI (sf/sfdx commands)
- **VS Code Extension**: JavaScript with VS Code API

### Directory Structure
```
/Extension 2/
├── extension.js          # VS Code extension entry point
├── server.js            # Express server main file
├── shared/              # Shared utilities and modules
│   └── utils/
│       ├── pathResolver.js    # Path resolution for bundled/dev modes
│       ├── sfdxRunner.js      # Salesforce CLI wrapper
│       ├── graphqlRunner.js   # GraphQL query builder/executor
│       ├── pythonRunner.js    # Python script executor
│       └── logger.js          # Winston logger
├── apps/                # Application modules
│   ├── data-comparison/
│   │   ├── routes/          # Express routes
│   │   ├── worker/          # Worker processes for data fetching
│   │   ├── python/          # Python comparison scripts
│   │   └── components/      # UI components
│   └── permissions-analyser/
│       └── [similar structure]
└── scripts/             # Build and deployment scripts
```

## Core Components

### 1. VS Code Extension (`extension.js`)
- **Purpose**: Manages VS Code integration and server lifecycle
- **Key Functions**:
  - `activate()`: Registers commands and starts extension
  - `launchCPQToolset()`: Starts server and opens browser
  - `killProcessOnPort()`: Clears port conflicts before starting
  - `getNodeExecutable()`: Finds bundled or system Node.js

### 2. Express Server (`server.js`)
- **Purpose**: HTTP server providing REST API and serving UI
- **Key Features**:
  - Dynamic app loading from `/apps` directory
  - File upload handling with multer
  - Compression and CORS middleware
  - Health check and debug endpoints

### 3. Path Resolver (`shared/utils/pathResolver.js`)
- **Purpose**: Handles path resolution for bundled vs development modes
- **Singleton Pattern**: Ensures consistent path resolution
- **Key Methods**:
  - `resolve()`: Base path resolution
  - `resolveRuntime()`: Runtime-specific paths (different in bundled mode)
  - `getAppPath()`: App-specific paths

### 4. SFDX Runner (`shared/utils/sfdxRunner.js`)
- **Purpose**: Wrapper for Salesforce CLI commands
- **Features**:
  - Auto-detects sf vs sfdx CLI
  - Executes SOQL queries
  - Retrieves org metadata
  - Lists objects and fields

### 5. GraphQL Runner (`shared/utils/graphqlRunner.js`)
- **Purpose**: Builds and executes SOQL queries
- **Key Functions**:
  - `buildSOQLQuery()`: Constructs SOQL with filters
  - `fetchObjectDataForOrg()`: Fetches data from specific org
  - **LIMIT**: Default 50,000 records per query

## Data Flow

### Data Comparison Workflow

1. **Configuration Phase**:
   - User selects orgs and objects via UI
   - Configuration saved to JSON file
   - Field mappings and filters defined

2. **Data Fetching Phase**:
   - `spawnGraphQLFetchers.js` creates worker processes
   - Workers execute parallel data fetches
   - Data written to JSONL buffer files
   - `bufferAppendWriter.js` consolidates buffers

3. **Comparison Phase**:
   - Python script `multi_org_comparison.py` runs
   - Reads JSONL files and compares records
   - Outputs differences to CSV/JSON

### Worker Process Architecture

```
Main Process
    ├── spawnGraphQLFetchers.js (orchestrator)
    │   ├── graphqlFetcher.js (worker 1)
    │   ├── graphqlFetcher.js (worker 2)
    │   └── graphqlFetcher.js (worker N)
    └── bufferAppendWriter.js (consolidator)
```

## 50K Record Limitation Analysis

### Where the Limit Exists

1. **`graphqlRunner.js` Line 81-82**:
```javascript
const limit = orgSpecificFilters.limit || 50000
query += ` LIMIT ${limit}`
```

2. **Python Scripts** (default chunk_size):
```python
chunk_size = 50000  # Default processing chunk
```

3. **UI Display**:
- "SOQL (Fast, up to 50K records per object)"

### Why the Limit Exists

1. **Salesforce Governor Limits**:
   - SOQL queries have a maximum of 50,000 records per query
   - This is a Salesforce platform limitation, not self-imposed

2. **Memory Management**:
   - Loading large datasets into memory can cause issues
   - Python scripts process in 50K chunks for efficiency

3. **Performance**:
   - Larger queries take longer and may timeout
   - UI responsiveness degrades with massive datasets

### Can It Be Bypassed?

**YES, through pagination**, but with caveats:

1. **GraphQL Fetcher (`graphqlFetcher.js`) ALREADY supports pagination**:
```javascript
while (hasNextPage) {
    const result = await executeGraphQLQuery(query, orgUsername, cursor);
    // ... process records ...
    hasNextPage = queryData.pageInfo?.hasNextPage || false;
    cursor = queryData.pageInfo?.endCursor;
}
```

2. **The 50K limit in `graphqlRunner.js` is for SOQL, not GraphQL**:
   - SOQL has hard 50K limit per query
   - GraphQL can paginate beyond 50K using cursors

3. **Current Implementation**:
   - GraphQL path: Can fetch unlimited records via pagination
   - SOQL path: Limited to 50K per object

### Concurrent Workers and Pagination

The system uses concurrent workers effectively:
- Multiple workers process different objects in parallel
- Each worker can paginate through large datasets
- Buffer files are written per page, then consolidated

**The 50K limitation is primarily a SOQL constraint, not a design limitation.**

## Key Files and Functions

### Critical Data Fetching Files

1. **`apps/data-comparison/worker/spawnGraphQLFetchers.js`**
   - Orchestrates parallel worker processes
   - Manages buffer directory
   - Configurable worker count (default 2-4)

2. **`apps/data-comparison/worker/graphqlFetcher.js`**
   - Executes GraphQL queries with pagination
   - Writes buffer files per page
   - Handles cursor-based pagination

3. **`apps/data-comparison/worker/fetcher.js`**
   - Alternative SOQL-based fetcher
   - Subject to 50K record limit
   - Single query execution

4. **`shared/utils/graphqlCLIRunner.js`**
   - GraphQL query builder
   - Executes via SF CLI
   - Handles pagination metadata

### Python Processing Scripts

1. **`multi_org_comparison.py`**
   - Main comparison logic
   - Processes JSONL files
   - Identifies differences

2. **`duplicate_fk_detector.py`**
   - Detects duplicate foreign keys
   - Runs before main comparison

### Configuration Management

1. **Configuration Storage**:
   - Saved in `apps/*/storage/config/`
   - JSON format with org and object details

2. **State Management**:
   - `apps/*/state/index.js` manages app state
   - Tracks comparison progress

## Recommendations

### To Handle Datasets Larger Than 50K:

1. **Use GraphQL Path** (Already Implemented):
   - The system already supports unlimited records via GraphQL pagination
   - Ensure UI selects GraphQL option, not SOQL

2. **Optimize Worker Count**:
   - Increase `maxConcurrentWorkers` for better parallelism
   - Monitor memory usage with large datasets

3. **Implement Streaming**:
   - Current buffer approach is good
   - Consider streaming JSON parsing for very large files

4. **Add Progress Indicators**:
   - Show pagination progress in UI
   - Estimate total records before fetching

### Code Quality Observations

1. **Good Practices**:
   - Singleton patterns for shared resources
   - Worker processes for parallelism
   - Proper error handling and logging
   - Configuration-driven architecture

2. **Areas for Improvement**:
   - Some code duplication between apps
   - Mixed async patterns (callbacks vs promises)
   - Limited TypeScript usage

3. **Security Considerations**:
   - Input validation exists but could be stronger
   - File paths are properly sanitized
   - No obvious security vulnerabilities

## Conclusion

The 50K record limitation is primarily a Salesforce SOQL constraint, not an architectural limitation. The system already supports fetching unlimited records through GraphQL pagination with concurrent workers. The architecture is well-designed for parallel processing and can handle large datasets effectively when using the GraphQL path.