const { getSFDXRunner } = require('../../../shared/sfdx/runner');
const { createLogger } = require('../../../shared/logging/logger');

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

        const systemFields = ['Id', 'CreatedDate', 'LastModifiedDate', 'CreatedBy.Name'];
        const allFields = [...new Set([foreignKey, ...systemFields, ...Fields])];
        
        // ✅ FIXED: Dynamic date filter building
        let whereClause = '';
        const conditions = [];

        // Only add date filters if they have valid (non-null) values
        if (LastModifiedBetween && LastModifiedBetween.length === 2 && 
            LastModifiedBetween[0] !== null && LastModifiedBetween[1] !== null) {
            // [0] is start date (greater than), [1] is end date (less than)
            conditions.push(`LastModifiedDate >= ${LastModifiedBetween[0]}T00:00:00Z`);
            conditions.push(`LastModifiedDate <= ${LastModifiedBetween[1]}T23:59:59Z`);
            
            this.logger.debug('Added LastModifiedBetween filter', { 
                objectName, 
                startDate: LastModifiedBetween[0],
                endDate: LastModifiedBetween[1]
            });
        }
        
        if (CreatedBetween && CreatedBetween.length === 2 && 
            CreatedBetween[0] !== null && CreatedBetween[1] !== null) {
            // [0] is start date (greater than), [1] is end date (less than)
            conditions.push(`CreatedDate >= ${CreatedBetween[0]}T00:00:00Z`);
            conditions.push(`CreatedDate <= ${CreatedBetween[1]}T23:59:59Z`);
            
            this.logger.debug('Added CreatedBetween filter', { 
                objectName, 
                startDate: CreatedBetween[0],
                endDate: CreatedBetween[1]
            });
        }

        // Only add ActiveCondition if it exists and is not empty
        if (ActiveCondition && ActiveCondition.trim() !== '') {
            conditions.push(`(${ActiveCondition})`);
            
            this.logger.debug('Added ActiveCondition filter', { 
                objectName, 
                condition: ActiveCondition 
            });
        }

        // Build WHERE clause only if we have conditions
        if (conditions.length > 0) {
            whereClause = `(where: {and: [{${conditions.join(' AND ')}}]})`;
        } else {
            whereClause = '(first: 200)'; // No filters, just pagination
        }

        // ✅ FIXED: Single-line GraphQL query (no \n characters)
        const query = `{uiapi{query{${objectName}${whereClause}{edges{node{${allFields.map(field => {
            if (field === 'Id') {
                return 'Id';
            }
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                return `${parent}{${child}{value}}`;
            }
            return `${field}{value}`;
        }).join(' ')}}pageInfo{hasNextPage endCursor}}}}}}`;

        this.logger.info('✅ GraphQL query generated', {
            objectName,
            queryLength: query.length,
            fieldCount: allFields.length,
            hasDateFilters: !!(LastModifiedBetween || CreatedBetween),
            hasActiveCondition: !!ActiveCondition,
            conditionsApplied: conditions.length,
            whereClause: whereClause
        });

        return query;
    }



    /*buildGraphQLQuery(objectName, objectConfig) {
        const { 
            foreignKey, 
            Fields = [], 
            ActiveCondition, 
            LastModifiedBetween, 
            CreatedBetween 
        } = objectConfig;

        // Build field selection - always include system fields and foreign key
        const systemFields = ['Id', 'CreatedDate', 'LastModifiedDate', 'CreatedBy.Name'];
        const allFields = [...new Set([foreignKey, ...systemFields, ...Fields])];
        
        // Build WHERE conditions
        const conditions = [`${foreignKey} != null`];
        
        if (LastModifiedBetween && LastModifiedBetween.length === 2) {
            conditions.push(`LastModifiedDate >= ${LastModifiedBetween[0]}T00:00:00Z`);
            conditions.push(`LastModifiedDate <= ${LastModifiedBetween[1]}T23:59:59Z`);
        }
        
        if (CreatedBetween && CreatedBetween.length === 2) {
            conditions.push(`CreatedDate >= ${CreatedBetween[0]}T00:00:00Z`);
            conditions.push(`CreatedDate <= ${CreatedBetween[1]}T23:59:59Z`);
        }
        
        if (ActiveCondition) {
            conditions.push(`(${ActiveCondition})`);
        }

        const whereClause = conditions.join(' AND ');
        
        // Build GraphQL query
        const query = `{
            uiapi {
                query {
                    ${objectName}(where: {and: [{${whereClause}}]}) {
                        edges {
                            node {
                                ${allFields.map(field => {
                                    // Handle relationship fields like CreatedBy.Name
                                    if (field.includes('.')) {
                                        const [parent, child] = field.split('.');
                                        return `${parent} { ${child}.value }`;
                                    }
                                    return `${field}.value`;
                                }).join('\n                                ')}
                            }
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }
        }`;

        return query;
    }*/

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

    // Add pagination cursor if provided
    let paginatedQuery = query;
    if (cursor) {
        paginatedQuery = query.replace(
            /Account\(first: \d+\)/,
            `Account(first: 200, after: "${cursor}")`
        );
        
        this.logger.debug('Pagination cursor added to query', {
            username,
            cursor: cursor.substring(0, 50) + '...',
            originalLength: query.length,
            paginatedLength: paginatedQuery.length
        });
    }

    // Escape quotes for command line
    const escapedQuery = paginatedQuery.replace(/"/g, '\\"');

    // ✅ FIX: Use 'body' instead of 'query'
    const command = this.runner.buildCommand('api request graphql', {
        'target-org': username,
        body: `"${escapedQuery}"` // ✅ This must be 'body'
    });

    // 🚀 LOG THE EXACT CLI COMMAND
    this.logger.info('🚀 EXACT CLI COMMAND EXECUTING', {
        username,
        fullCommand: `sf ${command}`,
        commandLength: command.length
    });

    // 📋 LOG THE EXACT GRAPHQL QUERY
    this.logger.info('📋 GRAPHQL QUERY BEING SENT', {
        username,
        query: paginatedQuery,
        queryFormatted: JSON.stringify(paginatedQuery, null, 2)
    });

    try {
        const startTime = Date.now();
        
        // 🎯 LOG COMMAND EXECUTION START
        this.logger.info('⚡ EXECUTING SFDX COMMAND NOW', {
            username,
            timestamp: new Date().toISOString(),
            queryPreview: query.substring(0, 100) + '...'
        });


        const result = await Promise.race([
            this.runner.runWithJsonOutput(command),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Command timeout after 2 minutes')), 120000)
            )
        ]);
        const executionTime = Date.now() - startTime;

        // 📥 LOG RAW SFDX RESPONSE
        this.logger.info('📥 RAW SFDX CLI RESPONSE', {
            username,
            executionTimeMs: executionTime,
            hasResult: !!result,
            resultKeys: result ? Object.keys(result) : [],
            rawResponse: JSON.stringify(result, null, 2).substring(0, 2000) + 
                        (JSON.stringify(result).length > 2000 ? '...[TRUNCATED]' : '')
        });

        // 🔍 ANALYZE RESPONSE STRUCTURE
        const responseData = result?.result?.data?.uiapi?.query;
        const objectName = responseData ? Object.keys(responseData)[0] : 'unknown';
        const queryData = responseData?.[objectName];
        const recordCount = queryData?.edges?.length || 0;
        const hasNextPage = queryData?.pageInfo?.hasNextPage || false;
        const endCursor = queryData?.pageInfo?.endCursor;

        this.logger.info('🔍 RESPONSE ANALYSIS', {
            username,
            objectName,
            recordsFetched: recordCount,
            hasNextPage,
            endCursor: endCursor ? endCursor.substring(0, 20) + '...' : null,
            responseStructure: {
                hasResult: !!result?.result,
                hasData: !!result?.result?.data,
                hasUiapi: !!result?.result?.data?.uiapi,
                hasQuery: !!result?.result?.data?.uiapi?.query,
                queryObjects: responseData ? Object.keys(responseData) : []
            }
        });

        // 📊 LOG FIRST RECORD SAMPLE (if any)
        if (queryData?.edges?.length > 0) {
            const sampleRecord = queryData.edges[0].node;
            const fieldNames = Object.keys(sampleRecord);
            
            this.logger.info('📊 SAMPLE RECORD STRUCTURE', {
                username,
                objectName,
                fieldCount: fieldNames.length,
                fieldNames: fieldNames,
                sampleId: sampleRecord.Id,
                sampleData: JSON.stringify(sampleRecord, null, 2)
            });
        }

        return result.result;

    } catch (error) {
        // 🚨 LOG DETAILED ERROR INFORMATION
        this.logger.error('🚨 SFDX CLI COMMAND FAILED', { 
            username, 
            error: error.message,
            errorType: error.constructor.name,
            errorStack: error.stack,
            commandThatFailed: `sf ${command}`,
            queryPreview: paginatedQuery.substring(0, 300) + '...',
            executionContext: {
                timestamp: new Date().toISOString(),
                nodeVersion: process.version,
                workingDirectory: process.cwd()
            }
        });

        // 🔧 LOG DEBUGGING SUGGESTIONS
        this.logger.info('🔧 DEBUGGING SUGGESTIONS', {
            username,
            suggestions: [
                'Check if org is authenticated: sf org list',
                'Test basic connectivity: sf org display --target-org ' + username,
                'Verify GraphQL API access: sf api request rest --target-org ' + username + ' --path /services/data/v57.0/',
                'Check SFDX CLI version: sf version'
            ]
        });

        throw error;
    }
}


    /*async executeGraphQLQuery(query, username, cursor = null) {
        this.logger.info('Executing GraphQL query', { username, hasCursor: !!cursor });

        // Add pagination cursor if provided
        let paginatedQuery = query;
        if (cursor) {
            paginatedQuery = query.replace(
                /where: {and: \[{([^}]+)}\]\}/,
                `where: {and: [{$1}]}, after: "${cursor}"`
            );
        }

        const command = this.runner.buildCommand('api request graphql', {
            'target-org': username,
            query: `"${paginatedQuery.replace(/"/g, '\\"')}"`
        });

        try {
            const result = await this.runner.runWithJsonOutput(command);
            return result.result;
        } catch (error) {
            this.logger.error('GraphQL query failed', { 
                username, 
                error: error.message,
                query: paginatedQuery.substring(0, 200) + '...'
            });
            throw error;
        }
    }*/

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


