/**
 * CPQ Toolset Extension Logger - Browser Version
 * Provides centralized logging for browser-based app components
 */

const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
};

const LOG_COLORS = {
    error: 'color: #ef4444; font-weight: bold;',
    warn: 'color: #f59e0b; font-weight: bold;',
    info: 'color: #3b82f6; font-weight: bold;',
    debug: 'color: #8b5cf6; font-weight: bold;',
    trace: 'color: #64748b; font-weight: bold;'
};

class BrowserLogger {
    constructor(options = {}) {
        this.appName = options.appName || 'Unknown App';
        this.location = options.location || 'unknown.js';
        this.logLevel = options.logLevel || 'info';
        this.enableColors = options.enableColors !== false;
        this.enableTimestamp = options.enableTimestamp !== false;
        this.currentLevel = LOG_LEVELS[this.logLevel] || LOG_LEVELS.info;
        this.isInExtensionShell = window.parent !== window;
    }

    formatMessage(level, message, data = null) {
        const timestamp = this.enableTimestamp ? new Date().toISOString() : '';
        let formatted = `[${timestamp}] [${level.toUpperCase()}] [${this.appName}] [${this.location}] ${message}`;
        
        return {
            formatted,
            data,
            timestamp,
            level,
            app: this.appName,
            location: this.location,
            message
        };
    }

    shouldLog(level) {
        return LOG_LEVELS[level] <= this.currentLevel;
    }

    log(level, message, data = null) {
        if (!this.shouldLog(level)) {
            return;
        }

        const logData = this.formatMessage(level, message, data);
        
        // Console output with colors
        const color = this.enableColors ? LOG_COLORS[level] : '';
        if (color) {
            console.log(`%c${logData.formatted}`, color);
        } else {
            console.log(logData.formatted);
        }
        
        if (data) {
            console.log('Data:', data);
        }

        // Send to Extension Shell if available
        this.sendToExtensionShell(logData);
    }

    sendToExtensionShell(logData) {
        if (!this.isInExtensionShell) {
            return;
        }

        try {
            window.parent.postMessage({
                type: 'ADD_LOG',
                data: {
                    app: logData.app,
                    level: logData.level,
                    message: logData.data ? `${logData.message} ${JSON.stringify(logData.data)}` : logData.message,
                    location: logData.location,
                    timestamp: logData.timestamp
                }
            }, '*');
        } catch (error) {
            console.warn('Failed to send log to Extension Shell:', error);
        }
    }

    error(message, data = null) {
        this.log('error', message, data);
    }

    warn(message, data = null) {
        this.log('warn', message, data);
    }

    info(message, data = null) {
        this.log('info', message, data);
    }

    debug(message, data = null) {
        this.log('debug', message, data);
    }

    trace(message, data = null) {
        this.log('trace', message, data);
    }

    // Utility methods for browser context
    setLogLevel(level) {
        this.logLevel = level;
        this.currentLevel = LOG_LEVELS[level] || LOG_LEVELS.info;
        this.info(`Log level changed to ${level}`);
    }

    getLogLevel() {
        return this.logLevel;
    }

    isExtensionConnected() {
        return this.isInExtensionShell;
    }
}

/**
 * Factory function to create browser logger instances
 * @param {Object} options - Logger configuration
 * @param {string} options.logLevel - Log level (error, warn, info, debug, trace)
 * @param {string} options.appName - Application name
 * @param {string} options.location - File/module location
 * @param {boolean} options.enableColors - Enable color output
 * @param {boolean} options.enableTimestamp - Enable timestamp
 * @returns {BrowserLogger} Logger instance
 */
function createLogger(options = {}) {
    return new BrowserLogger(options);
}

// Global export for browser use
if (typeof window !== 'undefined') {
    window.CPQLogger = {
        createLogger,
        BrowserLogger,
        LOG_LEVELS,
        LOG_COLORS
    };
}

// Module export for compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createLogger,
        BrowserLogger,
        LOG_LEVELS,
        LOG_COLORS
    };
}