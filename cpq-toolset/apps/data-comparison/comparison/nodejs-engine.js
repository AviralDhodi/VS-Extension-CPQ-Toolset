// apps/data-comparison/comparison/nodejs-engine.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { createLogger } = require('../../../shared/logging/logger');

class NodeJSComparisonEngine {
    constructor(comparisonId, config) {
        this.comparisonId = comparisonId;
        this.config = config;
        this.logger = createLogger({ appName: 'NodeJS-Comparison' });
        
        // System fields to exclude from comparison but include in output
        this.systemFields = new Set([
            'CreatedDate', 
            'LastModifiedDate', 
            'CreatedBy.Name',
            'LastModifiedById',
            'CreatedById'
        ]);
        
        // Setup database path
        const projectRoot = process.cwd();
        const dbDir = path.join(projectRoot, 'tmp');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.dbPath = path.join(dbDir, `nodejs_compare_${comparisonId}.db`);
        this.db = new sqlite3.Database(this.dbPath);
        
        // Promisify database methods for easier async/await usage
        this.dbRun = promisify(this.db.run.bind(this.db));
        this.dbGet = promisify(this.db.get.bind(this.db));
        this.dbAll = promisify(this.db.all.bind(this.db));
        this.dbExec = promisify(this.db.exec.bind(this.db));
        
        // Enable optimizations
        this.initializeDatabase();
        
        // Parse orgs and objects
        this.orgs = config.orgs.reduce((acc, org) => {
            acc[org.username] = org;
            return acc;
        }, {});
        this.objects = config.objects || {};
        
        this.logger.info(`NodeJS engine initialized for ${Object.keys(this.orgs).length} orgs, ${Object.keys(this.objects).length} objects`);
    }

    async initializeDatabase() {
        try {
            // Enable optimizations
            await this.dbExec('PRAGMA journal_mode = WAL');
            await this.dbExec('PRAGMA synchronous = NORMAL');
            await this.dbExec('PRAGMA cache_size = 10000');
            await this.dbExec('PRAGMA foreign_keys = ON');
        } catch (error) {
            this.logger.warn('Could not set database optimizations:', error.message);
        }
    }

    async createDataTables(objectName) {
        try {
            const dataTable = `data_${objectName}`;
            const resultsTable = `results_${objectName}`;
            
            // Drop existing tables
            await this.dbRun(`DROP TABLE IF EXISTS ${dataTable}`);
            await this.dbRun(`DROP TABLE IF EXISTS ${resultsTable}`);
            
            // Create data table
            await this.dbRun(`
                CREATE TABLE ${dataTable} (
                    org_username TEXT NOT NULL,
                    record_id TEXT NOT NULL,
                    foreign_key_value TEXT,
                    record_data TEXT NOT NULL,
                    is_active INTEGER DEFAULT 1,
                    created_date TEXT,
                    modified_date TEXT,
                    created_by TEXT,
                    PRIMARY KEY (org_username, record_id)
                )
            `);
            
            // Create results table
            await this.dbRun(`
                CREATE TABLE ${resultsTable} (
                    record_id TEXT NOT NULL,
                    foreign_key_value TEXT,
                    comparison_type TEXT NOT NULL,
                    field_name TEXT,
                    differences TEXT,
                    org_values TEXT,
                    all_org_data TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (record_id, comparison_type, COALESCE(field_name, ''))
                )
            `);
            
            // Create indexes
            await this.dbRun(`CREATE INDEX idx_${dataTable}_record ON ${dataTable}(record_id)`);
            await this.dbRun(`CREATE INDEX idx_${dataTable}_foreign ON ${dataTable}(foreign_key_value)`);
            await this.dbRun(`CREATE INDEX idx_${resultsTable}_record ON ${resultsTable}(record_id)`);
            
            this.logger.info(`Created tables for object: ${objectName}`);
            
        } catch (error) {
            this.logger.error(`Error creating tables for ${objectName}:`, error);
            throw error;
        }
    }

