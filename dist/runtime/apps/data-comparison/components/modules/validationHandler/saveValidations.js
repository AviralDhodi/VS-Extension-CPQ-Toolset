/**
 * Save Validations - Scalable Validation Handler
 * Runs validation functions sequentially and saves validated configurations
 */

const fs = require('fs');
const pkgReader = require('../../../../../shared/utils/pkgFileReader');
const path = require('path');
const { createLogger } = require('../../../../../shared/utils/logger');

/**
 * Validation Handler Class
 * Handles all validation operations for object configurations
 */
class ValidationHandler {
    constructor(options = {}) {
        this.logger = options.logger || createLogger({ 
            appName: 'ValidationHandler',
            location: 'validationHandler/saveValidations.js'
        });
        
        this.projectRoot = process.cwd();
        this.storageDir = path.join(this.projectRoot, 'apps', 'data-comparison', 'storage', 'config');
        
        // Ensure storage directory exists
        this.ensureStorageDirectory();
    }

    /**
     * Ensure storage directory exists
     */
    ensureStorageDirectory() {
        if (!pkgReader.existsSync(this.storageDir)) {
            pkgReader.mkdirSync(this.storageDir, { recursive: true });
            this.logger.info('Created storage directory', { path: this.storageDir });
        }
    }

    /**
     * Run all validations for an object configuration
     * @param {string} objectName - The Salesforce object name
     * @param {Object} config - The object configuration
     * @param {Array} orgs - List of organizations
     * @param {Object} options - Additional validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateObjectConfiguration(objectName, config, orgs, options = {}) {
        this.logger.info('Starting validation for object configuration', {
            object: objectName,
            orgs: orgs.length
        });

        const validationResult = {
            objectName,
            isValid: false,
            validations: {},
            errors: [],
            warnings: [],
            timestamp: new Date().toISOString()
        };

        try {
            // Run all validation functions sequentially
            const validationFunctions = [
                this.validateBasicConfiguration,
                this.validateFieldSelection,
                this.validateForeignKey,
                this.validateFieldTypes,
                this.validateObjectAccess,
                this.validateFieldAccess
            ];

            for (const validationFn of validationFunctions) {
                const validationName = validationFn.name;
                this.logger.debug(`Running validation: ${validationName}`);

                try {
                    const result = await validationFn.call(this, objectName, config, orgs, options);
                    validationResult.validations[validationName] = result;

                    if (!result.isValid) {
                        validationResult.errors.push(...(result.errors || []));
                        validationResult.warnings.push(...(result.warnings || []));
                    }
                } catch (error) {
                    this.logger.error(`Validation function ${validationName} failed`, { error: error.message });
                    validationResult.errors.push(`${validationName}: ${error.message}`);
                    validationResult.validations[validationName] = {
                        isValid: false,
                        error: error.message
                    };
                }
            }

            // Determine overall validity
            const allValidationsValid = Object.values(validationResult.validations)
                .every(v => v.isValid);
            
            validationResult.isValid = allValidationsValid && validationResult.errors.length === 0;

            this.logger.info('Validation completed', {
                object: objectName,
                isValid: validationResult.isValid,
                errors: validationResult.errors.length,
                warnings: validationResult.warnings.length
            });

            return validationResult;

        } catch (error) {
            this.logger.error('Validation failed with unexpected error', { 
                object: objectName,
                error: error.message 
            });

            validationResult.errors.push(`Unexpected validation error: ${error.message}`);
            return validationResult;
        }
    }

    /**
     * Validation 1: Basic Configuration Structure
     */
    async validateBasicConfiguration(objectName, config, orgs, options) {
        this.logger.debug('Validating basic configuration structure');

        const result = {
            isValid: false,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // Check if config exists
            result.checks.configExists = !!config;
            if (!config) {
                result.errors.push('Configuration object is missing');
                return result;
            }

            // Check if object name is valid
            result.checks.objectNameValid = typeof objectName === 'string' && objectName.length > 0;
            if (!result.checks.objectNameValid) {
                result.errors.push('Object name is invalid or empty');
            }

            // Check if fields array exists and has elements
            result.checks.fieldsExist = Array.isArray(config.fields) && config.fields.length > 0;
            if (!result.checks.fieldsExist) {
                result.errors.push('Fields array is missing or empty');
            }

            // Check if foreign key is specified
            result.checks.foreignKeyExists = typeof config.foreignKey === 'string' && config.foreignKey.length > 0;
            if (!result.checks.foreignKeyExists) {
                result.errors.push('Foreign key is missing or invalid');
            }

            // Check if orgs are provided
            result.checks.orgsProvided = Array.isArray(orgs) && orgs.length > 0;
            if (!result.checks.orgsProvided) {
                result.errors.push('Organizations list is missing or empty');
            }

            result.isValid = result.errors.length === 0;
            
            this.logger.debug('Basic configuration validation completed', { 
                isValid: result.isValid,
                checks: Object.keys(result.checks).filter(k => result.checks[k]).length
            });

            return result;

        } catch (error) {
            result.errors.push(`Basic validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Validation 2: Field Selection Validation
     */
    async validateFieldSelection(objectName, config, orgs, options) {
        this.logger.debug('Validating field selection');

        const result = {
            isValid: false,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // Check minimum field count
            const minFields = options.minFields || 1;
            result.checks.minimumFields = config.fields.length >= minFields;
            if (!result.checks.minimumFields) {
                result.errors.push(`At least ${minFields} field(s) must be selected`);
            }

            // Check maximum field count (optional)
            if (options.maxFields) {
                result.checks.maximumFields = config.fields.length <= options.maxFields;
                if (!result.checks.maximumFields) {
                    result.warnings.push(`More than ${options.maxFields} fields selected, may impact performance`);
                }
            }

            // Check for duplicate fields
            const uniqueFields = new Set(config.fields);
            result.checks.noDuplicateFields = uniqueFields.size === config.fields.length;
            if (!result.checks.noDuplicateFields) {
                result.errors.push('Duplicate fields found in selection');
            }

            // Check field name format
            const invalidFields = config.fields.filter(field => 
                typeof field !== 'string' || field.length === 0 || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field)
            );
            result.checks.validFieldNames = invalidFields.length === 0;
            if (!result.checks.validFieldNames) {
                result.errors.push(`Invalid field names: ${invalidFields.join(', ')}`);
            }

            result.isValid = result.errors.length === 0;

            this.logger.debug('Field selection validation completed', { 
                isValid: result.isValid,
                fieldCount: config.fields.length
            });

            return result;

        } catch (error) {
            result.errors.push(`Field validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Validation 3: Foreign Key Validation
     */
    async validateForeignKey(objectName, config, orgs, options) {
        this.logger.debug('Validating foreign key configuration');

        const result = {
            isValid: false,
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // Check if foreign key is in selected fields
            result.checks.foreignKeyInFields = config.fields.includes(config.foreignKey);
            if (!result.checks.foreignKeyInFields) {
                result.errors.push('Foreign key must be included in selected fields');
            }

            // Check foreign key naming convention
            result.checks.foreignKeyFormat = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(config.foreignKey);
            if (!result.checks.foreignKeyFormat) {
                result.errors.push('Foreign key has invalid format');
            }

            // Warn if foreign key is not a standard identifier field
            const standardIds = ['Id', 'Name', 'ExternalId__c'];
            const isStandardId = standardIds.some(id => 
                config.foreignKey.toLowerCase().includes(id.toLowerCase())
            );
            
            if (!isStandardId) {
                result.warnings.push('Foreign key may not be a standard identifier field');
            }

            result.isValid = result.errors.length === 0;

            this.logger.debug('Foreign key validation completed', { 
                isValid: result.isValid,
                foreignKey: config.foreignKey
            });

            return result;

        } catch (error) {
            result.errors.push(`Foreign key validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Validation 4: Field Types Validation (if type information available)
     */
    async validateFieldTypes(objectName, config, orgs, options) {
        this.logger.debug('Validating field types');

        const result = {
            isValid: true, // Default to valid since this is optional
            errors: [],
            warnings: [],
            checks: {}
        };

        try {
            // This validation is optional and depends on having field metadata
            if (options.fieldMetadata) {
                const metadata = options.fieldMetadata;
                
                // Check if all selected fields exist in metadata
                const missingFields = config.fields.filter(field => !metadata[field]);
                result.checks.allFieldsExistInMetadata = missingFields.length === 0;
                
                if (!result.checks.allFieldsExistInMetadata) {
                    result.warnings.push(`Fields not found in metadata: ${missingFields.join(', ')}`);
                }

                // Check foreign key type
                if (metadata[config.foreignKey]) {
                    const fkType = metadata[config.foreignKey].type;
                    const goodFkTypes = ['id', 'string', 'reference', 'externalId'];
                    result.checks.foreignKeyTypeValid = goodFkTypes.includes(fkType?.toLowerCase());
                    
                    if (!result.checks.foreignKeyTypeValid) {
                        result.warnings.push(`Foreign key type '${fkType}' may not be suitable for comparison`);
                    }
                }
            } else {
                result.warnings.push('Field metadata not available, skipping type validation');
            }

            // Field types validation never fails the overall validation
            result.isValid = true;

            this.logger.debug('Field types validation completed', { 
                hasMetadata: !!options.fieldMetadata
            });

            return result;

        } catch (error) {
            result.warnings.push(`Field types validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Validation 5: Object Access Validation
     */
    async validateObjectAccess(objectName, config, orgs, options) {
        this.logger.debug('Validating object access across orgs');

        const result = {
            isValid: false,
            errors: [],
            warnings: [],
            checks: {},
            orgResults: {}
        };

        try {
            // For now, we'll do basic object name validation
            // In a full implementation, this would check SFDX describe calls
            
            result.checks.objectNameFormat = /^[a-zA-Z][a-zA-Z0-9_]*__?[c]?$/.test(objectName);
            if (!result.checks.objectNameFormat) {
                result.errors.push('Object name does not follow Salesforce naming convention');
            }

            // Check if object name suggests it's a standard vs custom object
            const isStandardObject = !objectName.includes('__');
            const isCustomObject = objectName.endsWith('__c');
            
            result.checks.validObjectType = isStandardObject || isCustomObject;
            if (!result.checks.validObjectType) {
                result.warnings.push('Object name pattern suggests it may not be a valid Salesforce object');
            }

            // Placeholder for per-org validation
            orgs.forEach(org => {
                result.orgResults[org] = {
                    accessible: true, // Would be determined by actual SFDX call
                    note: 'Object access validation requires SFDX integration'
                };
            });

            result.isValid = result.errors.length === 0;

            this.logger.debug('Object access validation completed', { 
                isValid: result.isValid,
                objectName,
                orgs: orgs.length
            });

            return result;

        } catch (error) {
            result.errors.push(`Object access validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Validation 6: Field Access Validation
     */
    async validateFieldAccess(objectName, config, orgs, options) {
        this.logger.debug('Validating field access across orgs');

        const result = {
            isValid: false,
            errors: [],
            warnings: [],
            checks: {},
            fieldResults: {}
        };

        try {
            // Basic field name validation
            config.fields.forEach(fieldName => {
                const fieldValid = /^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName);
                result.fieldResults[fieldName] = {
                    nameValid: fieldValid,
                    accessible: true, // Would be determined by actual SFDX call
                    note: 'Field access validation requires SFDX integration'
                };

                if (!fieldValid) {
                    result.errors.push(`Invalid field name format: ${fieldName}`);
                }
            });

            // Check for system fields that should always be accessible
            const systemFields = ['Id', 'Name', 'CreatedDate', 'LastModifiedDate'];
            const hasSystemField = config.fields.some(field => systemFields.includes(field));
            
            if (hasSystemField) {
                result.checks.includesSystemFields = true;
            } else {
                result.warnings.push('No standard system fields included (Id, Name, etc.)');
            }

            result.isValid = result.errors.length === 0;

            this.logger.debug('Field access validation completed', { 
                isValid: result.isValid,
                fields: config.fields.length
            });

            return result;

        } catch (error) {
            result.errors.push(`Field access validation error: ${error.message}`);
            return result;
        }
    }

    /**
     * Save validated configuration to file
     * @param {string} filename - Configuration filename
     * @param {string} objectName - Object name
     * @param {Object} config - Validated configuration
     * @param {Object} validationResult - Validation results
     * @returns {Promise<Object>} Save result
     */
    async saveValidatedConfiguration(filename, objectName, config, validationResult) {
        this.logger.info('Saving validated configuration', {
            filename,
            isValid: validationResult.isValid
        });

        try {
            const configPath = path.join(this.storageDir, filename);
            
            // Load existing config
            let existingConfig = {};
            if (pkgReader.existsSync(configPath)) {
                const configContent = pkgReader.readFileSync(configPath, 'utf8');
                existingConfig = JSON.parse(configContent);
            }

            // Update with validated object configuration
            if (!existingConfig.objects) {
                existingConfig.objects = {};
            }

            existingConfig.objects[objectName] = {
                ...config,
                validatedAt: validationResult.timestamp,
                validationResult: {
                    isValid: validationResult.isValid,
                    errors: validationResult.errors,
                    warnings: validationResult.warnings,
                    validations: Object.keys(validationResult.validations).reduce((acc, key) => {
                        acc[key] = validationResult.validations[key].isValid;
                        return acc;
                    }, {})
                }
            };

            // Update metadata
            existingConfig.lastModified = new Date().toISOString();
            existingConfig.version = existingConfig.version || '1.0.0';

            // Save to file
            pkgReader.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2));

            this.logger.info('Configuration saved successfully', { 
                path: configPath,
                objectName,
                totalObjects: Object.keys(existingConfig.objects).length
            });

            return {
                success: true,
                path: configPath,
                objectName,
                config: existingConfig.objects[objectName]
            };

        } catch (error) {
            this.logger.error('Failed to save configuration', { 
                error: error.message,
                filename,
                objectName
            });

            return {
                success: false,
                error: error.message,
                filename,
                objectName
            };
        }
    }

    /**
     * Validate and save object configuration (main entry point)
     * @param {string} filename - Configuration filename
     * @param {string} objectName - Object name
     * @param {Object} config - Object configuration
     * @param {Array} orgs - Organizations list
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Complete result
     */
    async validateAndSave(filename, objectName, config, orgs, options = {}) {
        this.logger.info('Starting validate and save process', {
            filename,
            orgs: orgs.length
        });

        try {
            // Step 1: Run all validations
            const validationResult = await this.validateObjectConfiguration(objectName, config, orgs, options);

            // Step 2: If validation passes, save to file
            let saveResult = null;
            if (validationResult.isValid) {
                saveResult = await this.saveValidatedConfiguration(filename, objectName, config, validationResult);
            } else {
                this.logger.warn('Validation failed, not saving configuration', {
                    objectName,
                    errors: validationResult.errors
                });
            }

            return {
                success: validationResult.isValid,
                validation: validationResult,
                save: saveResult,
                message: validationResult.isValid ? 
                    'Configuration validated and saved successfully' : 
                    'Validation failed, configuration not saved'
            };

        } catch (error) {
            this.logger.error('Validate and save process failed', {
                error: error.message,
                filename,
                objectName
            });

            return {
                success: false,
                error: error.message,
                message: 'Validation and save process failed'
            };
        }
    }
}

/**
 * Factory function to create validation handler
 */
function createValidationHandler(options = {}) {
    return new ValidationHandler(options);
}

/**
 * Convenience function for single object validation
 */
async function validateObject(objectName, config, orgs, options = {}) {
    const handler = createValidationHandler(options);
    return await handler.validateObjectConfiguration(objectName, config, orgs, options);
}

/**
 * Convenience function for validate and save
 */
async function validateAndSave(filename, objectName, config, orgs, options = {}) {
    const handler = createValidationHandler(options);
    return await handler.validateAndSave(filename, objectName, config, orgs, options);
}

module.exports = {
    ValidationHandler,
    createValidationHandler,
    validateObject,
    validateAndSave
};