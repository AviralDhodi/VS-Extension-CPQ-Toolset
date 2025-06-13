// Application constants
const APP_CONSTANTS = {
    NAME: 'CPQ Toolset',
    VERSION: '1.0.0',
    
    // Server configuration
    DEFAULT_PORT: 3000,
    
    // Database configuration
    DB_FILE: 'cpq-toolset.db',
    
    // Validation constants
    VALIDATION: {
        MAX_LOOKUP_DEPTH: 1,
        MIN_ORGS_REQUIRED: 2,
        MAX_ORGS_SUPPORTED: 10,
        ORG_ID_LENGTH: { MIN: 15, MAX: 18 }
    },
    
    // File paths
    PATHS: {
        TEMP_DIR: 'tmp',
        LOGS_DIR: 'logs',
        CONFIG_DIR: 'config',
        APPS_DIR: 'apps'
    },
    
    // HTTP status codes
    HTTP_STATUS: {
        OK: 200,
        CREATED: 201,
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        INTERNAL_ERROR: 500
    },
    
    // Error codes
    ERROR_CODES: {
        VALIDATION_FAILED: 'VALIDATION_FAILED',
        ORG_NOT_FOUND: 'ORG_NOT_FOUND',
        SFDX_ERROR: 'SFDX_ERROR',
        DATABASE_ERROR: 'DATABASE_ERROR',
        CONFIG_ERROR: 'CONFIG_ERROR'
    }
};

// Environment-based configuration
const ENV_CONFIG = {
    development: {
        logLevel: 'debug',
        enableFileLogging: true,
        dbPath: './tmp/dev-cpq-toolset.db'
    },
    production: {
        logLevel: 'info',
        enableFileLogging: true,
        dbPath: './tmp/prod-cpq-toolset.db'
    },
    test: {
        logLevel: 'error',
        enableFileLogging: false,
        dbPath: ':memory:'
    }
};

function getConfig(env = process.env.NODE_ENV || 'development') {
    return {
        ...APP_CONSTANTS,
        ...ENV_CONFIG[env],
        environment: env
    };
}

module.exports = {
    APP_CONSTANTS,
    ENV_CONFIG,
    getConfig
};