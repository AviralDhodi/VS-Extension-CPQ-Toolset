const { getSFDXRunner } = require('../../../shared/sfdx/runner');
const { createLogger } = require('../../../shared/logging/logger');
const { executeGraphQLQuery, injectAfterCursor, escapeGraphQLForCLI } = require('./graphql_cli_runner');

const logger = createLogger({ appName: 'DataComparison-SFDX' });
const sfdx = getSFDXRunner(logger);

class DataComparisonSFDX {
    constructor() {
        this.runner = sfdx;
        this.logger = logger;
    }

    // Org Management Commands
    async getAuthenticatedOrgs() {
        this.logger.info('Fetching authenticated orgs');
        
        try {
            const result = await this.runner.runWithJsonOutput('org list');
            const orgs = [];
            
            // Process non-scratch orgs
            if (result.result?.nonScratchOrgs) {
                result.result.nonScratchOrgs.forEach(org => {
                    orgs.push({
                        username: org.username,
                        orgId: org.orgId,
                        instanceUrl: org.instanceUrl,
                        alias: org.alias,
                        type: 'production',
                        isDefault: org.isDefaultUsername,
                        isDevHub: org.isDevHub,
                        connectedStatus: org.connectedStatus
                    });
                });
            }

            // Process scratch orgs
            if (result.result?.scratchOrgs) {
                result.result.scratchOrgs.forEach(org => {
                    orgs.push({
                        username: org.username,
                        orgId: org.orgId,
                        instanceUrl: org.instanceUrl,
                        alias: org.alias,
                        type: 'scratch',
                        isDefault: org.isDefaultUsername,
                        isExpired: org.isExpired,
                        expirationDate: org.expirationDate,
                        connectedStatus: org.connectedStatus
                    });
                });
            }

            this.logger.info('Orgs fetched successfully', { 
                total: orgs.length,
                production: orgs.filter(o => o.type === 'production').length,
                scratch: orgs.filter(o => o.type === 'scratch').length
            });

            return orgs;
        } catch (error) {
            this.logger.error('Failed to fetch orgs', { error: error.message });
            throw error;
        }
    }

    async getOrgInfo(username) {
        this.logger.debug('Fetching org info', { username });
        
        const command = this.runner.buildCommand('force:org:display', {
            targetusername: username
        });

        try {
            const result = await this.runner.runWithJsonOutput(command);
            return result.result;
        } catch (error) {
            this.logger.error('Failed to fetch org info', { username, error: error.message });
            throw error;
        }
    }

    async validateOrgConnection(username) {
        this.logger.debug('Validating org connection', { username });
        
        try {
            await this.getOrgInfo(username);
            this.logger.info('Org connection validated', { username });
            return true;
        } catch (error) {
            this.logger.warn('Org connection validation failed', { username, error: error.message });
            return false;
        }
    }

    // Object Discovery Commands
    async getObjectList(username) {
        this.logger.info('Fetching object list', { username });

        const command = this.runner.buildCommand('sobject list', {
            'target-org': username
        });

        this.logger.info('Fetching object list command', { command });

        try {
            const result = await this.runner.runWithJsonOutput(command);
            console.log('Raw SFDX response:', JSON.stringify(result, null, 2));

            return result.result.map(objName => {
                const isCustom = objName.endsWith('__c');
                let namespace = null;

                if (isCustom) {
                    // Remove the __c suffix
                    const baseName = objName.slice(0, -3);
                    const parts = baseName.split('__');
                    if (parts.length > 1) {
                        namespace = parts[0]; // Prefix before the first '__'
                    }
                }

                return {
                    name: objName,
                    label: objName,
                    custom: isCustom,
                    namespace
                };
            });

        } catch (error) {
            this.logger.error('Failed to fetch object list', { username, error: error.message });
            throw error;
        }
    }


