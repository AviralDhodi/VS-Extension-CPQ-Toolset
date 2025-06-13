const { defaultLogger } = require('../logging/logger');

class ValidationError extends Error {
    constructor(message, field = null, code = null) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.code = code;
    }
}

class ValidationResult {
    constructor() {
        this.isValid = true;
        this.errors = [];
        this.warnings = [];
    }

    addError(message, field = null, code = null) {
        this.isValid = false;
        this.errors.push({
            message,
            field,
            code,
            type: 'error'
        });
    }

    addWarning(message, field = null, code = null) {
        this.warnings.push({
            message,
            field,
            code,
            type: 'warning'
        });
    }

    hasErrors() {
        return this.errors.length > 0;
    }

    hasWarnings() {
        return this.warnings.length > 0;
    }

    getAllIssues() {
        return [...this.errors, ...this.warnings];
    }
}

class Validator {
    constructor(logger = defaultLogger) {
        this.logger = logger;
    }

    // Org validation
    validateOrg(org) {
        const result = new ValidationResult();

        if (!org) {
            result.addError('Org object is required');
            return result;
        }

        // Required fields
        if (!org.username) {
            result.addError('Username is required', 'username', 'REQUIRED_FIELD');
        }

        if (!org.orgId) {
            result.addError('Org ID is required', 'orgId', 'REQUIRED_FIELD');
        }

        if (!org.instanceUrl) {
            result.addError('Instance URL is required', 'instanceUrl', 'REQUIRED_FIELD');
        }

        // Format validation
        if (org.instanceUrl && !this.isValidUrl(org.instanceUrl)) {
            result.addError('Invalid instance URL format', 'instanceUrl', 'INVALID_FORMAT');
        }

        // Org ID format (18 characters)
        if (org.orgId && !/^[a-zA-Z0-9]{15,18}$/.test(org.orgId)) {
            result.addError('Invalid Org ID format', 'orgId', 'INVALID_FORMAT');
        }

        this.logger.debug('Org validation completed', { 
            username: org.username, 
            isValid: result.isValid,
            errorCount: result.errors.length 
        });

        return result;
    }

    // Object/Field validation
    validateObjectField(objectField) {
        const result = new ValidationResult();

        if (!objectField || typeof objectField !== 'string') {
            result.addError('Object field must be a string');
            return result;
        }

        // Check format: Object.Field or Object.Lookup__r.Field
        const fieldPattern = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
        if (!fieldPattern.test(objectField)) {
            result.addError('Invalid object field format', 'objectField', 'INVALID_FORMAT');
        }

        // Check lookup depth (max 1 level)
        const parts = objectField.split('.');
        if (parts.length > 3) {
            result.addError('Maximum lookup depth exceeded (1 level)', 'objectField', 'MAX_DEPTH_EXCEEDED');
        }

        return result;
    }

    // Config validation
    validateConfig(config) {
        const result = new ValidationResult();

        if (!config || typeof config !== 'object') {
            result.addError('Config must be an object');
            return result;
        }

        // Validate orgs
        if (!config.orgs || !Array.isArray(config.orgs)) {
            result.addError('Orgs array is required', 'orgs', 'REQUIRED_FIELD');
        } else if (config.orgs.length < 2) {
            result.addError('At least 2 orgs required for comparison', 'orgs', 'MIN_COUNT');
        } else {
            config.orgs.forEach((org, index) => {
                const orgResult = this.validateOrg(org);
                if (orgResult.hasErrors()) {
                    orgResult.errors.forEach(error => {
                        result.addError(
                            `Org ${index + 1}: ${error.message}`,
                            `orgs[${index}].${error.field}`,
                            error.code
                        );
                    });
                }
            });
        }

        // Validate objects
        if (!config.objects || !Array.isArray(config.objects)) {
            result.addError('Objects array is required', 'objects', 'REQUIRED_FIELD');
        } else if (config.objects.length === 0) {
            result.addError('At least 1 object required', 'objects', 'MIN_COUNT');
        }

        // Validate date filters if present
        if (config.dateFilters) {
            this.validateDateFilters(config.dateFilters, result);
        }

        return result;
    }

    validateDateFilters(dateFilters, result) {
        if (typeof dateFilters !== 'object') {
            result.addError('Date filters must be an object', 'dateFilters', 'INVALID_TYPE');
            return;
        }

        // Validate date format
        Object.entries(dateFilters).forEach(([key, value]) => {
            if (value && !this.isValidDate(value)) {
                result.addError(`Invalid date format for ${key}`, `dateFilters.${key}`, 'INVALID_DATE');
            }
        });
    }

    // Helper methods
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch {
            return false;
        }
    }

    isValidDate(dateString) {
        if (!dateString) return false;
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    // Static validation methods for quick use
    static validateRequired(value, fieldName = 'field') {
        if (value === null || value === undefined || value === '') {
            throw new ValidationError(`${fieldName} is required`, fieldName, 'REQUIRED_FIELD');
        }
        return true;
    }

    static validateArray(value, fieldName = 'field', minLength = 0) {
        if (!Array.isArray(value)) {
            throw new ValidationError(`${fieldName} must be an array`, fieldName, 'INVALID_TYPE');
        }
        if (value.length < minLength) {
            throw new ValidationError(`${fieldName} must have at least ${minLength} items`, fieldName, 'MIN_LENGTH');
        }
        return true;
    }
}

module.exports = {
    Validator,
    ValidationError,
    ValidationResult
};