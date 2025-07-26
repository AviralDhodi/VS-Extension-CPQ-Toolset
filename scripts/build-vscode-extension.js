#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Building VS Code Extension for CPQ Toolset v3\n');

// Check if vsce is installed
try {
    execSync('vsce --version', { stdio: 'ignore' });
} catch (error) {
    console.error('❌ vsce is not installed. Please install it first:');
    console.error('   npm install -g @vscode/vsce\n');
    process.exit(1);
}

// Check required files
const requiredFiles = [
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'extension.js',
    '.vscodeignore'
];

console.log('📋 Checking required files...');
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
    console.error('❌ Missing required files:');
    missingFiles.forEach(file => console.error(`   - ${file}`));
    
    if (missingFiles.includes('icon.png')) {
        console.log('\n💡 To create an icon, see create-icon.md');
    }
    process.exit(1);
}

// Check if icon exists (warning only)
if (!fs.existsSync('icon.png')) {
    console.warn('⚠️  Warning: icon.png not found. Extension will use default icon.');
    console.warn('   See create-icon.md for instructions on creating an icon.\n');
}

// Check if executables exist
console.log('📦 Checking for pkg executables...');
const distBinPath = path.join('dist', 'bin');
if (!fs.existsSync(distBinPath)) {
    console.log('   No executables found. Building them now...');
    try {
        execSync('npm run build:pkg', { stdio: 'inherit' });
    } catch (error) {
        console.error('❌ Failed to build executables');
        process.exit(1);
    }
}

// List executables
const executables = fs.readdirSync(distBinPath).filter(f => 
    f.startsWith('cpq-toolset-v3-')
);
console.log(`   Found ${executables.length} executables:`);
executables.forEach(exe => {
    const stats = fs.statSync(path.join(distBinPath, exe));
    console.log(`   - ${exe} (${Math.round(stats.size / 1024 / 1024)}MB)`);
});

// Clean any existing .vsix files
console.log('\n🧹 Cleaning old .vsix files...');
const oldVsix = fs.readdirSync('.').filter(f => f.endsWith('.vsix'));
oldVsix.forEach(file => {
    fs.unlinkSync(file);
    console.log(`   Removed ${file}`);
});

// Package the extension
console.log('\n📦 Packaging extension...');
try {
    const output = execSync('vsce package', { encoding: 'utf8' });
    console.log(output);
    
    // Find the created .vsix file
    const vsixFile = fs.readdirSync('.').find(f => f.endsWith('.vsix'));
    if (vsixFile) {
        const stats = fs.statSync(vsixFile);
        console.log(`\n✅ Extension packaged successfully!`);
        console.log(`   File: ${vsixFile}`);
        console.log(`   Size: ${Math.round(stats.size / 1024 / 1024)}MB`);
        
        console.log('\n📝 Next steps:');
        console.log('   1. Test locally:');
        console.log(`      code --install-extension ${vsixFile}`);
        console.log('\n   2. Publish to marketplace:');
        console.log('      vsce publish');
        console.log('\n   See vsc-extension-build.md for detailed instructions.');
    }
} catch (error) {
    console.error('❌ Failed to package extension:');
    console.error(error.message);
    
    // Common errors and solutions
    if (error.message.includes('LICENSE')) {
        console.log('\n💡 Make sure LICENSE file exists');
    }
    if (error.message.includes('README')) {
        console.log('\n💡 Make sure README.md is properly formatted');
    }
    if (error.message.includes('repository')) {
        console.log('\n💡 Add repository field to package.json');
    }
    
    process.exit(1);
}

console.log('\n🎉 Done!');