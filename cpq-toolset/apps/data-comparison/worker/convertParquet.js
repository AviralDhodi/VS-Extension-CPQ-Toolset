const fs = require('fs');
const path = require('path');
const readline = require('readline');
const parquet = require('parquets');
const { createLogger } = require('../../../shared/logging/logger');

const logger = createLogger({ appName: 'ParquetWriter' });

function inferParquetType(value) {
  logger.debug('🔍 Inferring Parquet type', { value, valueType: typeof value, isNull: value === null });
  
  // Handle null values - default to UTF8 and make optional
  if (value === null || value === undefined) {
    logger.debug('🔍 Null value detected, defaulting to optional UTF8', { value });
    return { type: 'UTF8', optional: true };
  }
  
  if (typeof value === 'string') return { type: 'UTF8' };
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'INT64' } : { type: 'DOUBLE' };
  if (typeof value === 'boolean') return { type: 'BOOLEAN' };
  return { type: 'UTF8' };
}

function sanitizeKeys(record) {
  const originalKeys = Object.keys(record);
  logger.debug('🧹 Sanitizing record keys', { originalKeys });
  
  const clean = {};
  for (const [key, value] of Object.entries(record)) {
    const cleanKey = key.replace(/\./g, '_');
    clean[cleanKey] = value;
    
    if (key !== cleanKey) {
      logger.debug('🧹 Key sanitized', { originalKey: key, cleanKey });
    }
  }
  
  const cleanKeys = Object.keys(clean);
  logger.debug('🧹 Sanitization complete', { 
    originalCount: originalKeys.length, 
    cleanCount: cleanKeys.length,
    cleanKeys: cleanKeys.slice(0, 10) // Show first 10 for debugging
  });
  
  return clean;
}

