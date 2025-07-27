# Salesforce Comparison Toolset

A VS Code extension for comparing Salesforce data and analyzing permissions across multiple organizations. Works on Windows without requiring Node.js or Python installation.

## Overview

Salesforce Comparison Toolset is designed for Salesforce developers and administrators who need to:
- Compare CPQ configurations between multiple Salesforce orgs (UAT, Production, Dev, etc.)
- Analyze and compare permissions across organizations
- Ensure data consistency for CPQ objects like Price Rules, Price Conditions, and Price Actions
- Export detailed comparison reports in CSV and JSON formats

## Key Features

### Data Comparison Tool
- **Multi-org Support**: Compare data across unlimited Salesforce organizations simultaneously
- **Universal Object Support**: Works with any Salesforce object (standard and custom)
- **Smart Field Mapping**: Configure field-level comparisons with foreign key relationships
- **Unlimited Records**: Automatic pagination handles datasets of any size
- **Duplicate Detection**: Automatically identify and resolve duplicate foreign keys
- **Git-style Diff Viewer**: Visual field-level comparisons with inline differences
- **Flexible Export**: Results available in CSV and JSON formats

### Permissions Analyser
- **Comprehensive Coverage**: Compare Profiles, Permission Sets, Permission Set Groups, and Muting Permission Sets
- **Dynamic Metadata**: Automatically retrieves metadata based on org structure
- **Permission Discovery**: Identify common and unique permissions across orgs
- **Detailed Reports**: Export comprehensive comparison reports with all differences

### Platform Features
- **100% Local Processing**: All data processing happens locally on your machine - no cloud servers, no external APIs
- **Zero Session Storage**: No Salesforce credentials or session tokens are stored - uses existing SF CLI authentication
- **Windows All-in-One**: Complete standalone package for Windows - no dependencies required
- **Auto Port Management**: Automatically clears port conflicts on startup
- **Performance Optimized**: Parallel worker processes with configurable concurrency
- **Configuration Management**: Save and reuse comparison configurations
- **SLDS UI**: Salesforce Lightning Design System interface

## Requirements

### For Windows Users
- **Salesforce CLI**: Install sf (v2) or sfdx CLI and authenticate with your orgs
- **That's it!** Everything else is included in the extension

### For Mac/Linux Users
- **Salesforce CLI**: Install sf (v2) or sfdx CLI and authenticate with your orgs
- **Python**: Version 3.7+ required
- **Node.js**: Version 16.0.0 or higher

### VS Code Requirements
- **VS Code**: Version 1.74.0 or higher

## Security & Privacy

- **Local-Only Architecture**: All processing happens on your local machine
- **No Cloud Dependencies**: No data is sent to external servers
- **SF CLI Integration**: Uses your existing Salesforce CLI authentication
- **No Credential Storage**: The extension never stores usernames, passwords, or session tokens
- **Temporary Data Only**: Comparison data is stored temporarily and can be cleared anytime

## Quick Start

1. **Install the Extension**
   - Search for "Salesforce Comparison Toolset" in VS Code Extensions
   - Click Install

2. **Launch the Application**
   - Press Cmd+Shift+C (Mac) or Ctrl+Shift+C (Windows/Linux)
   - Or use Command Palette: "Salesforce: Launch Salesforce Comparison Toolset"

3. **Access the Interface**
   - The application opens in your default browser at http://localhost:3030
   - Choose between Data Comparison or Permissions Analyser

## Usage Guide

### Data Comparison Workflow

1. **Organization Selection**
   - Select 2 or more authenticated Salesforce orgs
   - The tool automatically detects all authenticated orgs via SF CLI

2. **Object Configuration**
   - Choose objects to compare (e.g., SBQQ__PriceRule__c, SBQQ__PriceAction__c)
   - Select specific fields for comparison
   - Define foreign keys for record matching
   - Configure lookup relationship validations

3. **Comparison Execution**
   - Save your configuration for future use
   - Run the comparison process
   - Monitor progress with real-time updates

4. **Results Analysis**
   - Browse differences in the interactive viewer
   - Filter by difference types (Added, Modified, Deleted)
   - Export results as CSV or JSON
   - View detailed field-level changes

### Permissions Analyser Workflow

1. **Setup**
   - Select up to 2 organizations for comparison
   - Choose permission types to analyze

2. **Configuration**
   - Select specific Profiles, Permission Sets, or Groups
   - Configure which permission types to compare
   - Choose metadata elements for analysis

3. **Analysis**
   - Run the comparison
   - View results in real-time
   - Download detailed CSV reports

## Extension Settings

Configure the extension through VS Code settings:

```json
{
  "cpq-toolset.salesforceCliPath": "",
  "cpq-toolset.pythonPath": "",
  "cpq-toolset.enableDebugLogging": false,
  "cpq-toolset.defaultTimeout": 30000,
  "cpq-toolset.maxConcurrentWorkers": 3
}
```

## Troubleshooting

### Port 3030 Already in Use
The extension automatically attempts to clear port conflicts. If issues persist:
- Windows: The launcher script handles port clearing automatically
- Mac/Linux: Use `lsof -ti :3030 | xargs kill -9`

### Salesforce CLI Not Found
1. Ensure SF CLI is installed: `npm install -g @salesforce/cli`
2. Verify authentication: `sf org list`
3. Set custom path in VS Code settings if needed

### Python Not Found (Mac/Linux only)
- Windows: Python is included - no action needed
- Mac/Linux: Ensure Python 3.7+ is installed
- Set custom Python path in VS Code settings if needed

### Large Dataset Handling
- The tool automatically paginates through unlimited records
- No record limits - handles datasets of any size
- Adjust worker concurrency in settings for better performance

## Recent Updates

### v3.1.5 (2025-07-26)
- Removed record limits - now supports unlimited records through automatic pagination
- Simplified data fetching to use only the optimized GraphQL approach
- Improved UI by removing confusing fetch method options
- Fixed module import issues for better reliability
- Enhanced security documentation

### v3.1.3 (2025-07-26)
- Added proper icon support for VS Code marketplace
- Fixed package.json icon reference

### v3.1.0 (2025-07-26)
- Renamed to Salesforce Comparison Toolset
- Windows users no longer need Node.js installation
- Bundled Node.js v22.17.1 for Windows x64
- Automatic port conflict resolution
- Fixed all pkg-related compatibility issues
- Cleaner, more maintainable codebase

### v3.0.14 (2025-07-25)
- Fixed worker process spawning in production
- Resolved routing conflicts between applications
- Improved error handling and logging
- Enhanced SLDS integration

## Known Limitations

1. **Permissions Analyser**: Maximum 2 organizations for comparison
2. **Python Dependencies**: First run on Mac/Linux may require installing Python packages

## Support & Feedback

- **Issues**: [GitHub Issues](https://github.com/AviralDhodi/VS-Extension-CPQ-Toolset/issues)
- **Feature Requests**: Use GitHub Issues with "enhancement" label
- **Questions**: Create a discussion on GitHub

## License

This project is licensed under the MIT License.

---

**Built by Aviral Dhodi**