    async describeObject(objectName, username) {
        this.logger.debug('Describing object', { objectName, username });
        
        const command = this.runner.buildCommand('sobject describe', {
            sobject: objectName,
            'target-org': username
        });

        try {
            const result = await this.runner.runWithJsonOutput(command);
            return result.result;
        } catch (error) {
            this.logger.error('Failed to describe object', { 
                objectName, 
                username, 
                error: error.message 
            });
            throw error;
        }
    }

    async getCommonObjects(usernames) {
        this.logger.info('Finding common objects across orgs', { orgs: usernames });
        
        try {
            // Fetch objects for all orgs in parallel
            const objectPromises = usernames.map(username => 
                this.getObjectList(username).then(objects => ({ username, objects }))
            );

            const orgObjects = await Promise.all(objectPromises);

            // Find intersection of all object sets
            const [firstOrg, ...restOrgs] = orgObjects;
            const commonObjects = firstOrg.objects.filter(obj => 
                restOrgs.every(orgData => 
                    orgData.objects.some(otherObj => otherObj.name === obj.name)
                )
            );

            this.logger.info('Common objects found', { 
                total: commonObjects.length,
                orgs: usernames.length 
            });

            return commonObjects;
        } catch (error) {
            this.logger.error('Failed to get common objects', { error: error.message });
            throw error;
        }
    }

    // Data Query Commands (for future GraphQL implementation)
    async queryData(soql, username, options = {}) {
        this.logger.debug('Executing SOQL query', { username, queryLength: soql.length });
        
        const command = this.runner.buildCommand('force:data:soql:query', {
            query: `"${soql}"`,
            targetusername: username,
            resultformat: 'json'
        });

        try {
            const result = await this.runner.runWithJsonOutput(command);
            return result.result;
        } catch (error) {
            this.logger.error('SOQL query failed', { username, error: error.message });
            throw error;
        }
    }

    // Batch operations
    async validateMultipleOrgs(usernames) {
        this.logger.info('Validating multiple orgs', { count: usernames.length });
        
        const commands = usernames.map(username => ({
            command: this.runner.buildCommand('force:org:display', {
                targetusername: username
            }),
            options: { timeout: 10000 }
        }));

        try {
            const results = await this.runner.runBatch(commands, {
                parallel: true,
                continueOnError: true
            });

            return usernames.map((username, index) => ({
                username,
                isValid: results[index].success,
                error: results[index].success ? null : results[index].error.message
            }));
        } catch (error) {
            this.logger.error('Batch org validation failed', { error: error.message });
            throw error;
        }
    }


    /**
     * Build GraphQL query from config object
     * @param {string} objectName - Salesforce object name
     * @param {Object} objectConfig - Object configuration from config file
     * @returns {string} - GraphQL query string
     */

    buildGraphQLQuery(objectName, objectConfig) {
    this.logger.info('🏗️ Building GraphQL query', { 
        objectName, 
        configKeys: Object.keys(objectConfig),
        configDetails: objectConfig
    });

    const { 
        foreignKey, 
        Fields = [], 
        ActiveCondition, 
        LastModifiedBetween, 
        CreatedBetween 
    } = objectConfig;

    const systemFields = [ 'CreatedDate', 'LastModifiedDate', 'CreatedBy.Name'];
    const allFields = [...new Set([foreignKey, ...systemFields, ...Fields])];

    const whereConditions = [];

    // ✅ Parse ActiveCondition safely (only = and != for now)
    if (ActiveCondition && ActiveCondition.trim() !== '') {
        const parsed = ActiveCondition
            .replace(/(\w+)\s*=\s*true/gi, '$1: { eq: true }')
            .replace(/(\w+)\s*=\s*false/gi, '$1: { eq: false }')
            .replace(/(\w+)\s*!=\s*null/gi, '$1: { neq: null }')
            .replace(/(\w+)\s*=\s*null/gi, '$1: { eq: null }');

        whereConditions.push(parsed);
        this.logger.debug('✅ Transformed ActiveCondition to GraphQL', { original: ActiveCondition, parsed });
    }

    // Skclient-side only)
    if (LastModifiedBetween || CreatedBetween) {
        this.logger.warn('⛔ Skipping GraphQL date filters — applied in post-fetch only', {
            objectName,
            LastModifiedBetween,
            CreatedBetween
        });
    }

    const whereClause = whereConditions.length > 0
        ? `(first: 200, where: { ${whereConditions.join(', ')} })`
        : '(first: 200)';


    const fieldString = allFields.map(field => {
        if (field.includes('.')) {
            let [parent, child] = field.split('.');
            if (parent.endsWith('__c')) {
                parent = parent.replace(/__c$/, '__r');
            }
            return `${parent}{${child}{value}}`;
        }
        return `${field}{value}`;
    }).join(' ');

    const query = `{uiapi{query{${objectName}${whereClause}{edges{node{${fieldString}}}pageInfo{hasNextPage endCursor}}}}}`;

    this.logger.info('✅ GraphQL query generated', {
        objectName,
        query: query
    });

    return query;
}




