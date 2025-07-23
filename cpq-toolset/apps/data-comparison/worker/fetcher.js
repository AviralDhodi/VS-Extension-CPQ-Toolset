// CPQ Toolset v3 - Individual Fetcher Worker Process
const path = require('path')
const { getInstance: getPathResolver } = require('../../../shared/utils/pathResolver')
const { getInstance: getGraphQLRunner } = require('../../../shared/utils/graphqlRunner')
const { AppendWriter } = require('./appendWriter')

class FetchWorker {
  constructor() {
    this.pathResolver = getPathResolver()
    this.graphqlRunner = getGraphQLRunner()
    this.appendWriter = new AppendWriter()
  }

  /**
   * Initialize worker and listen for tasks
   */
  async initialize() {
    console.log('Fetcher worker initialized')

    // Listen for messages from parent process
    process.on('message', async (message) => {
      try {
        if (message.type === 'FETCH_TASK') {
          await this.processFetchTask(message.task)
        } else {
          console.warn('Unknown message type:', message.type)
        }
      } catch (error) {
        this.sendError(error.message)
      }
    })

    // Handle worker termination
    process.on('SIGTERM', () => {
      console.log('Fetcher worker terminating...')
      process.exit(0)
    })

    process.on('SIGINT', () => {
      console.log('Fetcher worker interrupted...')
      process.exit(0)
    })
  }

  /**
   * Process a single fetch task
   */
  async processFetchTask(task) {
    const { id, org, objectName, objectConfig, outputDir } = task
    
    console.log(`Processing fetch task: ${id}`)
    this.sendProgress(0, `Starting fetch for ${objectName} from ${org}`)

    try {
      // Step 1: Fetch data using GraphQL runner
      this.sendProgress(10, 'Executing SOQL query...')
      const fetchResult = await this.graphqlRunner.fetchObjectDataForOrg(
        objectName,
        objectConfig,
        org,
        {
          timeout: 120000, // 2 minutes per query
          progressCallback: (progress) => {
            this.sendProgress(10 + (progress * 0.6), 'Fetching records...')
          }
        }
      )

      if (fetchResult.error) {
        throw new Error(`SOQL fetch failed: ${fetchResult.error}`)
      }

      if (!fetchResult.records || fetchResult.records.length === 0) {
        console.log(`No records found for ${objectName} in ${org}`)
        this.sendComplete({
          objectName,
          org,
          recordCount: 0,
          outputFile: null,
          query: fetchResult.query
        })
        return
      }

      this.sendProgress(70, `Processing ${fetchResult.records.length} records...`)

      // Step 2: Process and enhance records
      const processedRecords = this.processRecords(
        fetchResult.records,
        objectName,
        objectConfig,
        org
      )

      this.sendProgress(80, 'Writing to JSONL file...')

      // Step 3: Write to JSONL file
      const outputFile = path.join(outputDir, `${objectName}.jsonl`)
      await this.appendWriter.writeJSONL(processedRecords, outputFile)

      this.sendProgress(90, 'Validating output...')

      // Step 4: Validate output
      const validation = await this.validateOutput(outputFile, processedRecords.length)

      this.sendProgress(100, 'Fetch completed successfully')

      // Send completion result
      this.sendComplete({
        objectName,
        org,
        recordCount: processedRecords.length,
        outputFile: outputFile,
        query: fetchResult.query,
        validation: validation,
        originalRecordCount: fetchResult.records.length
      })

    } catch (error) {
      console.error(`Fetch task failed for ${id}:`, error)
      this.sendError(error.message)
    }
  }

  /**
   * Process and enhance records
   */
  processRecords(records, objectName, objectConfig, org) {
    const foreignKey = objectConfig.foreignKey
    const processedRecords = []

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      
      // Remove Salesforce metadata
      if (record.attributes) {
        delete record.attributes
      }

      // Ensure foreign key exists and is accessible
      if (foreignKey && record[foreignKey]) {
        record._primaryKey = record[foreignKey]
      }

      // Add metadata for tracking
      record._sourceOrg = org
      record._objectName = objectName
      record._fetchTimestamp = new Date().toISOString()
      record._recordIndex = i

      // Handle null values consistently
      for (const [key, value] of Object.entries(record)) {
        if (value === null || value === undefined) {
          record[key] = null
        }
      }

      processedRecords.push(record)
    }

    return processedRecords
  }

  /**
   * Validate output file
   */
  async validateOutput(outputFile, expectedCount) {
    try {
      const fs = require('fs')
      
      if (!fs.existsSync(outputFile)) {
        throw new Error('Output file was not created')
      }

      // Count lines in JSONL file
      const content = fs.readFileSync(outputFile, 'utf8')
      const lines = content.trim().split('\n').filter(line => line.trim())
      
      if (lines.length !== expectedCount) {
        throw new Error(`Record count mismatch: expected ${expectedCount}, found ${lines.length}`)
      }

      // Validate JSON format of first and last records
      try {
        JSON.parse(lines[0])
        if (lines.length > 1) {
          JSON.parse(lines[lines.length - 1])
        }
      } catch (parseError) {
        throw new Error(`Invalid JSON format in output file: ${parseError.message}`)
      }

      const stats = fs.statSync(outputFile)
      
      return {
        valid: true,
        recordCount: lines.length,
        fileSize: stats.size,
        filePath: outputFile
      }

    } catch (error) {
      return {
        valid: false,
        error: error.message,
        filePath: outputFile
      }
    }
  }

  /**
   * Send progress update to parent
   */
  sendProgress(percentage, message) {
    if (process.send) {
      process.send({
        type: 'FETCH_PROGRESS',
        progress: Math.round(percentage),
        message: message
      })
    }
  }

  /**
   * Send completion result to parent
   */
  sendComplete(result) {
    if (process.send) {
      process.send({
        type: 'FETCH_COMPLETE',
        result: result
      })
    }
  }

  /**
   * Send error to parent
   */
  sendError(errorMessage) {
    if (process.send) {
      process.send({
        type: 'FETCH_ERROR',
        error: errorMessage
      })
    }
  }
}

// Initialize and start worker
const worker = new FetchWorker()
worker.initialize().catch(error => {
  console.error('Worker initialization failed:', error)
  process.exit(1)
})