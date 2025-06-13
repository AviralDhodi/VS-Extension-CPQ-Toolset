// apps/data-comparison/comparison/file-engine.js

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../../../shared/logging/logger');

class FileBasedComparisonEngine {
    constructor(comparisonId, config) {
        this.comparisonId = comparisonId;
        this.config = config;
        this.logger = createLogger({ appName: 'FileBasedComparison' });
        
        // System fields to exclude from comparison but include in output
        this.systemFields = new Set([
            'CreatedDate', 
            'LastModifiedDate', 
            'CreatedBy.Name',
            'LastModifiedById',
            'CreatedById'
        ]);
        
        // Setup file storage path
        const projectRoot = process.cwd();
        this.dataDir = path.join(projectRoot, 'tmp', `comparison_${comparisonId}`);
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        
        // Parse orgs and objects
        this.orgs = config.orgs.reduce((acc, org) => {
            acc[org.username] = org;
            return acc;
        }, {});
        this.objects = config.objects || {};
        
        this.logger.info(`File-based engine initialized for ${Object.keys(this.orgs).length} orgs, ${Object.keys(this.objects).length} objects`);
    }

    async storeOrgData(objectName, orgData) {
        try {
            const objectDataPath = path.join(this.dataDir, `${objectName}_data.json`);
            const objectConfig = this.objects[objectName];
            const foreignKey = objectConfig.foreignKey;
            
            const processedData = {};
            
            for (const [orgUsername, records] of Object.entries(orgData)) {
                processedData[orgUsername] = records.map(record => ({
                    ...record,
                    _isActive: this.checkActiveConditions(record, objectConfig),
                    _foreignKeyValue: record[foreignKey]
                }));
                
                this.logger.info(`Processed ${records.length} records for ${orgUsername}`);
            }
            
            // Save to file
            fs.writeFileSync(objectDataPath, JSON.stringify(processedData, null, 2));
            this.logger.info(`Stored data for ${objectName} to ${objectDataPath}`);
            
        } catch (error) {
            this.logger.error(`Error storing org data for ${objectName}:`, error);
            throw error;
        }
    }

    checkActiveConditions(record, objectConfig) {
        const activeCondition = objectConfig.ActiveCondition;
        if (!activeCondition) return true;
        
        // Simple active condition evaluation
        if (activeCondition.includes('IsActive__c = true')) {
            return String(record.IsActive__c || '').toLowerCase() === 'true';
        }
        if (activeCondition.includes('Active__c = true')) {
            return String(record.Active__c || '').toLowerCase() === 'true';
        }
        
        return true; // Default to active
    }

    async compareObjectRecords(objectName) {
        try {
            const objectDataPath = path.join(this.dataDir, `${objectName}_data.json`);
            const resultsPath = path.join(this.dataDir, `${objectName}_results.json`);
            
            // Load data
            const orgData = JSON.parse(fs.readFileSync(objectDataPath, 'utf8'));
            const objectConfig = this.objects[objectName];
            const compareFields = objectConfig.Fields || [];
            
            // Build foreign key index
            const foreignKeyIndex = {};
            
            for (const [orgUsername, records] of Object.entries(orgData)) {
                for (const record of records) {
                    if (record._isActive && record._foreignKeyValue) {
                        if (!foreignKeyIndex[record._foreignKeyValue]) {
                            foreignKeyIndex[record._foreignKeyValue] = {};
                        }
                        foreignKeyIndex[record._foreignKeyValue][orgUsername] = record;
                    }
                }
            }
            
            const results = {
                missing_records: [],
                field_differences: [],
                summary: {
                    object_name: objectName,
                    total_records: Object.keys(foreignKeyIndex).length,
                    missing_records: 0,
                    field_differences: 0
                }
            };
            
            const allOrgNames = Object.keys(this.orgs);
            
            // Process each foreign key
            for (const [foreignKeyValue, orgRecords] of Object.entries(foreignKeyIndex)) {
                const presentOrgs = Object.keys(orgRecords);
                const missingOrgs = allOrgNames.filter(org => !presentOrgs.includes(org));
                
                // Check for missing records
                if (missingOrgs.length > 0) {
                    results.missing_records.push({
                        record_id: foreignKeyValue,
                        foreign_key_value: foreignKeyValue,
                        comparison_type: 'missing',
                        differences: missingOrgs,
                        org_values: Object.fromEntries(missingOrgs.map(org => [org, 'MISSING'])),
                        all_org_data: Object.fromEntries(
                            presentOrgs.map(org => [org, {
                                record_id: orgRecords[org].Id,
                                data: orgRecords[org]
                            }])
                        )
                    });
                    results.summary.missing_records++;
                }
                
                // Compare fields for orgs that have the record
                if (presentOrgs.length > 1) {
                    this.compareFieldsForRecord(
                        foreignKeyValue,
                        orgRecords,
                        compareFields,
                        results
                    );
                }
            }
            
            // Save results
            fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
            this.logger.info(`Comparison completed for ${objectName}: ${results.summary.missing_records} missing, ${results.summary.field_differences} field differences`);
            
            return results.summary;
            
        } catch (error) {
            this.logger.error(`Error comparing records for ${objectName}:`, error);
            throw error;
        }
    }