async function convertJsonlToParquet(extractedPath) {
  logger.info('🚀 Starting JSONL to Parquet conversion', { extractedPath });
  
  // extractedPath is expected to be a specific comparison directory like:
  // 'c:\\Extension\\cpq-toolset\\apps\\data-comparison\\data-extract\\comp_1750089363031'
  const comparisonId = path.basename(extractedPath);
  logger.info('📁 Processing comparison directory', { comparisonId, fullPath: extractedPath });
  
  const stat = fs.statSync(extractedPath);
  if (!stat.isDirectory()) {
    logger.error('❌ Extracted path is not a directory', { extractedPath });
    return;
  }

  const orgDirs = fs.readdirSync(extractedPath).filter(f => f !== '.buffers');
  logger.info('🏢 Found organization directories', { comparisonId, orgDirs, count: orgDirs.length });

  await Promise.all(
    orgDirs.map(async orgId => {
      logger.info('🏢 Processing organization directory', { comparisonId, orgId });
      
      const orgPath = path.join(extractedPath, orgId);
      const orgStat = fs.statSync(orgPath);
      
      logger.debug('🔍 Checking org path type', { 
        comparisonId, 
        orgId, 
        orgPath, 
        isDirectory: orgStat.isDirectory(),
        isFile: orgStat.isFile()
      });
      
      if (!orgStat.isDirectory()) {
        logger.debug('⏭️ Skipping non-directory org (this is likely a .jsonl file)', { 
          orgId, 
          isFile: orgStat.isFile() 
        });
        return;
      }

      const files = fs.readdirSync(orgPath).filter(f => f.endsWith('.jsonl'));
      logger.info('📄 Found JSONL files in org', { comparisonId, orgId, files, count: files.length });

      for (const jsonlFile of files) {
        logger.info('📄 Starting conversion of file', { comparisonId, orgId, jsonlFile });
        
        const jsonlPath = path.join(orgPath, jsonlFile);
        const parquetPath = jsonlPath.replace('.jsonl', '.parquet');
        
        logger.debug('📂 File paths determined', { 
          comparisonId, 
          orgId, 
          jsonlFile, 
          jsonlPath, 
          parquetPath 
        });

        try {
          logger.debug('📖 Creating readline interface', { jsonlPath });
          const rl = readline.createInterface({
            input: fs.createReadStream(jsonlPath),
            crlfDelay: Infinity
          });

          const rows = [];
          let lineCount = 0;
          logger.debug('📖 Starting to read lines', { jsonlPath });
          
          for await (const line of rl) {
            lineCount++;
            if (!line.trim()) {
              logger.debug('⏭️ Skipping empty line', { jsonlPath, lineNumber: lineCount });
              continue;
            }
            
            logger.debug('📝 Parsing line', { jsonlPath, lineNumber: lineCount, linePreview: line.substring(0, 100) });
            const parsed = sanitizeKeys(JSON.parse(line));
            rows.push(parsed);
          }

          logger.info('📖 Finished reading file', { 
            comparisonId, 
            orgId, 
            jsonlFile, 
            totalLines: lineCount, 
            validRows: rows.length 
          });

          if (rows.length === 0) {
            logger.warn('⚠️ Skipping empty file', { jsonlFile, orgId, comparisonId });
            continue;
          }

          logger.debug('🔍 Analyzing all records for complete schema', { 
            jsonlFile, 
            totalRecords: rows.length
          });

          // Collect all unique field names across ALL records
          const allFieldNames = new Set();
          const fieldPresenceCount = new Map();
          const fieldNullCount = new Map();
          
          rows.forEach((row, index) => {
            Object.keys(row).forEach(fieldName => {
              allFieldNames.add(fieldName);
              fieldPresenceCount.set(fieldName, (fieldPresenceCount.get(fieldName) || 0) + 1);
              
              if (row[fieldName] === null || row[fieldName] === undefined) {
                fieldNullCount.set(fieldName, (fieldNullCount.get(fieldName) || 0) + 1);
              }
            });
          });

          logger.debug('🔍 Field analysis complete', { 
            jsonlFile, 
            totalUniqueFields: allFieldNames.size,
            fieldPresenceCount: Object.fromEntries(fieldPresenceCount),
            fieldNullCount: Object.fromEntries(fieldNullCount),
            sampleFieldNames: Array.from(allFieldNames).slice(0, 10)
          });

          // Create schema with proper null handling
          const schemaEntries = Array.from(allFieldNames).map(fieldName => {
            // Find first non-null value for type inference
            let sampleValue = null;
            let hasNonNullValue = false;
            
            for (const row of rows) {
              if (row[fieldName] !== null && row[fieldName] !== undefined) {
                sampleValue = row[fieldName];
                hasNonNullValue = true;
                break;
              }
            }
            
            // If all values are null, default to optional UTF8
            let fieldConfig;
            if (!hasNonNullValue) {
              logger.debug('🔍 All values null for field, using optional UTF8', { fieldName });
              fieldConfig = { type: 'UTF8', optional: true };
            } else {
              const typeConfig = inferParquetType(sampleValue);
              fieldConfig = { ...typeConfig };
              
              // Mark as optional if not present in all records or has any null values
              const nullCount = fieldNullCount.get(fieldName) || 0;
              const isOptional = fieldPresenceCount.get(fieldName) < rows.length || nullCount > 0;
              
              if (isOptional) {
                fieldConfig.optional = true;
              }
            }
            
            logger.debug('🔍 Schema field configured', { 
              fieldName,
              sampleValue,
              hasNonNullValue,
              inferredConfig: fieldConfig,
              presentInRecords: fieldPresenceCount.get(fieldName),
              nullCount: fieldNullCount.get(fieldName) || 0,
              totalRecords: rows.length,
              isOptional: fieldConfig.optional || false
            });
            
            return [fieldName, fieldConfig];
          });

          logger.debug('📋 Creating Parquet schema with optional fields', { 
            jsonlFile, 
            totalFields: schemaEntries.length,
            optionalFields: schemaEntries.filter(([, config]) => config.optional).length,
            requiredFields: schemaEntries.filter(([, config]) => !config.optional).length
          });

          const schema = new parquet.ParquetSchema(
            Object.fromEntries(schemaEntries)
          );

          logger.debug('📝 Opening Parquet writer', { parquetPath });
          const writer = await parquet.ParquetWriter.openFile(schema, parquetPath);
          
          // Optional: Set row group size for better performance
          writer.setRowGroupSize(4096);
          logger.debug('📝 Set row group size to 4096', { jsonlFile });
          
          let processedRows = 0;
          const totalRows = rows.length;
          
          logger.debug('📝 Starting row-by-row writing with field normalization', { 
            jsonlFile, 
            totalRows,
            note: 'Ensuring all schema fields are present in each row'
          });
          
          // For parquets@0.10.10, use appendRow for individual rows
          for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const originalRow = rows[rowIndex];
            try {
              // Normalize row to include all schema fields
              const normalizedRow = {};
              
              logger.debug('🔍 Processing row', {
                jsonlFile,
                rowIndex,
                originalKeys: Object.keys(originalRow),
                schemaFields: Array.from(allFieldNames)
              });
              
              // Add all schema fields, using null for missing optional fields
              for (const fieldName of allFieldNames) {
                if (originalRow.hasOwnProperty(fieldName)) {
                  normalizedRow[fieldName] = originalRow[fieldName];
                } else {
                  // Field is missing - set to null for optional fields
                  normalizedRow[fieldName] = null;
                  logger.debug('🔍 Added missing field as null', {
                    jsonlFile,
                    rowIndex,
                    fieldName
                  });
                }
              }
              
              logger.debug('🔍 Row normalized', {
                jsonlFile,
                rowIndex,
                normalizedKeys: Object.keys(normalizedRow),
                normalizedSample: Object.keys(normalizedRow).slice(0, 5).reduce((obj, key) => {
                  obj[key] = normalizedRow[key];
                  return obj;
                }, {})
              });
              
              await writer.appendRow(normalizedRow);
              processedRows++;
              
              // Log progress every 500 rows
              if (processedRows % 500 === 0 || processedRows === totalRows) {
                logger.debug('📝 Writing progress to Parquet', { 
                  jsonlFile, 
                  processedRows,
                  totalRows,
                  progress: `${Math.round(processedRows / totalRows * 100)}%`,
                  remaining: totalRows - processedRows
                });
              }
            } catch (rowError) {
              logger.error('❌ Failed to write row to Parquet', {
                jsonlFile,
                rowIndex,
                originalRowKeys: Object.keys(originalRow),
                originalRowSample: JSON.stringify(originalRow).substring(0, 200),
                schemaFields: Array.from(allFieldNames),
                error: rowError.message,
                stack: rowError.stack
              });
              throw rowError;
            }
          }
          
          logger.info('📝 Finished writing all rows, closing Parquet file', {
            jsonlFile,
            totalRowsWritten: processedRows,
            totalRows
          });

          logger.debug('📝 Closing Parquet writer', { jsonlFile });
          await writer.close();

          logger.info(`✅ Converted ${jsonlFile} to Parquet`, { 
            orgId, 
            comparisonId, 
            parquetPath, 
            totalRowsWritten: processedRows,
            totalRows
          });
        } catch (err) {
          logger.error('❌ Failed Parquet conversion', {
            file: jsonlFile,
            orgId,
            comparisonId,
            jsonlPath,
            parquetPath,
            error: err.message,
            errorStack: err.stack
          });
        }
      }
    })
  );
  
  logger.info('🏁 Completed JSONL to Parquet conversion', { comparisonId, extractedPath });
}

module.exports = { convertJsonlToParquet };