    /**
     * Execute GraphQL query for a specific org
     * @param {string} query - GraphQL query string
     * @param {string} username - Target org username
     * @param {string} cursor - Pagination cursor (optional)
     * @returns {Object} - Query results
     */
    
    async executeGraphQLQuery(query, username, cursor = null) {
        this.logger.info('🔄 Starting GraphQL execution', {
            username,
            hasCursor: !!cursor,
            queryLength: query.length,
            cursorValue: cursor ? cursor.substring(0, 20) + '...' : null
        });

        try {
            const result = await executeGraphQLQuery(query, username, cursor);
            return result;
        } catch (error) {
            this.logger.error('🚨 GraphQL CLI execution failed', {
                username,
                error: error.message,
                errorType: error.constructor.name,
                errorStack: error.stack,
                executionContext: {
                    timestamp: new Date().toISOString(),
                    nodeVersion: process.version,
                    workingDirectory: process.cwd()
                }
            });
            throw error;
        }
    }


    /**
     * Fetch all records for an object across multiple orgs with pagination
     * @param {string} objectName - Object name
     * @param {Object} objectConfig - Object configuration
     * @param {Array} usernames - Array of org usernames
     * @returns {Object} - Records grouped by org
     */
     
    async fetchObjectDataAllOrgs(objectName, objectConfig, usernames) {
        this.logger.info('Starting data fetch for all orgs', { 
            objectName, 
            orgCount: usernames.length,
            orgs: usernames,
            configSummary: {
                foreignKey: objectConfig.foreignKey,
                fieldCount: objectConfig.Fields?.length || 0,
                hasActiveCondition: !!objectConfig.ActiveCondition,
                hasDateFilters: !!(objectConfig.LastModifiedBetween || objectConfig.CreatedBetween)
            }
        });

        const query = this.buildGraphQLQuery(objectName, objectConfig);
        const orgData = {};
        const fetchStartTime = Date.now();

        for (const username of usernames) {
            this.logger.info('Starting data fetch for org', { 
                username, 
                objectName,
                position: usernames.indexOf(username) + 1,
                totalOrgs: usernames.length
            });
            
            let allRecords = [];
            let hasNextPage = true;
            let cursor = null;
            let pageCount = 0;
            let totalFetchTime = 0;

            while (hasNextPage) {
                try {
                    const pageStartTime = Date.now();
                    const result = await this.executeGraphQLQuery(query, username, cursor);
                    const pageExecutionTime = Date.now() - pageStartTime;
                    totalFetchTime += pageExecutionTime;
                    
                    // Navigate GraphQL response structure
                    const queryData = result?.data?.uiapi?.query?.[objectName];
                    
                    if (!queryData) {
                        this.logger.warn('No query data found in GraphQL response', { 
                            username, 
                            objectName,
                            hasResult: !!result,
                            hasData: !!result?.data,
                            hasUiapi: !!result?.data?.uiapi,
                            hasQuery: !!result?.data?.uiapi?.query,
                            queryKeys: result?.data?.uiapi?.query ? Object.keys(result.data.uiapi.query) : []
                        });
                        break;
                    }

                    const records = queryData.edges?.map(edge => {
                        const node = edge.node;
                        // ✅ Id handled correctly (direct access)
                        const record = { Id: node.Id };
                        
                        // Extract field values with correct syntax handling
                        Object.keys(node).forEach(fieldKey => {
                            if (fieldKey !== 'Id') {
                                if (typeof node[fieldKey] === 'object' && node[fieldKey]?.value !== undefined) {
                                    record[fieldKey] = node[fieldKey].value;
                                } else if (typeof node[fieldKey] === 'object') {
                                    // Handle relationship fields like CreatedBy.Name
                                    Object.keys(node[fieldKey]).forEach(subField => {
                                        if (node[fieldKey][subField]?.value !== undefined) {
                                            record[`${fieldKey}.${subField}`] = node[fieldKey][subField].value;
                                        }
                                    });
                                }
                            }
                        });

                        return record;
                    }) || [];

                    allRecords = allRecords.concat(records);
                    pageCount++;

                    // Check pagination
                    hasNextPage = queryData.pageInfo?.hasNextPage || false;
                    cursor = queryData.pageInfo?.endCursor;

                    this.logger.info('GraphQL page completed', { 
                        username, 
                        objectName, 
                        pageNumber: pageCount, 
                        recordsThisPage: records.length,
                        totalRecordsSoFar: allRecords.length,
                        hasNextPage,
                        pageExecutionTimeMs: pageExecutionTime,
                        avgTimePerRecord: records.length > 0 ? Math.round(pageExecutionTime / records.length) : 0,
                        cursorLength: cursor ? cursor.length : 0
                    });

                } catch (error) {
                    this.logger.error('GraphQL page fetch failed', { 
                        username, 
                        objectName, 
                        pageNumber: pageCount + 1, 
                        error: error.message,
                        errorType: error.constructor.name,
                        recordsFetchedSoFar: allRecords.length,
                        totalFetchTimeMs: totalFetchTime
                    });
                    hasNextPage = false; // Stop pagination on error
                }
            }

            // ✅ Apply client-side filtering based on config
            const filteredRecords = this.applyConfigFilters(allRecords, objectConfig);

            orgData[username] = filteredRecords;
            
            this.logger.info('Org data fetch completed', { 
                username, 
                objectName, 
                rawRecords: allRecords.length,
                filteredRecords: filteredRecords.length,
                filtersApplied: filteredRecords.length < allRecords.length,
                totalPages: pageCount,
                totalFetchTimeMs: totalFetchTime,
                avgTimePerPage: pageCount > 0 ? Math.round(totalFetchTime / pageCount) : 0,
                recordsPerSecond: totalFetchTime > 0 ? Math.round((allRecords.length * 1000) / totalFetchTime) : 0
            });
        }

        const totalFetchTime = Date.now() - fetchStartTime;
        const totalRecords = Object.values(orgData).reduce((sum, records) => sum + records.length, 0);

        this.logger.info('Multi-org data fetch completed', {
            objectName,
            totalOrgs: usernames.length,
            totalRecords,
            totalFetchTimeMs: totalFetchTime,
            recordsByOrg: Object.entries(orgData).map(([org, records]) => ({
                org,
                recordCount: records.length
            })),
            avgRecordsPerOrg: Math.round(totalRecords / usernames.length),
            recordsPerSecond: totalFetchTime > 0 ? Math.round((totalRecords * 1000) / totalFetchTime) : 0
        });

        return orgData;
    }

