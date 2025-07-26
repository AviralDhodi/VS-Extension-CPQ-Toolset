// CPQ Toolset v3 - JSONL to Parquet Converter
const { spawn } = require('child_process')
const fs = require('fs')
const pkgReader = require('../../../shared/utils/pkgFileReader')
const path = require('path')

class ParquetConverter {
  constructor(options = {}) {
    this.pythonPath = options.pythonPath || 'python3'
    this.timeout = options.timeout || 300000 // 5 minutes
    this.tempDir = options.tempDir || path.join(process.cwd(), 'temp')
  }

  /**
   * Convert JSONL file to Parquet format
   */
  async convertJSONLToParquet(jsonlPath, parquetPath = null) {
    if (!pkgReader.existsSync(jsonlPath)) {
      throw new Error(`JSONL file does not exist: ${jsonlPath}`)
    }

    // Default parquet path
    if (!parquetPath) {
      parquetPath = jsonlPath.replace('.jsonl', '.parquet')
    }

    console.log(`Converting ${jsonlPath} to ${parquetPath}`)

    // Create conversion script
    const scriptPath = await this.createConversionScript()

    return new Promise((resolve, reject) => {
      const python = spawn(this.pythonPath, [scriptPath, jsonlPath, parquetPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      })

      let stdout = ''
      let stderr = ''

      python.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      python.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      python.on('close', (code) => {
        // Cleanup script
        this.cleanupScript(scriptPath)

        if (code === 0) {
          // Verify parquet file was created
          if (pkgReader.existsSync(parquetPath)) {
            const stats = pkgReader.statSync(parquetPath)
            
            resolve({
              success: true,
              inputPath: jsonlPath,
              outputPath: parquetPath,
              outputSize: stats.size,
              conversionLog: stdout
            })
          } else {
            reject(new Error('Parquet file was not created'))
          }
        } else {
          reject(new Error(`Conversion failed with code ${code}: ${stderr}`))
        }
      })

      python.on('error', (error) => {
        this.cleanupScript(scriptPath)
        reject(new Error(`Failed to spawn Python process: ${error.message}`))
      })

      // Set timeout
      setTimeout(() => {
        python.kill('SIGKILL')
        this.cleanupScript(scriptPath)
        reject(new Error('Conversion timeout'))
      }, this.timeout)
    })
  }

  /**
   * Convert multiple JSONL files to Parquet
   */
  async convertMultiple(jsonlPaths, options = {}) {
    const results = []
    const parallel = options.parallel || false
    const maxConcurrent = options.maxConcurrent || 3

    if (parallel) {
      return await this.convertParallel(jsonlPaths, maxConcurrent)
    } else {
      // Sequential conversion
      for (const jsonlPath of jsonlPaths) {
        try {
          const result = await this.convertJSONLToParquet(jsonlPath)
          results.push(result)
        } catch (error) {
          results.push({
            success: false,
            inputPath: jsonlPath,
            error: error.message
          })
        }
      }
    }

    return results
  }

  /**
   * Convert files in parallel with concurrency control
   */
  async convertParallel(jsonlPaths, maxConcurrent) {
    const results = []
    const activeConversions = new Map()
    const queue = [...jsonlPaths]

    return new Promise((resolve, reject) => {
      const processNext = () => {
        while (queue.length > 0 && activeConversions.size < maxConcurrent) {
          const jsonlPath = queue.shift()
          
          const conversionPromise = this.convertJSONLToParquet(jsonlPath)
            .then(result => {
              results.push(result)
              activeConversions.delete(jsonlPath)
              processNext()
            })
            .catch(error => {
              results.push({
                success: false,
                inputPath: jsonlPath,
                error: error.message
              })
              activeConversions.delete(jsonlPath)
              processNext()
            })

          activeConversions.set(jsonlPath, conversionPromise)
        }

        // Check if all conversions completed
        if (queue.length === 0 && activeConversions.size === 0) {
          resolve(results)
        }
      }

      processNext()
    })
  }

