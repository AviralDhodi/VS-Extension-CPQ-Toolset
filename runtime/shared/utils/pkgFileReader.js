// CPQ Toolset v3 - File Reader Utility
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');

/**
 * Read file
 */
function readFileSync(filePath, encoding = 'utf8') {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch (error) {
    logger.error('Failed to read file:', { filePath, error: error.message });
    throw error;
  }
}

/**
 * Check if file exists
 */
function existsSync(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

/**
 * Get the correct path
 */
function resolvePath(basePath, ...segments) {
  return path.join(basePath, ...segments);
}

/**
 * Write file
 */
function writeFileSync(filePath, data, encoding = 'utf8') {
  return fs.writeFileSync(filePath, data, encoding);
}

/**
 * Create directory
 */
function mkdirSync(dirPath, options) {
  return fs.mkdirSync(dirPath, options);
}

/**
 * Read directory
 */
function readdirSync(dirPath, options) {
  return fs.readdirSync(dirPath, options);
}

/**
 * Get file stats
 */
function statSync(filePath) {
  return fs.statSync(filePath);
}

/**
 * Copy file
 */
function copyFileSync(src, dest, flags) {
  return fs.copyFileSync(src, dest, flags);
}

module.exports = {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  resolvePath
};