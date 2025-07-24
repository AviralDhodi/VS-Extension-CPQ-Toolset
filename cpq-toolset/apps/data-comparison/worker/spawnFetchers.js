// CPQ Toolset v3 - Spawn Fetchers Coordinator
const { spawn, fork } = require('child_process')
const path = require('path')
const fs = require('fs')
const { logger } = require('../../../shared/utils/logger')
const { getInstance: getPathResolver } = require('../../../shared/utils/pathResolver')

class FetchCoordinator {
  constructor(options = {}) {
    this.pathResolver = getPathResolver()
    
    // Check VS Code setting for max concurrent workers
    let maxWorkers = 3 // default
    try {
      const vscode = require('vscode')
      maxWorkers = vscode.workspace.getConfiguration('cpq-toolset').get('maxConcurrentWorkers') || 3
    } catch (error) {
      // Not running in VS Code context or setting not available
    }
    
    this.maxConcurrentFetchers = options.maxConcurrentFetchers || maxWorkers
    this.timeout = options.timeout || 300000 // 5 minutes
    this.activeFetchers = new Map()
    this.fetchQueue = []
    this.results = new Map()
    this.errors = new Map()
    this.progressCallback = options.progressCallback || null
  }

  /**
   * Start parallel data fetching for multiple org-object combinations
   */
  async startParallelFetching(config, outputDir) {
    const { orgs, objects } = config
    
    logger.info('Starting parallel data fetching', {
      orgs: orgs.length,
      objects: Object.keys(objects).length,
      maxConcurrent: this.maxConcurrentFetchers
    })

    // Ensure output directory exists
    this._ensureOutputDirectory(outputDir)

    // Create fetch tasks for each org-object combination
    const fetchTasks = this._createFetchTasks(orgs, objects, outputDir)
    
    logger.info(`Created ${fetchTasks.length} fetch tasks`)

    // Execute tasks with concurrency control
    return await this._executeFetchTasks(fetchTasks)
  }

  /**
   * Create individual fetch tasks
   */
  _createFetchTasks(orgs, objects, outputDir) {
    const tasks = []

    for (const org of orgs) {
      for (const [objectName, objectConfig] of Object.entries(objects)) {
        tasks.push({
          id: `${org}-${objectName}`,
          org: org,
          objectName: objectName,
          objectConfig: objectConfig,
          outputDir: path.join(outputDir, this._sanitizeOrgName(org)),
          priority: objectConfig.priority || 1
        })
      }
    }

    // Sort by priority (higher priority first)
    tasks.sort((a, b) => b.priority - a.priority)
    
    return tasks
  }

  /**
   * Execute fetch tasks with concurrency control
   */
  async _executeFetchTasks(tasks) {
    return new Promise((resolve, reject) => {
      this.fetchQueue = [...tasks]
      let completedTasks = 0
      let totalTasks = tasks.length
      let hasErrors = false

      const processNext = () => {
        // Start new fetchers if queue has tasks and we have capacity
        while (this.fetchQueue.length > 0 && this.activeFetchers.size < this.maxConcurrentFetchers) {
          const task = this.fetchQueue.shift()
          this._startFetcher(task, (error, result) => {
            completedTasks++
            
            if (error) {
              hasErrors = true
              this.errors.set(task.id, error)
              logger.error(`Fetch failed for ${task.id}`, { error: error.message })
            } else {
              this.results.set(task.id, result)
              logger.info(`Fetch completed for ${task.id}`, { 
                records: result.recordCount,
                duration: result.duration 
              })
            }

            // Update progress
            if (this.progressCallback) {
              this.progressCallback({
                completed: completedTasks,
                total: totalTasks,
                currentTask: task.id,
                errors: this.errors.size
              })
            }

            // Process next task
            processNext()

            // Check if all tasks completed
            if (completedTasks === totalTasks) {
              if (hasErrors && this.errors.size === totalTasks) {
                reject(new Error(`All fetch tasks failed. First error: ${Array.from(this.errors.values())[0].message}`))
              } else {
                resolve({
                  completed: completedTasks,
                  successful: this.results.size,
                  failed: this.errors.size,
                  results: Object.fromEntries(this.results),
                  errors: Object.fromEntries(this.errors)
                })
              }
            }
          })
        }
      }

      // Start initial batch
      processNext()

      // Handle case where no tasks to process
      if (totalTasks === 0) {
        resolve({
          completed: 0,
          successful: 0,
          failed: 0,
          results: {},
          errors: {}
        })
      }
    })
  }

