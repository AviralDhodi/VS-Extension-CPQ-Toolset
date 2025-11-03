// CPQ Toolset v3 - GraphQL Runner
const { SFDXRunner } = require('./sfdxRunner')
const { logger } = require('./logger')

class GraphQLRunner {
  constructor() {
    this.sfdxRunner = new SFDXRunner()
  }

  /**
   * Build SOQL query with filters
   */
  buildSOQLQuery(objectName, objectConfig, orgSpecificFilters = {}) {
    const { fields, foreignKey } = objectConfig
    
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      throw new Error(`No fields specified for object ${objectName}`)
    }
    
    // Build SELECT clause - fix relationship fields
    let selectClause = fields.map(field => {
      // Convert __c. to __r. for relationship fields
      if (field.includes('__c.') && !field.includes('__r.')) {
        return field.replace(/__c\./g, '__r.')
      }
      return field
    }).join(', ')
    
    // Add foreign key if not already included
    if (foreignKey && !fields.includes(foreignKey)) {
      selectClause = `${foreignKey}, ${selectClause}`
    }
    
    // Build base query
    let query = `SELECT ${selectClause} FROM ${objectName}`
    
    // Add WHERE conditions
    const whereClauses = []
    
    // Active condition
    if (orgSpecificFilters.activeCondition) {
      whereClauses.push(`(${orgSpecificFilters.activeCondition})`)
    }
    
    // Date filters
    if (orgSpecificFilters.dateFilterType && orgSpecificFilters.dateFrom) {
      const dateField = orgSpecificFilters.dateFilterType
      const dateFrom = orgSpecificFilters.dateFrom
      const dateTo = orgSpecificFilters.dateTo || new Date().toISOString().split('T')[0]
      
      whereClauses.push(`${dateField} >= ${dateFrom}`)
      whereClauses.push(`${dateField} <= ${dateTo}`)
    }
    
    // Custom filters (support both singular and plural)
    const customFilters = orgSpecificFilters.customFilter 
      ? [orgSpecificFilters.customFilter] 
      : (orgSpecificFilters.customFilters || [])
    
    if (Array.isArray(customFilters)) {
      customFilters.forEach(filter => {
        if (filter && filter.trim()) {
          whereClauses.push(`(${filter})`)
        }
      })
    } else if (customFilters && typeof customFilters === 'string' && customFilters.trim()) {
      whereClauses.push(`(${customFilters})`)
    }
    