    compareFieldsForRecord(foreignKeyValue, orgRecords, compareFields, results) {
        const recordId = Object.values(orgRecords)[0].Id;
        
        for (const fieldName of compareFields) {
            if (this.systemFields.has(fieldName)) continue;
            
            // Get field values from all orgs
            const fieldValues = {};
            for (const [orgUsername, record] of Object.entries(orgRecords)) {
                fieldValues[orgUsername] = String(record[fieldName] || '');
            }
            
            // Check if all values are the same
            const uniqueValues = new Set(Object.values(fieldValues));
            
            if (uniqueValues.size > 1) {
                // Find orgs with different values
                const valueGroups = {};
                for (const [org, value] of Object.entries(fieldValues)) {
                    if (!valueGroups[value]) valueGroups[value] = [];
                    valueGroups[value].push(org);
                }
                
                // Mark orgs with minority values as different
                const maxGroupSize = Math.max(...Object.values(valueGroups).map(orgs => orgs.length));
                const differentOrgs = [];
                
                for (const [value, orgs] of Object.entries(valueGroups)) {
                    if (orgs.length < maxGroupSize) {
                        differentOrgs.push(...orgs);
                    }
                }
                
                results.field_differences.push({
                    record_id: recordId,
                    foreign_key_value: foreignKeyValue,
                    comparison_type: 'different',
                    field_name: fieldName,
                    differences: differentOrgs,
                    org_values: fieldValues,
                    all_org_data: Object.fromEntries(
                        Object.entries(orgRecords).map(([org, record]) => [org, {
                            record_id: record.Id,
                            data: record
                        }])
                    )
                });
                
                results.summary.field_differences++;
            }
        }
    }

    async processObjectComparison(objectName, orgData) {
        try {
            this.logger.info(`Processing comparison for object: ${objectName}`);
            
            // Store data
            await this.storeOrgData(objectName, orgData);
            
            // Perform comparison
            const summary = await this.compareObjectRecords(objectName);
            
            this.logger.info(`Completed comparison for ${objectName}:`, summary);
            return summary;
            
        } catch (error) {
            this.logger.error(`Error processing comparison for ${objectName}:`, error);
            throw error;
        }
    }

    async getComparisonResults(objectName) {
        try {
            const resultsPath = path.join(this.dataDir, `${objectName}_results.json`);
            
            if (!fs.existsSync(resultsPath)) {
                throw new Error(`Results not found for object: ${objectName}`);
            }
            
            const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
            return results;
            
        } catch (error) {
            this.logger.error(`Error getting results for ${objectName}:`, error);
            throw error;
        }
    }

    cleanup() {
        try {
            // Optional: clean up temporary files
            this.logger.info('File-based engine cleanup completed');
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
}

module.exports = FileBasedComparisonEngine;