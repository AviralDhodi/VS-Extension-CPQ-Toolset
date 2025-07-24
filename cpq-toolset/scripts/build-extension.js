#!/usr/bin/env node
/**
 * Build script for VS Code extension packaging
 * Creates a bundled server.js using esbuild
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

const projectRoot = path.join(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

console.log('📦 Building VS Code Extension Bundle...\n');

async function buildExtension() {
  try {
    // Step 1: Ensure dist directory exists
    console.log('📁 Creating dist directory...');
    await fs.ensureDir(distDir);
    
    // Step 2: Bundle server.js with esbuild
    console.log('🔨 Bundling server.js with esbuild...');
    
    await esbuild.build({
      entryPoints: [path.join(projectRoot, 'server.js')],
      bundle: true,
      platform: 'node',
      target: 'node16',
      outfile: path.join(distDir, 'server-bundle.js'),
      external: [
        'vscode',
        'sqlite3',
        'python-shell',
        // Native modules that can't be bundled
        'fsevents',
        'bufferutil',
        'utf-8-validate'
      ],
      minify: false, // Keep readable for debugging
      sourcemap: true,
      define: {
        'process.env.CPQ_BUNDLED': '"true"'
      }
    });
    
    console.log('  ✅ Server bundle created');
    
    // Step 3: Copy extension files
    console.log('📋 Copying extension files...');
    const extensionFiles = [
      'extension.js',
      'package.json',
      'README.md',
      'LICENSE',
      'icon.png',
      '.vscodeignore'
    ];
    
    for (const file of extensionFiles) {
      const src = path.join(projectRoot, file);
      const dest = path.join(distDir, file);
      
      if (await fs.pathExists(src)) {
        console.log(`  - Copying ${file}...`);
        await fs.copy(src, dest);
      }
    }
    
    // Step 4: Copy runtime directory
    console.log('📋 Copying runtime directory...');
    const runtimeSrc = path.join(projectRoot, 'runtime');
    const runtimeDest = path.join(distDir, 'runtime');
    
    if (await fs.pathExists(runtimeSrc)) {
      await fs.copy(runtimeSrc, runtimeDest);
      console.log('  ✅ Runtime directory copied');
    } else {
      console.warn('  ⚠️  Runtime directory not found. Run "npm run build" first!');
    }
    
    // Step 5: Update extension.js to use bundled server
    console.log('🔧 Updating extension.js for bundled mode...');
    let extensionContent = await fs.readFile(path.join(distDir, 'extension.js'), 'utf8');
    extensionContent = extensionContent.replace(
      'server.js',
      'server-bundle.js'
    );
    await fs.writeFile(path.join(distDir, 'extension.js'), extensionContent);
    
    // Step 6: Create .vscodeignore if it doesn't exist
    console.log('📝 Creating .vscodeignore...');
    const vscodeignoreContent = `
# Source files
apps/**
shared/**
scripts/**
node_modules/**
!runtime/**

# Development files
.git/**
.gitignore
*.log
logs/**
.DS_Store
*.map

# Build files
src/**
tsconfig.json
webpack.config.js
.eslintrc*

# Keep only necessary files
!dist/server-bundle.js
!dist/extension.js
!dist/runtime/**
!py/**
`;
    
    await fs.writeFile(path.join(distDir, '.vscodeignore'), vscodeignoreContent.trim());
    
    console.log('\n✅ Extension build completed!');
    console.log(`📁 Output directory: ${distDir}`);
    console.log('\n📌 Next steps:');
    console.log('  1. cd dist');
    console.log('  2. vsce package');
    console.log('  3. Install the .vsix file in VS Code');
    
  } catch (error) {
    console.error('\n❌ Extension build failed:', error.message);
    process.exit(1);
  }
}

// Run the build
buildExtension();