    async storeOrgData(objectName, orgData) {
        try {
            const dataTable = `data_${objectName}`;
            const objectConfig = this.objects[objectName];
            const foreignKey = objectConfig.foreignKey;
            
            // Prepare insert statement
            const insertStmt = this.db.prepare(`
                INSERT INTO ${dataTable} 
                (org_username, record_id, foreign_key_value, record_data, is_active, 
                 created_date, modified_date, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            // Use transaction for better performance
            await this.dbRun('BEGIN TRANSACTION');
            
            try {
                let totalRecords = 0;
                
                for (const [orgUsername, records] of Object.entries(orgData)) {
                    for (const record of records) {
                        const foreignKeyValue = record[foreignKey];
                        const isActive = this.checkActiveConditions(record, objectConfig) ? 1 : 0;
                        
                        insertStmt.run(
                            orgUsername,
                            record.Id,
                            foreignKeyValue,
                            JSON.stringify(record),
                            isActive,
                            record.CreatedDate,
                            record.LastModifiedDate,
                            record['CreatedBy.Name']
                        );
                        
                        totalRecords++;
                    }
                    
                    const activeCount = await this.dbGet(`
                        SELECT COUNT(*) as count 
                        FROM ${dataTable} 
                        WHERE org_username = ? AND is_active = 1
                    `, [orgUsername]);
                    
                    this.logger.info(`Stored ${records.length} records (${activeCount.count} active) for ${orgUsername}`);
                }
                
                await this.dbRun('COMMIT');
                this.logger.info(`Total records stored for ${objectName}: ${totalRecords}`);
                
            } catch (error) {
                await this.dbRun('ROLLBACK');
                throw error;
            } finally {
                insertStmt.finalize();
            }
            
        } catch (error) {
            this.logger.error(`Error storing org data for ${objectName}:`, error);
            throw error;
        }
    }

    checkActiveConditions(record, objectConfig) {
        const activeCondition = objectConfig.ActiveCondition;
        if (!activeCondition) return true;
        
        // Simple active condition evaluation - extend as needed
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
            const dataTable = `data_${objectName}`;
            const resultsTable = `results_${objectName}`;
            const objectConfig = this.objects[objectName];
            const compareFields = objectConfig.Fields || [];
            
            // Get all unique foreign key values
            const foreignKeys = await this.dbAll(`
                SELECT DISTINCT foreign_key_value 
                FROM ${dataTable} 
                WHERE is_active = 1 AND foreign_key_value IS NOT NULL
            `);
            
            this.logger.info(`Comparing ${foreignKeys.length} unique records across ${Object.keys(this.orgs).length} orgs`);
            
            // Use transaction for performance
            await this.dbRun('BEGIN TRANSACTION');
            
            try {
                // Prepare statements
                const getRecordDataStmt = this.db.prepare(`
                    SELECT org_username, record_id, record_data 
                    FROM ${dataTable} 
                    WHERE foreign_key_value = ? AND is_active = 1
                `);
                
                const insertResultStmt = this.db.prepare(`
                    INSERT INTO ${resultsTable} 
                    (record_id, foreign_key_value, comparison_type, field_name, 
                     differences, org_values, all_org_data)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                
                for (const row of foreignKeys) {
                    const foreignKeyValue = row.foreign_key_value;
                    this.compareRecordAcrossOrgs(
                        foreignKeyValue, 
                        compareFields, 
                        getRecordDataStmt, 
                        insertResultStmt
                    );
                }
                
                await this.dbRun('COMMIT');
                
                getRecordDataStmt.finalize();
                insertResultStmt.finalize();
                
            } catch (error) {
                await this.dbRun('ROLLBACK');
                throw error;
            }
            
            this.logger.info(`Comparison completed for ${objectName}`);
            
        } catch (error) {
            this.logger.error(`Error comparing records for ${objectName}:`, error);
            throw error;
        }
    }

    compareRecordAcrossOrgs(foreignKeyValue, compareFields, getRecordDataStmt, insertResultStmt) {
        // Get record data from all orgs
        const rows = getRecordDataStmt.all(foreignKeyValue);
        const orgRecords = {};
        const allOrgData = {};
        
        for (const row of rows) {
            const recordData = JSON.parse(row.record_data);
            orgRecords[row.org_username] = recordData;
            allOrgData[row.org_username] = {
                record_id: row.record_id,
                data: recordData
            };
        }
        
        // Check for missing records
        const presentOrgs = new Set(Object.keys(orgRecords));
        const allOrgs = new Set(Object.keys(this.orgs));
        const missingOrgs = [...allOrgs].filter(org => !presentOrgs.has(org));
        
        if (missingOrgs.length > 0) {
            const recordId = foreignKeyValue;
            insertResultStmt.run(
                recordId,
                foreignKeyValue,
                'missing',
                null,
                JSON.stringify(missingOrgs),
                JSON.stringify(Object.fromEntries(missingOrgs.map(org => [org, 'MISSING']))),
                JSON.stringify(allOrgData)
            );
        }
        
        // Compare fields for orgs that have the record
        if (Object.keys(orgRecords).length > 1) {
            this.compareFieldsAcrossOrgs(
                foreignKeyValue, 
                orgRecords, 
                compareFields, 
                allOrgData, 
                insertResultStmt
            );
        }
    }