    applyConfigFilters(records, objectConfig) {
    const { 
        ActiveCondition, 
        LastModifiedBetween, 
        CreatedBetween,
        foreignKey 
    } = objectConfig;

    let filteredRecords = records;

    // Filter out records without foreign key value
    if (foreignKey && foreignKey !== 'Id') {
        filteredRecords = filteredRecords.filter(record => {
            const value = record[foreignKey];
            return value !== null && value !== undefined && value !== '';
        });
        
        this.logger.debug('Applied foreign key filter', {
            foreignKey,
            originalCount: records.length,
            filteredCount: filteredRecords.length
        });
    }

    // Apply date filters
    if (LastModifiedBetween && LastModifiedBetween.length === 2 && LastModifiedBetween[0] && LastModifiedBetween[1]) {
        const startDate = new Date(LastModifiedBetween[0] + 'T00:00:00Z');
        const endDate = new Date(LastModifiedBetween[1] + 'T23:59:59Z');
        
        filteredRecords = filteredRecords.filter(record => {
            const modifiedDate = new Date(record.LastModifiedDate);
            return modifiedDate >= startDate && modifiedDate <= endDate;
        });
        
        this.logger.debug('Applied LastModifiedBetween filter', {
            dateRange: LastModifiedBetween,
            filteredCount: filteredRecords.length
        });
    }

    if (CreatedBetween && CreatedBetween.length === 2 && CreatedBetween[0] && CreatedBetween[1]) {
        const startDate = new Date(CreatedBetween[0] + 'T00:00:00Z');
        const endDate = new Date(CreatedBetween[1] + 'T23:59:59Z');
        
        filteredRecords = filteredRecords.filter(record => {
            const createdDate = new Date(record.CreatedDate);
            return createdDate >= startDate && createdDate <= endDate;
        });
        
        this.logger.debug('Applied CreatedBetween filter', {
            dateRange: CreatedBetween,
            filteredCount: filteredRecords.length
        });
    }

    // Apply custom active condition using JavaScript evaluation (be careful with security)
    if (ActiveCondition) {
        try {
            filteredRecords = filteredRecords.filter(record => {
                // Simple condition evaluation - expand this based on your needs
                // For safety, only allow specific field checks
                const condition = ActiveCondition
                    .replace(/\bActive\b/g, 'record.Active')
                    .replace(/\bIsDeleted\b/g, 'record.IsDeleted')
                    .replace(/\bType\b/g, 'record.Type');
                
                // Use Function constructor for safer evaluation
                const conditionFunction = new Function('record', `return ${condition};`);
                return conditionFunction(record);
            });
            
            this.logger.debug('Applied ActiveCondition filter', {
                condition: ActiveCondition,
                filteredCount: filteredRecords.length
            });
        } catch (error) {
            this.logger.warn('Failed to apply ActiveCondition filter', {
                condition: ActiveCondition,
                error: error.message
            });
        }
    }

    return filteredRecords;
}
async testGraphQLConnectivity(username) {
    this.logger.info('🧪 TESTING GRAPHQL CONNECTIVITY', { username });
    
    // Test 1: Basic org connectivity
    try {
        this.logger.info('🧪 Test 1: Basic org display');
        const orgInfo = await this.getOrgInfo(username);
        this.logger.info('✅ Org connectivity confirmed', { 
            username, 
            orgId: orgInfo.id,
            instanceUrl: orgInfo.instanceUrl 
        });
    } catch (error) {
        this.logger.error('❌ Basic org connectivity failed', { username, error: error.message });
        throw error;
    }

    // Test 2: Simple GraphQL query
    try {
        this.logger.info('🧪 Test 2: Simple GraphQL query');
        const simpleQuery = `{
            uiapi {
                query {
                    Account(first: 1) {
                        edges {
                            node {
                                Id
                                Name { value }
                            }
                        }
                    }
                }
            }
        }`;
        
        const result = await this.executeGraphQLQuery(simpleQuery, username);
        this.logger.info('✅ GraphQL connectivity confirmed', { 
            username, 
            hasData: !!result?.data?.uiapi?.query?.Account 
        });
        
        return true;
    } catch (error) {
        this.logger.error('❌ GraphQL connectivity failed', { username, error: error.message });
        throw error;
    }
}
}



// Export singleton instance
const dataComparisonSFDX = new DataComparisonSFDX();

module.exports = {
    DataComparisonSFDX,
    dataComparisonSFDX
};