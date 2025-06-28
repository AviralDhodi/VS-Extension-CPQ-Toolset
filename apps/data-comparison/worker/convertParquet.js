const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { createLogger } = require('../../../shared/utils/logger');

const logger = createLogger({ appName: 'ParquetWriter', location: 'worker/convertParquet' });

function inferParquetType(value) {
    logger.debug('Inferring Parquet type', { value, valueType: typeof value, isNull: value === null });
    
    // Handle null values - default to UTF8 and make optional
    if (value === null || value === undefined) {
        logger.debug('Null value detected, defaulting to optional UTF8', { value });
        return { type: 'UTF8', optional: true };
    }
    
    if (typeof value === 'string') return { type: 'UTF8' };
    if (typeof value === 'number') return Number.isInteger(value) ? { type: 'INT64' } : { type: 'DOUBLE' };
    if (typeof value === 'boolean') return { type: 'BOOLEAN' };
    return { type: 'UTF8' };
}

function sanitizeKeys(record) {
    const originalKeys = Object.keys(record);
    logger.debug('Sanitizing record keys', { originalKeys });
    
    const clean = {};
    for (const [key, value] of Object.entries(record)) {
        const cleanKey = key.replace(/\./g, '_');
        clean[cleanKey] = value;
        
        if (key !== cleanKey) {
            logger.debug('Key sanitized', { originalKey: key, cleanKey });
        }
    }
    
    const cleanKeys = Object.keys(clean);
    logger.debug('Sanitization complete', { 
        originalCount: originalKeys.length, 
        cleanCount: cleanKeys.length,
        cleanKeys: cleanKeys.slice(0, 10) // Show first 10 for debugging
    });
    
    return clean;
}

async function convertJsonlToParquet(extractedPath) {
    logger.info('Starting JSONL to Parquet conversion', { extractedPath });
    
    // Note: This is a placeholder for Parquet conversion
    // In v2, we'll focus on Python processing instead of Node.js Parquet
    // The Python script will handle Parquet conversion more efficiently
    
    const comparisonId = path.basename(extractedPath);
    logger.info('Processing comparison directory', { comparisonId, fullPath: extractedPath });
    
    const stat = fs.statSync(extractedPath);
    if (!stat.isDirectory()) {
        logger.error('Extracted path is not a directory', { extractedPath });
        return;
    }

    const orgDirs = fs.readdirSync(extractedPath).filter(f => f !== '.buffers');
    logger.info('Found organization directories', { comparisonId, orgDirs, count: orgDirs.length });

    // For now, we'll just validate the JSONL files and prepare them for Python processing
    for (const orgId of orgDirs) {
        logger.info('Processing organization directory', { comparisonId, orgId });
        
        const orgPath = path.join(extractedPath, orgId);
        const orgStat = fs.statSync(orgPath);
        
        if (!orgStat.isDirectory()) {
            logger.debug('Skipping non-directory org', { orgId, isFile: orgStat.isFile() });
            continue;
        }

        const files = fs.readdirSync(orgPath).filter(f => f.endsWith('.jsonl'));
        logger.info('Found JSONL files in org', { comparisonId, orgId, files, count: files.length });

        for (const jsonlFile of files) {
            logger.info('Validating JSONL file', { comparisonId, orgId, jsonlFile });
            
            const jsonlPath = path.join(orgPath, jsonlFile);
            
            try {
                const rl = readline.createInterface({
                    input: fs.createReadStream(jsonlPath),
                    crlfDelay: Infinity
                });

                let lineCount = 0;
                let validRecords = 0;
                
                for await (const line of rl) {
                    lineCount++;
                    if (!line.trim()) continue;
                    
                    try {
                        const parsed = JSON.parse(line);
                        if (parsed && typeof parsed === 'object') {
                            validRecords++;
                        }
                    } catch (parseError) {
                        logger.warn('Invalid JSON line found', { 
                            jsonlFile, 
                            lineNumber: lineCount, 
                            error: parseError.message 
                        });
                    }
                }

                logger.info('JSONL file validation complete', { 
                    comparisonId, 
                    orgId, 
                    jsonlFile, 
                    totalLines: lineCount, 
                    validRecords 
                });

                // Create a metadata file for the Python processor
                const metadataPath = jsonlPath.replace('.jsonl', '.metadata.json');
                const metadata = {
                    source: 'cpq-toolset-v2',
                    comparisonId,
                    orgId,
                    objectName: jsonlFile.replace('.jsonl', ''),
                    totalLines: lineCount,
                    validRecords,
                    createdAt: new Date().toISOString(),
                    readyForParquetConversion: validRecords > 0
                };
                
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                logger.info('Created metadata file for Python processing', { 
                    metadataPath, 
                    readyForConversion: metadata.readyForParquetConversion 
                });

            } catch (err) {
                logger.error('Failed JSONL validation', {
                    file: jsonlFile,
                    orgId,
                    comparisonId,
                    jsonlPath,
                    error: err.message
                });
            }
        }
    }
    
    logger.info('JSONL validation and metadata generation complete', { 
        comparisonId, 
        extractedPath,
        note: 'Files are ready for Python Parquet conversion'
    });
}

// Simplified conversion that just prepares data for Python processing
async function prepareDataForPython(extractedPath) {
    logger.info('Preparing data for Python processing', { extractedPath });
    
    const comparisonId = path.basename(extractedPath);
    const pythonReadyFile = path.join(extractedPath, 'python_ready.json');
    
    const summary = {
        comparisonId,
        extractedPath,
        preparedAt: new Date().toISOString(),
        status: 'ready_for_python_processing',
        orgDirectories: []
    };
    
    try {
        const orgDirs = fs.readdirSync(extractedPath).filter(f => f !== '.buffers');
        
        for (const orgDir of orgDirs) {
            const orgPath = path.join(extractedPath, orgDir);
            if (!fs.statSync(orgPath).isDirectory()) continue;
            
            const jsonlFiles = fs.readdirSync(orgPath).filter(f => f.endsWith('.jsonl'));
            
            summary.orgDirectories.push({
                orgId: orgDir,
                orgPath,
                jsonlFiles: jsonlFiles.map(file => ({
                    filename: file,
                    path: path.join(orgPath, file),
                    size: fs.statSync(path.join(orgPath, file)).size
                }))
            });
        }
        
        fs.writeFileSync(pythonReadyFile, JSON.stringify(summary, null, 2));
        logger.info('Data preparation complete', { 
            pythonReadyFile, 
            orgCount: summary.orgDirectories.length 
        });
        
        return summary;
        
    } catch (error) {
        logger.error('Failed to prepare data for Python', { 
            extractedPath, 
            error: error.message 
        });
        throw error;
    }
}

module.exports = { 
    convertJsonlToParquet, 
    prepareDataForPython 
};