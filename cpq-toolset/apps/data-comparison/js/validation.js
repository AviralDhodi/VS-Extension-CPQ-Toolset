// /apps/data-comparison/js/validation.js
class ConfigValidator {
    constructor() {
        this.validationRules = {
            object: {
                required: ['foreignKey'],
                optional: ['Fields', 'Active', 'ActiveCondition', 'LastModifiedBetween', 'CreatedBetween']
            },
            foreignKey: {
                required: true,
                unique: true // Only one foreign key per object
            },
            fields: {
                minLength: 1,
                type: 'array'
            },
            dateFilters: {
                format: 'YYYY-MM-DD',
                arrayLength: 2
            }
        };
    }

    /**
     * Validates the entire config structure
     * @param {Object} config - The config object to validate
     * @returns {Object} - {isValid: boolean, errors: array, warnings: array}
     */
    validateConfig(config) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!config || typeof config !== 'object') {
            result.isValid = false;
            result.errors.push('Config must be a valid object');
            return result;
        }

        // Validate each object in the config
        Object.entries(config).forEach(([objectName, objectConfig]) => {
            const objectValidation = this.validateObject(objectName, objectConfig);
            if (!objectValidation.isValid) {
                result.isValid = false;
                result.errors.push(...objectValidation.errors.map(err => `${objectName}: ${err}`));
            }
            result.warnings.push(...objectValidation.warnings.map(warn => `${objectName}: ${warn}`));
        });

        // Cross-object validations
        this.validateCrossObject(config, result);

        return result;
    }

    /**
     * Validates a single object configuration
     * @param {string} objectName - Name of the object
     * @param {Object} objectConfig - Configuration for the object
     * @returns {Object} - Validation result
     */
    validateObject(objectName, objectConfig) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!objectConfig || typeof objectConfig !== 'object') {
            result.isValid = false;
            result.errors.push('Object configuration must be a valid object');
            return result;
        }

        // Validate foreign key
        if (!objectConfig.foreignKey) {
            result.isValid = false;
            result.errors.push('Foreign key is required');
        }

        // Validate fields array
        if (objectConfig.Fields && !Array.isArray(objectConfig.Fields)) {
            result.isValid = false;
            result.errors.push('Fields must be an array');
        } else if (objectConfig.Fields && objectConfig.Fields.length === 0) {
            result.warnings.push('No fields selected for comparison');
        }

        // Validate active fields array
        if (objectConfig.Active && !Array.isArray(objectConfig.Active)) {
            result.isValid = false;
            result.errors.push('Active fields must be an array');
        }

        // Validate date filters
        if (objectConfig.LastModifiedBetween) {
            const dateValidation = this.validateDateFilter('LastModifiedBetween', objectConfig.LastModifiedBetween);
            if (!dateValidation.isValid) {
                result.errors.push(...dateValidation.errors);
            }
        }

        if (objectConfig.CreatedBetween) {
            const dateValidation = this.validateDateFilter('CreatedBetween', objectConfig.CreatedBetween);
            if (!dateValidation.isValid) {
                result.errors.push(...dateValidation.errors);
            }
        }

        // Validate active condition
        if (objectConfig.ActiveCondition && typeof objectConfig.ActiveCondition !== 'string') {
            result.isValid = false;
            result.errors.push('Active condition must be a string');
        }

        return result;
    }

    /**
     * Validates date filter format
     * @param {string} filterName - Name of the date filter
     * @param {Array} dateFilter - Array of date strings
     * @returns {Object} - Validation result
     */
    validateDateFilter(filterName, dateFilter) {
        const result = {
            isValid: true,
            errors: []
        };

        if (!Array.isArray(dateFilter)) {
            result.isValid = false;
            result.errors.push(`${filterName} must be an array`);
            return result;
        }

        if (dateFilter.length !== 2) {
            result.isValid = false;
            result.errors.push(`${filterName} must contain exactly 2 dates`);
            return result;
        }

        // Validate date format and order
        const [startDate, endDate] = dateFilter;
        if (startDate && !this.isValidDate(startDate)) {
            result.isValid = false;
            result.errors.push(`${filterName} start date is invalid`);
        }

        if (endDate && !this.isValidDate(endDate)) {
            result.isValid = false;
            result.errors.push(`${filterName} end date is invalid`);
        }

        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            result.isValid = false;
            result.errors.push(`${filterName} start date must be before end date`);
        }

        return result;
    }

    /**
     * Cross-object validations
     * @param {Object} config - Full config object
     * @param {Object} result - Result object to modify
     */
    validateCrossObject(config, result) {
        const foreignKeys = [];
        
        // Check for duplicate foreign keys across objects
        Object.entries(config).forEach(([objectName, objectConfig]) => {
            if (objectConfig.foreignKey) {
                const key = `${objectName}.${objectConfig.foreignKey}`;
                if (foreignKeys.includes(key)) {
                    result.isValid = false;
                    result.errors.push(`Duplicate foreign key found: ${key}`);
                } else {
                    foreignKeys.push(key);
                }
            }
        });

        // Ensure at least one object has fields selected
        const objectsWithFields = Object.values(config).filter(obj => 
            obj.Fields && obj.Fields.length > 0
        );

        if (objectsWithFields.length === 0) {
            result.warnings.push('No objects have fields selected for comparison');
        }
    }

    /**
     * Validates a date string
     * @param {string} dateString - Date string to validate
     * @returns {boolean} - Whether the date is valid
     */
    isValidDate(dateString) {
        if (!dateString) return false;
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    }

    /**
     * Quick validation for real-time feedback
     * @param {string} objectName - Object name
     * @param {string} field - Field being validated
     * @param {*} value - Value to validate
     * @returns {Object} - Validation result
     */
    validateField(objectName, field, value) {
        const result = {
            isValid: true,
            error: null
        };

        switch (field) {
            case 'foreignKey':
                if (!value) {
                    result.isValid = false;
                    result.error = 'Foreign key is required';
                }
                break;
            
            case 'ActiveCondition':
                if (value && typeof value !== 'string') {
                    result.isValid = false;
                    result.error = 'Active condition must be a string';
                }
                break;
            
            case 'dateFilter':
                if (value && !this.isValidDate(value)) {
                    result.isValid = false;
                    result.error = 'Invalid date format';
                }
                break;
            
            default:
                // Field validation passed
                break;
        }

        return result;
    }

    /**
     * Generates a simple validation report
     * @param {Object} config - Config to validate
     * @returns {string} - HTML formatted validation report
     */
    generateValidationReport(config) {
        const validation = this.validateConfig(config);
        
        let report = '<div class="validation-report">';
        
        if (validation.isValid) {
            report += '<div class="validation-success"><i data-lucide="check-circle"></i> Configuration is valid</div>';
        } else {
            report += '<div class="validation-error"><i data-lucide="x-circle"></i> Configuration has errors</div>';
            
            if (validation.errors.length > 0) {
                report += '<div class="validation-errors"><h4>Errors:</h4><ul>';
                validation.errors.forEach(error => {
                    report += `<li>${error}</li>`;
                });
                report += '</ul></div>';
            }
        }
        
        if (validation.warnings.length > 0) {
            report += '<div class="validation-warnings"><h4>Warnings:</h4><ul>';
            validation.warnings.forEach(warning => {
                report += `<li>${warning}</li>`;
            });
            report += '</ul></div>';
        }
        
        report += '</div>';
        return report;
    }
}

// Mock validation for development - will return validated after delay
class MockValidator extends ConfigValidator {
    async validateConfig(config) {
        // Simulate server validation delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const result = super.validateConfig(config);
        
        // For now, always return as validated for demo purposes
        result.isValid = true;
        result.errors = [];
        
        return result;
    }
}

// Export for use in other modules
window.ConfigValidator = ConfigValidator;
window.MockValidator = MockValidator;