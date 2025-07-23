#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// Base URL for SLDS CDN
const SLDS_BASE_URL = 'https://cdn.jsdelivr.net/npm/@salesforce-ux/design-system@2.24.3/assets/icons';

// Icon sprite files to download
const SPRITE_FILES = [
  'standard-sprite/svg/symbols.svg',
  'utility-sprite/svg/symbols.svg',
  'action-sprite/svg/symbols.svg',
  'custom-sprite/svg/symbols.svg',
  'doctype-sprite/svg/symbols.svg'
];

// Local assets directory
const LOCAL_ASSETS_DIR = path.join(__dirname, '..', 'shared', 'assets', 'slds', 'icons');

// Function to download a file
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(destPath);
    
    https.get(url, (response) => {
      if (response.statusCode === 200) {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`✓ Downloaded: ${path.basename(destPath)}`);
          resolve();
        });
      } else {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Main function
async function downloadSLDSIcons() {
  console.log('Starting SLDS icon download...\n');
  
  for (const spriteFile of SPRITE_FILES) {
    const url = `${SLDS_BASE_URL}/${spriteFile}`;
    const destPath = path.join(LOCAL_ASSETS_DIR, spriteFile);
    
    try {
      await downloadFile(url, destPath);
    } catch (error) {
      console.error(`✗ Error downloading ${spriteFile}: ${error.message}`);
    }
  }
  
  console.log('\nSLDS icon download complete!');
  console.log(`Icons saved to: ${LOCAL_ASSETS_DIR}`);
}

// Function to update HTML files to use local paths
function updateHTMLFiles() {
  console.log('\nUpdating HTML files to use local SLDS assets...\n');
  
  const htmlFiles = [];
  
  // Find all HTML files in the project
  function findHTMLFiles(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        findHTMLFiles(fullPath);
      } else if (file.endsWith('.html')) {
        htmlFiles.push(fullPath);
      }
    }
  }
  
  // Start from project root
  findHTMLFiles(path.join(__dirname, '..'));
  
  // Pattern to match SLDS CDN URLs
  const cdnPattern = /https:\/\/cdn\.jsdelivr\.net\/npm\/@salesforce-ux\/design-system@[\d.]+\/assets\/icons\//g;
  
  // Replace with local path
  const localPath = '/shared/assets/slds/icons/';
  
  let updatedCount = 0;
  
  for (const htmlFile of htmlFiles) {
    let content = fs.readFileSync(htmlFile, 'utf8');
    const originalContent = content;
    
    // Replace CDN URLs with local paths
    content = content.replace(cdnPattern, localPath);
    
    if (content !== originalContent) {
      fs.writeFileSync(htmlFile, content, 'utf8');
      console.log(`✓ Updated: ${path.relative(path.join(__dirname, '..'), htmlFile)}`);
      updatedCount++;
    }
  }
  
  console.log(`\nUpdated ${updatedCount} HTML files to use local SLDS assets.`);
}

// Run the download and update process
async function main() {
  try {
    await downloadSLDSIcons();
    updateHTMLFiles();
    
    console.log('\n✨ SLDS icon localization complete!');
    console.log('\nNote: Make sure your server is configured to serve static files from /shared/assets/');
  } catch (error) {
    console.error('Error during SLDS icon localization:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { downloadSLDSIcons, updateHTMLFiles };