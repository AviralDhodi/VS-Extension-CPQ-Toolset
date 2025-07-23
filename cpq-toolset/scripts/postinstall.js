#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Running post-install setup...\n');

// Check Python installation
console.log('Checking Python installation...');
try {
  const pythonCommands = ['python3', 'python', 'py'];
  let pythonFound = false;
  let pythonCmd = '';
  
  for (const cmd of pythonCommands) {
    try {
      const version = execSync(`${cmd} --version`, { encoding: 'utf8' }).trim();
      console.log(`Found: ${version}`);
      pythonFound = true;
      pythonCmd = cmd;
      break;
    } catch (e) {
      // Continue to next command
    }
  }
  
  if (!pythonFound) {
    console.warn('WARNING: Python not found. Please install Python 3.8 or higher.');
    console.warn('The data comparison features will not work without Python.\n');
  } else {
    // Check Python version
    const versionOutput = execSync(`${pythonCmd} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"`, { encoding: 'utf8' }).trim();
    const [major, minor] = versionOutput.split('.').map(Number);
    
    if (major < 3 || (major === 3 && minor < 8)) {
      console.warn(`WARNING: Python ${versionOutput} detected. Python 3.8+ is recommended.`);
    } else {
      console.log(`Python ${versionOutput} is installed and compatible.`);
    }
  }
} catch (error) {
  console.warn('WARNING: Could not check Python version:', error.message);
}

// Check Salesforce CLI
console.log('\nChecking Salesforce CLI...');
try {
  const sfCommands = ['sf', 'sfdx'];
  let sfFound = false;
  
  for (const cmd of sfCommands) {
    try {
      const version = execSync(`${cmd} --version`, { encoding: 'utf8' }).trim();
      console.log(`Found: ${version}`);
      sfFound = true;
      break;
    } catch (e) {
      // Continue to next command
    }
  }
  
  if (!sfFound) {
    console.warn('WARNING: Salesforce CLI not found. Please install the Salesforce CLI.');
    console.warn('Visit: https://developer.salesforce.com/tools/sfdxcli\n');
  }
} catch (error) {
  console.warn('WARNING: Could not check Salesforce CLI:', error.message);
}

// Create necessary directories
console.log('\nCreating directory structure...');
const dirs = [
  'logs',
  'tmp',
  'tmp/uploads',
  'apps/data-comparison/storage',
  'apps/data-comparison/storage/config',
  'apps/data-comparison/storage/data-extract',
  'apps/data-comparison/storage/results',
  'apps/data-comparison/storage/uploads'
];

const rootDir = path.join(__dirname, '..');
dirs.forEach(dir => {
  const fullPath = path.join(rootDir, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created: ${dir}`);
  }
});

// Create .gitignore for storage directories
const gitignoreContent = `# Ignore all files in storage directories
*
!.gitignore
`;

const storageGitignorePaths = [
  'apps/data-comparison/storage/config/.gitignore',
  'apps/data-comparison/storage/data-extract/.gitignore',
  'apps/data-comparison/storage/results/.gitignore',
  'apps/data-comparison/storage/uploads/.gitignore',
  'tmp/uploads/.gitignore',
  'logs/.gitignore'
];

storageGitignorePaths.forEach(gitignorePath => {
  const fullPath = path.join(rootDir, gitignorePath);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, gitignoreContent);
  }
});

console.log('\nPost-install setup completed!');
console.log('\nNext steps:');
console.log('1. Run "npm run build" to build the project');
console.log('2. Run "npm run package" to create the VS Code extension');
console.log('3. Or run "npm run dev" to start in development mode\n');