    // Add WHERE clause if we have conditions
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`
    }
    
    // Add ORDER BY for consistent results
    if (foreignKey) {
      query += ` ORDER BY ${foreignKey}`
    }
    
    // Add LIMIT for safety (can be overridden)
    const limit = orgSpecificFilters.limit || 50000
    query += ` LIMIT ${limit}`
    
    logger.debug(`Built SOQL query for ${objectName}`, { query })
    return query
  }

  /**
   * Fetch data for a specific object from a specific org
   */
  async fetchObjectDataForOrg(objectName, objectConfig, orgUsername, options = {}) {
    try {
      const orgFilters = objectConfig.orgFilters?.[orgUsername] || {}
      
      logger.info(`Fetching ${objectName} data from ${orgUsername}`, {
        filters: orgFilters
      })
      
      // Build SOQL query
      const query = this.buildSOQLQuery(objectName, objectConfig, orgFilters)
      
      // Execute query
      const records = await this.sfdxRunner.executeSOQL(query, orgUsername, {
        timeout: options.timeout || 120000
      })
      
      logger.info(`Fetched ${records.length} records for ${objectName} from ${orgUsername}`)
      
      return {
        orgUsername,
        objectName,
        recordCount: records.length,
        records,
        query,
        timestamp: new Date().toISOString()
      }
      
    } catch (error) {
      logger.error(`Failed to fetch ${objectName} from ${orgUsername}`, {
        error: error.message
      })
      
      return {
        orgUsername,
        objectName,
        recordCount: 0,
        records: [],
        error: error.message,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * Fetch data for multiple objects from multiple orgs
   */
  async fetchMultiOrgData(config, options = {}) {
    const { orgs, objects } = config
    
    if (!orgs || !Array.isArray(orgs) || orgs.length === 0) {
      throw new Error('No organizations specified in configuration')
    }
    
    if (!objects || Object.keys(objects).length === 0) {
      throw new Error('No objects specified in configuration')
    }
    
    logger.info(`Starting multi-org data fetch`, {
      orgCount: orgs.length,
      objectCount: Object.keys(objects).length
    })
    
    const results = {
      config,
      startTime: new Date().toISOString(),
      results: {},
      summary: {
        totalOrgs: orgs.length,
        totalObjects: Object.keys(objects).length,
        totalFetches: orgs.length * Object.keys(objects).length,
        completedFetches: 0,
        failedFetches: 0
      }
    }
    
    // Process each org-object combination
    for (const org of orgs) {
      results.results[org] = {}
      
      for (const [objectName, objectConfig] of Object.entries(objects)) {
        try {
          const fetchResult = await this.fetchObjectDataForOrg(
            objectName, 
            objectConfig, 
            org, 
            options
          )
          
          results.results[org][objectName] = fetchResult
          
          if (fetchResult.error) {
            results.summary.failedFetches++
          } else {
            results.summary.completedFetches++
          }
          
        } catch (error) {
          logger.error(`Fetch failed for ${objectName}/${org}`, {
            error: error.message
          })
          
          results.results[org][objectName] = {
            orgUsername: org,
            objectName,
            recordCount: 0,
            records: [],
            error: error.message,
            timestamp: new Date().toISOString()
          }
          
          results.summary.failedFetches++
        }
        
        // Progress callback
        if (options.progressCallback) {
          const progress = {
            completed: results.summary.completedFetches + results.summary.failedFetches,
            total: results.summary.totalFetches,
            currentOrg: org,
            currentObject: objectName
          }
          options.progressCallback(progress)
        }
      }
    }
    
    results.endTime = new Date().toISOString()
    results.duration = new Date(results.endTime) - new Date(results.startTime)
    
    logger.info(`Multi-org data fetch completed`, {
      duration: results.duration,
      completed: results.summary.completedFetches,
      failed: results.summary.failedFetches
    })
    
    return results
  }

  /**
   * Estimate query size before execution
   */
  async estimateQuerySize(objectName, objectConfig, orgUsername) {
    try {
      const countQuery = `SELECT COUNT() FROM ${objectName}`
      const records = await this.sfdxRunner.executeSOQL(countQuery, orgUsername)
      
      // SOQL COUNT() returns a special result format
      const totalRecords = records[0]?.expr0 || 0
      
      logger.info(`Estimated ${totalRecords} records for ${objectName} in ${orgUsername}`)
      return totalRecords
      
    } catch (error) {
      logger.warn(`Failed to estimate query size for ${objectName}/${orgUsername}`, {
        error: error.message
      })
      return null
    }
  }

  /**
   * Validate object configuration
   */
  validateObjectConfig(objectName, objectConfig) {
    const errors = []
    
    if (!objectConfig.fields || !Array.isArray(objectConfig.fields)) {
      errors.push(`Object ${objectName}: fields must be an array`)
    }
    
    if (objectConfig.fields && objectConfig.fields.length === 0) {
      errors.push(`Object ${objectName}: at least one field must be specified`)
    }
    
    if (!objectConfig.foreignKey) {
      errors.push(`Object ${objectName}: foreignKey must be specified`)
    }
    
    // Validate org-specific filters
    if (objectConfig.orgFilters) {
      for (const [org, filters] of Object.entries(objectConfig.orgFilters)) {
        if (filters.dateFilterType && !filters.dateFrom) {
          errors.push(`Object ${objectName}, Org ${org}: dateFrom required when dateFilterType is specified`)
        }
        
        if (filters.customFilters && !Array.isArray(filters.customFilters)) {
          errors.push(`Object ${objectName}, Org ${org}: customFilters must be an array`)
        }
      }
    }
    
    return errors
  }

  /**
   * Validate entire configuration
   */
  validateConfiguration(config) {
    const errors = []
    
    if (!config.orgs || !Array.isArray(config.orgs) || config.orgs.length === 0) {
      errors.push('Configuration must include at least one organization')
    }
    
    if (!config.objects || Object.keys(config.objects).length === 0) {
      errors.push('Configuration must include at least one object')
    }
    
    // Validate each object configuration
    if (config.objects) {
      for (const [objectName, objectConfig] of Object.entries(config.objects)) {
        const objectErrors = this.validateObjectConfig(objectName, objectConfig)
        errors.push(...objectErrors)
      }
    }
    
    return errors
  }

  /**
   * Test connection to all configured orgs
   */
  async testOrgConnections(orgs) {
    const results = []
    
    for (const org of orgs) {
      try {
        const validation = await this.sfdxRunner.validateOrg(org)
        results.push({
          org,
          connected: validation.valid,
          error: validation.error || null
        })
      } catch (error) {
        results.push({
          org,
          connected: false,
          error: error.message
        })
      }
    }
    
    return results
  }
}

// Singleton instance
let instance = null

function getInstance() {
  if (!instance) {
    instance = new GraphQLRunner()
  }
  return instance
}

module.exports = { 
  GraphQLRunner,
  getInstance
}