const fs = require('fs');
const path = require('path');

/**
 * CPQ Toolset Extension Logger
 * Enhanced logging with file support, request middleware, and UI integration
 */

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
};

const LOG_COLORS = {
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m',    // Yellow
    info: '\x1b[36m',    // Cyan
    debug: '\x1b[35m',   // Magenta
    trace: '\x1b[37m',   // White
    reset: '\x1b[0m'     // Reset
};

class Logger {
    constructor(options = {}) {
        this.appName = options.appName || 'CPQ-Toolset';
        this.location = options.location || 'Unknown';
        this.logLevel = options.logLevel || 'info';
        this.logFile = options.logFile || null;
        this.enableColors = options.enableColors !== false;
        this.enableTimestamp = options.enableTimestamp !== false;
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile && this.logFile;
        this.currentLevel = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info;
        
        // Ensure log directory exists
        if (this.enableFile && this.logFile) {
            const logDir = path.dirname(this.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        const locationStr = this.location ? ` [${this.location}]` : '';
        return `[${timestamp}] [${this.appName}]${locationStr} [${level.toUpperCase()}]: ${message}${metaStr}`;
    }

    shouldLog(level) {
        return LOG_LEVELS[level] <= this.currentLevel;
    }

    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, meta);
        
        // Console output with colors
        if (this.enableConsole) {
            const color = this.enableColors ? LOG_COLORS[level] : '';
            const reset = this.enableColors ? LOG_COLORS.reset : '';
            const coloredMessage = `${color}${formattedMessage}${reset}`;
            
            switch (level) {
                case 'error':
                    console.error(coloredMessage);
                    break;
                case 'warn':
                    console.warn(coloredMessage);
                    break;
                case 'debug':
                case 'trace':
                    console.debug(coloredMessage);
                    break;
                default:
                    console.log(coloredMessage);
            }
        }

        // File output
        if (this.enableFile && this.logFile) {
            try {
                fs.appendFileSync(this.logFile, formattedMessage + '\n');
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }

        // Send to Extension UI if available (browser context)
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'ADD_LOG',
                data: {
                    app: this.appName,
                    level: level,
                    message: meta && Object.keys(meta).length > 0 ? `${message} ${JSON.stringify(meta)}` : message,
                    location: this.location,
                    timestamp: new Date().toISOString()
                }
            }, '*');
        }
    }

    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    trace(message, meta = {}) {
        this.log('trace', message, meta);
    }

    // Request logging middleware for Express
    requestMiddleware() {
        return (req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                const statusColor = res.statusCode >= 400 ? 'error' : 
                                  res.statusCode >= 300 ? 'warn' : 'info';
                
                this.log(statusColor, `${req.method} ${req.path}`, {
                    status: res.statusCode,
                    duration: `${duration}ms`,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
            });
            
            next();
        };
    }
}

/**
 * Factory function to create logger instances
 * @param {Object} options - Logger configuration
 * @param {string} options.logLevel - Log level (error, warn, info, debug, trace)
 * @param {string} options.appName - Application name
 * @param {string} options.location - File/module location
 * @param {string} options.logFile - Log file path
 * @param {boolean} options.enableColors - Enable color output
 * @param {boolean} options.enableTimestamp - Enable timestamp
 * @param {boolean} options.enableConsole - Enable console output
 * @param {boolean} options.enableFile - Enable file output
 * @returns {Logger} Logger instance
 */
function createLogger(options = {}) {
    return new Logger(options);
}

// Default logger instance
const defaultLogger = createLogger({
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || null,
    appName: 'CPQ-Toolset'
});

module.exports = {
    createLogger,
    defaultLogger,
    Logger,
    LOG_LEVELS,
    LOG_COLORS
};