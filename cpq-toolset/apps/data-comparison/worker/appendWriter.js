// CPQ Toolset v3 - JSONL Append Writer
const fs = require('fs')
const path = require('path')

class AppendWriter {
  constructor(options = {}) {
    this.bufferSize = options.bufferSize || 1000 // Records to buffer before writing
    this.encoding = options.encoding || 'utf8'
    this.ensureNewline = options.ensureNewline !== false
  }

  /**
   * Write records to JSONL file with buffering
   */
  async writeJSONL(records, outputPath, options = {}) {
    if (!Array.isArray(records)) {
      throw new Error('Records must be an array')
    }

    if (records.length === 0) {
      console.log('No records to write')
      return { recordsWritten: 0, outputPath }
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    console.log(`Writing ${records.length} records to ${outputPath}`)

    return new Promise((resolve, reject) => {
      let recordsWritten = 0
      let writeBuffer = []
      const append = options.append || false

      // Open write stream
      const writeStream = fs.createWriteStream(outputPath, {
        flags: append ? 'a' : 'w',
        encoding: this.encoding,
        highWaterMark: 64 * 1024 // 64KB buffer
      })

      writeStream.on('error', (error) => {
        console.error('Write stream error:', error)
        reject(error)
      })

      writeStream.on('finish', () => {
        console.log(`Successfully wrote ${recordsWritten} records to ${outputPath}`)
        resolve({
          recordsWritten,
          outputPath,
          fileSize: this.getFileSize(outputPath)
        })
      })

      // Process records in chunks
      const processChunk = (startIndex) => {
        const endIndex = Math.min(startIndex + this.bufferSize, records.length)
        const chunk = records.slice(startIndex, endIndex)

        try {
          // Convert chunk to JSONL format
          const jsonlLines = chunk.map(record => {
            try {
              return JSON.stringify(record)
            } catch (jsonError) {
              console.warn('Failed to stringify record:', jsonError.message)
              return JSON.stringify({ _error: 'Failed to serialize record', _originalError: jsonError.message })
            }
          })

          // Write chunk to stream
          const chunkData = jsonlLines.join('\n') + (this.ensureNewline ? '\n' : '')
          
          writeStream.write(chunkData, (error) => {
            if (error) {
              console.error('Chunk write error:', error)
              reject(error)
              return
            }

            recordsWritten += chunk.length

            // Process next chunk or finish
            if (endIndex < records.length) {
              setImmediate(() => processChunk(endIndex))
            } else {
              writeStream.end()
            }
          })

        } catch (error) {
          console.error('Chunk processing error:', error)
          reject(error)
        }
      }

      // Start processing
      processChunk(0)
    })
  }

  /**
   * Append single record to existing JSONL file
   */
  async appendRecord(record, outputPath) {
    return this.writeJSONL([record], outputPath, { append: true })
  }

  /**
   * Append multiple records to existing JSONL file
   */
  async appendRecords(records, outputPath) {
    return this.writeJSONL(records, outputPath, { append: true })
  }

  /**
   * Read JSONL file and return parsed records
   */
  async readJSONL(inputPath, options = {}) {
    const limit = options.limit || null
    const startLine = options.startLine || 0

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(inputPath)) {
        reject(new Error(`Input file does not exist: ${inputPath}`))
        return
      }

      const records = []
      let lineNumber = 0
      let recordCount = 0

      const readStream = fs.createReadStream(inputPath, { encoding: this.encoding })
      let buffer = ''

      readStream.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split('\n')
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop()

        // Process complete lines
        for (const line of lines) {
          if (lineNumber >= startLine && line.trim()) {
            try {
              const record = JSON.parse(line.trim())
              records.push(record)
              recordCount++

              if (limit && recordCount >= limit) {
                readStream.destroy()
                resolve({
                  records,
                  totalRecords: recordCount,
                  inputPath
                })
                return
              }
            } catch (parseError) {
              console.warn(`Failed to parse line ${lineNumber + 1}:`, parseError.message)
            }
          }
          lineNumber++
        }
      })

      readStream.on('end', () => {
        // Process final line if exists
        if (buffer.trim()) {
          try {
            const record = JSON.parse(buffer.trim())
            if (lineNumber >= startLine && (!limit || recordCount < limit)) {
              records.push(record)
              recordCount++
            }
          } catch (parseError) {
            console.warn(`Failed to parse final line:`, parseError.message)
          }
        }

        resolve({
          records,
          totalRecords: recordCount,
          inputPath
        })
      })

      readStream.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Count records in JSONL file
   */
  async countRecords(inputPath) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(inputPath)) {
        reject(new Error(`Input file does not exist: ${inputPath}`))
        return
      }

      let lineCount = 0
      const readStream = fs.createReadStream(inputPath, { encoding: this.encoding })
      let buffer = ''

      readStream.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() // Keep incomplete line

        lineCount += lines.filter(line => line.trim()).length
      })

      readStream.on('end', () => {
        if (buffer.trim()) {
          lineCount++
        }
        resolve(lineCount)
      })

      readStream.on('error', reject)
    })
  }

  /**
   * Validate JSONL file format
   */
  async validateJSONL(inputPath) {
    const validation = {
      valid: true,
      totalLines: 0,
      validRecords: 0,
      invalidLines: [],
      errors: []
    }

    return new Promise((resolve) => {
      if (!fs.existsSync(inputPath)) {
        validation.valid = false
        validation.errors.push(`File does not exist: ${inputPath}`)
        resolve(validation)
        return
      }

      const readStream = fs.createReadStream(inputPath, { encoding: this.encoding })
      let buffer = ''
      let lineNumber = 0

      readStream.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          lineNumber++
          validation.totalLines++

          if (line.trim()) {
            try {
              JSON.parse(line.trim())
              validation.validRecords++
            } catch (parseError) {
              validation.valid = false
              validation.invalidLines.push({
                lineNumber,
                error: parseError.message,
                line: line.substring(0, 100) + (line.length > 100 ? '...' : '')
              })
            }
          }
        }
      })

      readStream.on('end', () => {
        // Process final line
        if (buffer.trim()) {
          lineNumber++
          validation.totalLines++

          try {
            JSON.parse(buffer.trim())
            validation.validRecords++
          } catch (parseError) {
            validation.valid = false
            validation.invalidLines.push({
              lineNumber,
              error: parseError.message,
              line: buffer.substring(0, 100) + (buffer.length > 100 ? '...' : '')
            })
          }
        }

        resolve(validation)
      })

      readStream.on('error', (error) => {
        validation.valid = false
        validation.errors.push(error.message)
        resolve(validation)
      })
    })
  }

  /**
   * Get file size
   */
  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath)
      return stats.size
    } catch (error) {
      return 0
    }
  }

  /**
   * Merge multiple JSONL files into one
   */
  async mergeJSONLFiles(inputPaths, outputPath, options = {}) {
    const includeSource = options.includeSource || false
    let totalRecords = 0

    console.log(`Merging ${inputPaths.length} JSONL files into ${outputPath}`)

    const writeStream = fs.createWriteStream(outputPath, {
      encoding: this.encoding,
      highWaterMark: 64 * 1024
    })

    return new Promise((resolve, reject) => {
      writeStream.on('error', reject)

      const processFiles = async () => {
        try {
          for (let i = 0; i < inputPaths.length; i++) {
            const inputPath = inputPaths[i]
            const sourceName = includeSource ? path.basename(inputPath, '.jsonl') : null

            console.log(`Processing file ${i + 1}/${inputPaths.length}: ${inputPath}`)

            const { records } = await this.readJSONL(inputPath)
            
            for (const record of records) {
              if (includeSource) {
                record._sourceFile = sourceName
              }
              
              writeStream.write(JSON.stringify(record) + '\n')
              totalRecords++
            }
          }

          writeStream.end()
          
        } catch (error) {
          reject(error)
        }
      }

      writeStream.on('finish', () => {
        resolve({
          totalRecords,
          outputPath,
          fileSize: this.getFileSize(outputPath)
        })
      })

      processFiles()
    })
  }
}

module.exports = { AppendWriter }