  /**
   * Start a single fetcher worker process
   */
  _startFetcher(task, callback) {
    const fetcherPath = this.pathResolver.getWorkerPath('data-comparison', 'fetcher.js')
    
    logger.debug(`Starting fetcher for ${task.id}`, { 
      org: task.org,
      object: task.objectName 
    })

    // Ensure output directory exists
    if (!fs.existsSync(task.outputDir)) {
      fs.mkdirSync(task.outputDir, { recursive: true })
    }

    const fetcher = fork(fetcherPath, {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      cwd: this.pathResolver.extensionRoot,
      env: {
        ...process.env,
        EXTENSION_ROOT: this.pathResolver.extensionRoot,
        CPQ_BUNDLED: this.pathResolver.isBundled ? 'true' : 'false'
      }
    })

    const startTime = Date.now()
    let completed = false

    // Store fetcher reference
    this.activeFetchers.set(task.id, fetcher)

    // Send task to fetcher
    fetcher.send({
      type: 'FETCH_TASK',
      task: task
    })

    // Handle fetcher messages
    fetcher.on('message', (message) => {
      if (message.type === 'FETCH_COMPLETE' && !completed) {
        completed = true
        this.activeFetchers.delete(task.id)
        
        const duration = Date.now() - startTime
        callback(null, {
          ...message.result,
          duration: duration
        })
        
        fetcher.kill()
      } else if (message.type === 'FETCH_ERROR' && !completed) {
        completed = true
        this.activeFetchers.delete(task.id)
        
        callback(new Error(message.error))
        fetcher.kill()
      } else if (message.type === 'FETCH_PROGRESS') {
        // Forward progress updates
        logger.debug(`Fetch progress for ${task.id}: ${message.progress}%`)
      }
    })

    // Handle fetcher errors
    fetcher.on('error', (error) => {
      if (!completed) {
        completed = true
        this.activeFetchers.delete(task.id)
        callback(error)
      }
    })

    // Handle fetcher exit
    fetcher.on('exit', (code, signal) => {
      if (!completed) {
        completed = true
        this.activeFetchers.delete(task.id)
        
        const errorMsg = signal 
          ? `Fetcher killed with signal ${signal}`
          : `Fetcher exited with code ${code}`
        
        callback(new Error(errorMsg))
      }
    })

    // Set timeout
    setTimeout(() => {
      if (!completed) {
        completed = true
        this.activeFetchers.delete(task.id)
        
        fetcher.kill('SIGKILL')
        callback(new Error(`Fetch timeout for ${task.id}`))
      }
    }, this.timeout)
  }

  /**
   * Sanitize org name for use as directory name
   */
  _sanitizeOrgName(orgName) {
    return orgName.replace(/[@.]/g, '_')
  }

  /**
   * Ensure output directory structure exists
   */
  _ensureOutputDirectory(outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
      logger.info(`Created output directory: ${outputDir}`)
    }
  }

  /**
   * Cancel all active fetchers
   */
  cancelAll() {
    logger.info(`Cancelling ${this.activeFetchers.size} active fetchers`)
    
    for (const [taskId, fetcher] of this.activeFetchers) {
      try {
        fetcher.kill('SIGTERM')
        logger.debug(`Cancelled fetcher for ${taskId}`)
      } catch (error) {
        logger.warn(`Failed to cancel fetcher for ${taskId}`, { error: error.message })
      }
    }
    
    this.activeFetchers.clear()
    this.fetchQueue = []
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      activeFetchers: this.activeFetchers.size,
      queuedTasks: this.fetchQueue.length,
      completedResults: this.results.size,
      errors: this.errors.size
    }
  }

  /**
   * Generate summary report
   */
  generateSummaryReport(outputDir) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalTasks: this.results.size + this.errors.size,
      successful: this.results.size,
      failed: this.errors.size,
      successRate: this.results.size / (this.results.size + this.errors.size),
      results: Object.fromEntries(this.results),
      errors: Object.fromEntries(Array.from(this.errors.entries()).map(([key, error]) => [
        key, 
        { message: error.message, stack: error.stack }
      ]))
    }

    const summaryPath = path.join(outputDir, 'fetch_summary.json')
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
    
    logger.info(`Fetch summary written to: ${summaryPath}`)
    return summary
  }
}

module.exports = { FetchCoordinator }