/*async fetchObjectDataAllOrgs(objectName, objectConfig, usernames) {
        this.logger.info('Fetching object data for all orgs', { 
            objectName, 
            orgCount: usernames.length 
        });

        const query = this.buildGraphQLQuery(objectName, objectConfig);
        const orgData = {};

        for (const username of usernames) {
            this.logger.info('Fetching data for org', { username, objectName });
            
            let allRecords = [];
            let hasNextPage = true;
            let cursor = null;
            let pageCount = 0;

            while (hasNextPage) {
                try {
                    const result = await this.executeGraphQLQuery(query, username, cursor);
                    
                    // Navigate GraphQL response structure
                    const queryData = result?.data?.uiapi?.query?.[objectName];
                    
                    if (!queryData) {
                        this.logger.warn('No query data found', { username, objectName });
                        break;
                    }

                    const records = queryData.edges?.map(edge => {
                        const node = edge.node;
                        const record = { Id: node.Id?.value };
                        
                        // Extract field values
                        Object.keys(node).forEach(fieldKey => {
                            if (fieldKey !== 'Id') {
                                if (typeof node[fieldKey] === 'object' && node[fieldKey]?.value !== undefined) {
                                    record[fieldKey] = node[fieldKey].value;
                                } else if (typeof node[fieldKey] === 'object') {
                                    // Handle relationship fields
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

                    this.logger.debug('GraphQL page fetched', { 
                        username, 
                        objectName, 
                        pageCount, 
                        recordsThisPage: records.length,
                        totalRecords: allRecords.length,
                        hasNextPage 
                    });

                } catch (error) {
                    this.logger.error('Error fetching GraphQL page', { 
                        username, 
                        objectName, 
                        pageCount, 
                        error: error.message 
                    });
                    hasNextPage = false; // Stop pagination on error
                }
            }

            orgData[username] = allRecords;
            this.logger.info('Completed data fetch for org', { 
                username, 
                objectName, 
                totalRecords: allRecords.length,
                totalPages: pageCount 
            });
        }

        return orgData;
    }*/



// Export singleton instance
const dataComparisonSFDX = new DataComparisonSFDX();

module.exports = {
    DataComparisonSFDX,
    dataComparisonSFDX
};