    compareFieldsAcrossOrgs(foreignKeyValue, orgRecords, compareFields, allOrgData, insertResultStmt) {
        const recordId = Object.values(orgRecords)[0].Id;
        
        for (const fieldName of compareFields) {
            if (this.systemFields.has(fieldName)) continue;
            
            // Get field values from all orgs
            const fieldValues = {};
            for (const [orgUsername, recordData] of Object.entries(orgRecords)) {
                fieldValues[orgUsername] = String(recordData[fieldName] || '');
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
                
                insertResultStmt.run(
                    recordId,
                    foreignKeyValue,
                    'different',
                    fieldName,
                    JSON.stringify(differentOrgs),
                    JSON.stringify(fieldValues),
                    JSON.stringify(allOrgData)
                );
            }
        }
    }

    async generateObjectSummary(objectName) {
        const resultsTable = `results_${objectName}`;
        const dataTable = `data_${objectName}`;
        
        const totalRecords = await this.dbGet(`
            SELECT COUNT(DISTINCT foreign_key_value) as count 
            FROM ${dataTable} 
            WHERE is_active = 1
        `);
        
        const missingCount = await this.dbGet(`
            SELECT COUNT(DISTINCT record_id) as count 
            FROM ${resultsTable} 
            WHERE comparison_type = 'missing'
        `);
        
        const differentFields = await this.dbGet(`
            SELECT COUNT(*) as count 
            FROM ${resultsTable} 
            WHERE comparison_type = 'different'
        `);
        
        return {
            object_name: objectName,
            total_records: totalRecords.count,
            missing_records: missingCount.count,
            field_differences: differentFields.count,
            status: 'completed'
        };
    }

    async processObjectComparison(objectName, orgData) {
        try {
            this.logger.info(`Processing comparison for object: ${objectName}`);
            
            // Create tables
            await this.createDataTables(objectName);
            
            // Store data
            await this.storeOrgData(objectName, orgData);
            
            // Perform comparison
            await this.compareObjectRecords(objectName);
            
            // Generate summary
            const summary = await this.generateObjectSummary(objectName);
            
            this.logger.info(`Completed comparison for ${objectName}:`, summary);
            return summary;
            
        } catch (error) {
            this.logger.error(`Error processing comparison for ${objectName}:`, error);
            throw error;
        }
    }

    async getComparisonResults(objectName) {
        try {
            const resultsTable = `results_${objectName}`;
            
            const rows = await this.dbAll(`
                SELECT record_id, foreign_key_value, comparison_type, field_name,
                       differences, org_values, all_org_data
                FROM ${resultsTable}
                ORDER BY foreign_key_value, comparison_type, field_name
            `);
            
            const results = {
                missing_records: [],
                field_differences: [],
                summary: await this.generateObjectSummary(objectName)
            };
            
            for (const row of rows) {
                const resultItem = {
                    record_id: row.record_id,
                    foreign_key_value: row.foreign_key_value,
                    comparison_type: row.comparison_type,
                    field_name: row.field_name,
                    differences: row.differences ? JSON.parse(row.differences) : [],
                    org_values: row.org_values ? JSON.parse(row.org_values) : {},
                    all_org_data: row.all_org_data ? JSON.parse(row.all_org_data) : {}
                };
                
                if (row.comparison_type === 'missing') {
                    results.missing_records.push(resultItem);
                } else if (row.comparison_type === 'different') {
                    results.field_differences.push(resultItem);
                }
            }
            
            return results;
            
        } catch (error) {
            this.logger.error(`Error getting results for ${objectName}:`, error);
            throw error;
        }
    }

    cleanup() {
        try {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        this.logger.error('Error closing database:', err);
                    } else {
                        this.logger.info('Database connection closed');
                    }
                });
            }
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
        }
    }
}

module.exports = NodeJSComparisonEngine;