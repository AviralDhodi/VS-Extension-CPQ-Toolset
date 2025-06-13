const fs = require('fs');
const path = require('path');

class Logger {
    constructor(options = {}) {
        this.logLevel = options.logLevel || 'info';
        this.logFile = options.logFile || null;
        this.enableConsole = options.enableConsole !== false;
        this.enableFile = options.enableFile && this.logFile;
        this.appName = options.appName || 'CPQ-Toolset';
        
        // Ensure log directory exists
        if (this.enableFile && this.logFile) {
            const logDir = path.dirname(this.logFile);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        }
    }

    static levels = {
        error: 0,
        warn: 1,
        info: 2,
        debug: 3
    };

    static colors = {
        error: '\x1b[31m',   // Red
        warn: '\x1b[33m',    // Yellow
        info: '\x1b[36m',    // Cyan
        debug: '\x1b[37m',   // White
        reset: '\x1b[0m'
    };

    shouldLog(level) {
        return Logger.levels[level] <= Logger.levels[this.logLevel];
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${this.appName}] [${level.toUpperCase()}]: ${message}${metaStr}`;
    }

    log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;

        const formattedMessage = this.formatMessage(level, message, meta);
        
        // Console output with colors
        if (this.enableConsole) {
            const color = Logger.colors[level] || Logger.colors.reset;
            console.log(`${color}${formattedMessage}${Logger.colors.reset}`);
        }

        // File output
        if (this.enableFile && this.logFile) {
            try {
                fs.appendFileSync(this.logFile, formattedMessage + '\n');
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
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

// Factory function for creating loggers
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
    Logger,
    createLogger,
    defaultLogger
};