  /**
   * Create Python conversion script
   */
  async createConversionScript() {
    const scriptContent = `#!/usr/bin/env python3
"""
JSONL to Parquet Converter Script
Converts JSONL files to Parquet format for optimized storage and processing
"""

import sys
import json
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path

def convert_jsonl_to_parquet(jsonl_path, parquet_path):
    """Convert JSONL file to Parquet format"""
    print(f"Converting {jsonl_path} to {parquet_path}")
    
    try:
        # Read JSONL file
        records = []
        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if line:
                    try:
                        record = json.loads(line)
                        records.append(record)
                    except json.JSONDecodeError as e:
                        print(f"Warning: Failed to parse line {line_num}: {e}")
                        continue
        
        if not records:
            raise ValueError("No valid records found in JSONL file")
        
        print(f"Loaded {len(records)} records from JSONL")
        
        # Convert to DataFrame
        df = pd.DataFrame(records)
        
        # Optimize data types
        df = optimize_dataframe_types(df)
        
        print(f"DataFrame shape: {df.shape}")
        print(f"Columns: {list(df.columns)}")
        
        # Write to Parquet
        df.to_parquet(parquet_path, index=False, compression='snappy')
        
        # Verify file was created
        if Path(parquet_path).exists():
            file_size = Path(parquet_path).stat().st_size
            print(f"Successfully created Parquet file: {parquet_path} ({file_size} bytes)")
            return True
        else:
            raise RuntimeError("Parquet file was not created")
            
    except Exception as e:
        print(f"Conversion failed: {e}")
        raise

def optimize_dataframe_types(df):
    """Optimize DataFrame column types for better Parquet compression"""
    
    for column in df.columns:
        # Skip metadata columns
        if column.startswith('_'):
            continue
            
        # Convert string columns that look like categories
        if df[column].dtype == 'object':
            unique_ratio = df[column].nunique() / len(df)
            if unique_ratio < 0.5:  # Less than 50% unique values
                try:
                    df[column] = df[column].astype('category')
                except:
                    pass
        
        # Convert float columns with no decimals to int
        elif df[column].dtype == 'float64':
            if df[column].notna().all() and (df[column] % 1 == 0).all():
                try:
                    df[column] = df[column].astype('int64')
                except:
                    pass
    
    return df

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python convert_parquet.py <input_jsonl> <output_parquet>")
        sys.exit(1)
    
    jsonl_path = sys.argv[1]
    parquet_path = sys.argv[2]
    
    try:
        convert_jsonl_to_parquet(jsonl_path, parquet_path)
        print("Conversion completed successfully")
    except Exception as e:
        print(f"Conversion failed: {e}")
        sys.exit(1)
`

    // Ensure temp directory exists
    if (!pkgReader.existsSync(this.tempDir)) {
      pkgReader.mkdirSync(this.tempDir, { recursive: true })
    }

    const scriptPath = path.join(this.tempDir, `convert_parquet_${Date.now()}.py`)
    pkgReader.writeFileSync(scriptPath, scriptContent)
    
    return scriptPath
  }

  /**
   * Cleanup temporary script
   */
  cleanupScript(scriptPath) {
    try {
      if (pkgReader.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath)
      }
    } catch (error) {
      console.warn(`Failed to cleanup script ${scriptPath}:`, error.message)
    }
  }

  /**
   * Check if Parquet file exists and is newer than JSONL
   */
  isParquetUpToDate(jsonlPath, parquetPath = null) {
    if (!parquetPath) {
      parquetPath = jsonlPath.replace('.jsonl', '.parquet')
    }

    if (!pkgReader.existsSync(jsonlPath) || !pkgReader.existsSync(parquetPath)) {
      return false
    }

    const jsonlStats = pkgReader.statSync(jsonlPath)
    const parquetStats = pkgReader.statSync(parquetPath)

    return parquetStats.mtime >= jsonlStats.mtime
  }

  /**
   * Auto-convert JSONL files to Parquet if needed
   */
  async autoConvert(directory, options = {}) {
    const recursive = options.recursive || false
    const force = options.force || false

    console.log(`Auto-converting JSONL files in ${directory}`)

    // Find JSONL files
    const jsonlFiles = this.findJSONLFiles(directory, recursive)
    console.log(`Found ${jsonlFiles.length} JSONL files`)

    const conversionsNeeded = []

    for (const jsonlPath of jsonlFiles) {
      const parquetPath = jsonlPath.replace('.jsonl', '.parquet')
      
      if (force || !this.isParquetUpToDate(jsonlPath, parquetPath)) {
        conversionsNeeded.push(jsonlPath)
      }
    }

    console.log(`${conversionsNeeded.length} files need conversion`)

    if (conversionsNeeded.length === 0) {
      return { converted: 0, upToDate: jsonlFiles.length }
    }

    // Convert files
    const results = await this.convertMultiple(conversionsNeeded, {
      parallel: true,
      maxConcurrent: 3
    })

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return {
      converted: successful,
      failed: failed,
      upToDate: jsonlFiles.length - conversionsNeeded.length,
      results: results
    }
  }

  /**
   * Find JSONL files in directory
   */
  findJSONLFiles(directory, recursive = false) {
    const jsonlFiles = []

    const scanDirectory = (dir) => {
      if (!pkgReader.existsSync(dir)) return

      const items = pkgReader.readdirSync(dir)

      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stats = pkgReader.statSync(fullPath)

        if (stats.isFile() && item.endsWith('.jsonl')) {
          jsonlFiles.push(fullPath)
        } else if (stats.isDirectory() && recursive) {
          scanDirectory(fullPath)
        }
      }
    }

    scanDirectory(directory)
    return jsonlFiles
  }

  /**
   * Get conversion statistics
   */
  async getConversionStats(directory) {
    const jsonlFiles = this.findJSONLFiles(directory, true)
    const stats = {
      totalJSONL: jsonlFiles.length,
      hasParquet: 0,
      upToDate: 0,
      needsConversion: 0,
      totalSizeJSONL: 0,
      totalSizeParquet: 0
    }

    for (const jsonlPath of jsonlFiles) {
      const parquetPath = jsonlPath.replace('.jsonl', '.parquet')
      const jsonlStats = pkgReader.statSync(jsonlPath)
      
      stats.totalSizeJSONL += jsonlStats.size

      if (pkgReader.existsSync(parquetPath)) {
        stats.hasParquet++
        const parquetStats = pkgReader.statSync(parquetPath)
        stats.totalSizeParquet += parquetStats.size

        if (this.isParquetUpToDate(jsonlPath, parquetPath)) {
          stats.upToDate++
        } else {
          stats.needsConversion++
        }
      } else {
        stats.needsConversion++
      }
    }

    return stats
  }
}

module.exports = { ParquetConverter }