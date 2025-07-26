#!/usr/bin/env node
/**
 * Build script for CPQ Toolset v3
 * Prepares the project for bundling and VS Code extension packaging
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const runtimeDir = path.join(projectRoot, 'runtime');
const distDir = path.join(projectRoot, 'dist');

console.log('🏗️  Building CPQ Toolset v3...\n');

async function build() {
  try {
    // Step 1: Clean previous builds
    console.log('🧹 Cleaning previous builds...');
    await fs.remove(runtimeDir);
    await fs.remove(distDir);
    
    // Step 2: Create runtime directory structure
    console.log('📁 Creating runtime directory...');
    await fs.ensureDir(runtimeDir);
    
    // Step 3: Copy necessary files to runtime
    console.log('📋 Copying files to runtime...');
    const filesToCopy = [
      'apps',
      'shared',
      'py',  // Python embedded directory
      'package.json',
      'server.js'
    ];
    
    for (const file of filesToCopy) {
      const src = path.join(projectRoot, file);
      const dest = path.join(runtimeDir, file);
      
      if (await fs.pathExists(src)) {
        console.log(`  - Copying ${file}...`);
        await fs.copy(src, dest, {
          filter: (src) => {
            // Skip node_modules, logs, and other unnecessary files
            if (src.includes('node_modules') || 
                src.includes('.git') || 
                src.includes('logs') ||
                src.includes('.DS_Store')) {
              return false;
            }
            return true;
          }
        });
      }
    }
    
    // Step 4: Create a minimal package.json for runtime
    console.log('📝 Creating runtime package.json...');
    const runtimePackageJson = {
      name: 'cpq-toolset-v3-runtime',
      version: '3.0.0',
      private: true,
      main: 'server.js',
      dependencies: {
        "compression": "^1.7.4",
        "cors": "^2.8.5",
        "csv-parse": "^5.5.3",
        "express": "^4.18.2",
        "glob": "^8.1.0",
        "multer": "^1.4.5-lts.1",
        "python-shell": "^5.0.0",
        "uuid": "^9.0.1",
        "xlsx": "^0.18.5"
      }
    };
    
    await fs.writeJson(
      path.join(runtimeDir, 'package.json'), 
      runtimePackageJson, 
      { spaces: 2 }
    );
    
    // Step 5: Install production dependencies in runtime
    console.log('📦 Installing runtime dependencies...');
    execSync('npm install --production', {
      cwd: runtimeDir,
      stdio: 'inherit'
    });
    
    // Step 6: Verify Python is bundled correctly
    console.log('🐍 Verifying Python bundle...');
    const pythonExePath = path.join(runtimeDir, 'py', 'python.exe');
    if (process.platform === 'win32' && await fs.pathExists(pythonExePath)) {
      console.log('  ✅ Python bundle found for Windows');
    } else if (process.platform !== 'win32') {
      console.log('  ℹ️  Non-Windows platform - Python will use system installation');
    } else {
      console.warn('  ⚠️  Python bundle not found for Windows!');
    }
    
    console.log('\n✅ Build completed successfully!');
    console.log(`📁 Runtime directory: ${runtimeDir}`);
    
  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
build();