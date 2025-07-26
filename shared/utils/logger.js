// CPQ Toolset v3 - Enhanced Logger
const fs = require('fs')
const path = require('path')

class Logger {
  constructor (options = {}) {
    this.appName = options.appName || 'CPQ-Toolset-v3'
    this.location = options.location || 'server'
    this.enableFileLogging = options.enableFileLogging !== false
    this.logLevel = options.logLevel || 'info'
    this.logFile = options.logFile || path.join(process.cwd(), 'logs', 'app.log')
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024 // 10MB
    this.maxFiles = options.maxFiles || 5

    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    }

    // Ensure log directory exists
    if (this.enableFileLogging) {
      const logDir = path.dirname(this.logFile)
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
    }

    // In-memory log buffer for UI
    this.logBuffer = []
    this.maxBufferSize = 1000
  }

  formatMessage (level, message, meta = {}) {
    const timestamp = new Date().toISOString()
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
    return `[${timestamp}] [${level.toUpperCase()}] [${this.appName}:${this.location}] ${message}${metaStr}`
  }

  shouldLog (level) {
    return this.levels[level] <= this.levels[this.logLevel]
  }

  rotateLogFile () {
    if (!this.enableFileLogging || !fs.existsSync(this.logFile)) {
      return
    }

    try {
      const stats = fs.statSync(this.logFile)
      if (stats.size < this.maxFileSize) {
        return
      }

      // Rotate existing files
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldFile = `${this.logFile}.${i}`
        const newFile = `${this.logFile}.${i + 1}`

        if (fs.existsSync(oldFile)) {
          if (i === this.maxFiles - 1) {
            fs.unlinkSync(oldFile) // Delete oldest
          } else {
            fs.renameSync(oldFile, newFile)
          }
        }
      }

      // Move current log to .1
      fs.renameSync(this.logFile, `${this.logFile}.1`)
    } catch (error) {
      console.error('Failed to rotate log file:', error)
    }
  }

  writeToFile (formattedMessage) {
    if (!this.enableFileLogging) return

    try {
      this.rotateLogFile()
      fs.appendFileSync(this.logFile, formattedMessage + '\n')
    } catch (error) {
      console.error('Failed to write to log file:', error)
    }
  }

  addToBuffer (level, message, meta) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
      location: this.location,
      app: this.appName
    }

    this.logBuffer.push(logEntry)

    // Keep buffer size manageable
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize)
    }
  }

  log (level, message, meta = {}) {
    if (!this.shouldLog(level)) return

    const formattedMessage = this.formatMessage(level, message, meta)

    // Console output with colors
    const colors = {
      error: '\x1b[31m', // Red
      warn: '\x1b[33m', // Yellow
      info: '\x1b[36m', // Cyan
      debug: '\x1b[35m', // Magenta
      trace: '\x1b[90m' // Bright Black (Gray)
    }
    const resetColor = '\x1b[0m'

    console.log(`${colors[level] || ''}${formattedMessage}${resetColor}`)

    // File output
    this.writeToFile(formattedMessage)

    // Add to in-memory buffer for UI
    this.addToBuffer(level, message, meta)
  }

  error (message, meta = {}) { this.log('error', message, meta) }
  warn (message, meta = {}) { this.log('warn', message, meta) }
  info (message, meta = {}) { this.log('info', message, meta) }
  debug (message, meta = {}) { this.log('debug', message, meta) }
  trace (message, meta = {}) { this.log('trace', message, meta) }

  // Express middleware for request logging
  middleware () {
    const self = this
    return (req, res, next) => {
      const start = Date.now()
      const originalSend = res.send

      // Capture response details
      res.send = function (body) {
        const duration = Date.now() - start
        const statusCode = res.statusCode
        const method = req.method
        const url = req.originalUrl || req.url
        const ip = req.ip || req.connection.remoteAddress || 'Unknown'

        // Log request details
        const logLevel = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info'
        self.log(logLevel, `${method} ${url} ${statusCode} - ${duration}ms`, {
          method,
          url,
          statusCode,
          duration,
          ip,
          responseSize: body ? body.length : 0
        })

        return originalSend.call(res, body)
      }

      next()
    }
  }

  // Get recent logs for UI
  getRecentLogs (limit = 100, level = 'all') {
    let logs = this.logBuffer

    if (level !== 'all') {
      const levelNum = this.levels[level]
      logs = logs.filter(log => this.levels[log.level] <= levelNum)
    }

    return logs.slice(-limit)
  }

  // Clear log buffer
  clearBuffer () {
    this.logBuffer = []
  }

  // Create child logger with additional context
  child (context = {}) {
    const childOptions = {
      appName: this.appName,
      location: context.location || this.location,
      enableFileLogging: this.enableFileLogging,
      logLevel: this.logLevel,
      logFile: this.logFile,
      maxFileSize: this.maxFileSize,
      maxFiles: this.maxFiles
    }

    const childLogger = new Logger(childOptions)

    // Add context to all log messages
    const originalLog = childLogger.log
    childLogger.log = (level, message, meta = {}) => {
      const enhancedMeta = { ...context, ...meta }
      originalLog.call(childLogger, level, message, enhancedMeta)
    }

    return childLogger
  }
}

// Factory function for creating loggers
function createLogger (options = {}) {
  return new Logger(options)
}

// Default logger instance
const defaultLogger = new Logger({
  appName: 'CPQ-Toolset-v3',
  location: 'server',
  enableFileLogging: true,
  logLevel: process.env.LOG_LEVEL || 'info'
})

module.exports = {
  Logger,
  createLogger,
  logger: defaultLogger
}