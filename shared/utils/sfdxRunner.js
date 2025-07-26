// CPQ Toolset v3 - SFDX Runner
const { spawn, exec } = require('child_process')
const { logger } = require('./logger')

class SFDXRunner {
  constructor() {
    this.cliType = null
    this.cliPath = null
    this.initialized = false
  }

  /**
   * Detect and initialize Salesforce CLI
   */
  async detectCLI() {
    if (this.initialized) {
      return { type: this.cliType, path: this.cliPath }
    }

    const candidates = [
      { cmd: 'sf', type: 'sf' },
      { cmd: 'sfdx', type: 'sfdx' }
    ]

    for (const candidate of candidates) {
      try {
        await this._testCommand(`${candidate.cmd} --version`)
        this.cliType = candidate.type
        this.cliPath = candidate.cmd
        this.initialized = true
        
        logger.info(`Detected Salesforce CLI: ${this.cliType}`)
        return { type: this.cliType, path: this.cliPath }
      } catch (error) {
        logger.debug(`CLI ${candidate.cmd} not available: ${error.message}`)
      }
    }

    throw new Error('Salesforce CLI not found. Please install sf CLI or legacy sfdx')
  }

  /**
   * Test if a command is available
   */
  _testCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error)
        } else {
          resolve(stdout)
        }
      })
    })
  }

  /**
   * Execute SFDX/SF command
   */
  async executeCommand(command, options = {}) {
    await this.detectCLI()
    
    const fullCommand = `${this.cliPath} ${command}`
    const timeout = options.timeout || 30000
    
    logger.debug(`Executing: ${fullCommand}`)
    
    return new Promise((resolve, reject) => {
      exec(fullCommand, { 
        timeout,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      }, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Command failed: ${fullCommand}`, { 
            error: error.message,
            stderr: stderr 
          })
          reject(new Error(`SFDX command failed: ${error.message}`))
        } else {
          logger.debug(`Command completed: ${fullCommand}`)
          resolve(stdout.trim())
        }
      })
    })
  }

  /**
   * Get list of authenticated organizations
   */
  async getAuthenticatedOrgs() {
    try {
      const command = this.cliType === 'sf' 
        ? 'org list --json'
        : 'force:org:list --json'
      
      const output = await this.executeCommand(command)
      const result = JSON.parse(output)
      
      let orgs = []
      
      if (this.cliType === 'sf') {
        orgs = result.result?.nonScratchOrgs || []
        orgs = orgs.concat(result.result?.scratchOrgs || [])
      } else {
        orgs = result.result?.nonScratchOrgs || []
        orgs = orgs.concat(result.result?.scratchOrgs || [])
      }
      
      // Filter out orgs without username and add additional info
      const validOrgs = orgs
        .filter(org => org.username)
        .map(org => ({
          username: org.username,
          alias: org.alias || org.username,
          orgId: org.orgId,
          instanceUrl: org.instanceUrl,
          isDefaultUsername: org.isDefaultUsername,
          isDefaultDevHubUsername: org.isDefaultDevHubUsername,
          isScratch: org.isScratch || false,
          status: org.status || 'Active'
        }))
      
      logger.info(`Found ${validOrgs.length} authenticated organizations`)
      return validOrgs
      
    } catch (error) {
      logger.error('Failed to get authenticated orgs', { error: error.message })
      throw new Error(`Failed to retrieve organizations: ${error.message}`)
    }
  }

  /**
   * Get objects for a specific org
   */
  async getObjects(targetOrg, options = {}) {
    try {
      const command = this.cliType === 'sf'
        ? `sobject list --target-org ${targetOrg} --json`
        : `force:schema:sobject:list --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command, options)
      const result = JSON.parse(output)
      
      let objects = this.cliType === 'sf' 
        ? result.result || []
        : result.result || []
      
      // Handle different response formats
      if (Array.isArray(objects) && objects.length > 0 && typeof objects[0] === 'string') {
        // SF CLI returns array of strings
        objects = objects
          .filter(name => name && !name.startsWith('__'))
          .map(name => ({
            name: name,
            label: name,
            custom: name.endsWith('__c'),
            queryable: true
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      } else {
        // Legacy format with object details
        objects = objects
          .filter(obj => obj.name && !obj.name.startsWith('__'))
          .map(obj => ({
            name: obj.name,
            label: obj.label || obj.name,
            keyPrefix: obj.keyPrefix,
            custom: obj.custom || false,
            queryable: obj.queryable !== false,
            createable: obj.createable || false,
            updateable: obj.updateable || false,
            deletable: obj.deletable || false
          }))
          .sort((a, b) => a.label.localeCompare(b.label))
      }
      
      logger.info(`Found ${objects.length} objects for org ${targetOrg}`)
      return objects
      
    } catch (error) {
      logger.error(`Failed to get objects for ${targetOrg}`, { error: error.message })
      throw new Error(`Failed to retrieve objects for ${targetOrg}: ${error.message}`)
    }
  }

  /**
   * Get fields for a specific object
   */
  async getObjectFields(objectName, targetOrg, options = {}) {
    try {
      const command = this.cliType === 'sf'
        ? `sobject describe --sobject ${objectName} --target-org ${targetOrg} --json`
        : `force:schema:sobject:describe --sobjecttype ${objectName} --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command, options)
      const result = JSON.parse(output)
      
      const objectInfo = this.cliType === 'sf' 
        ? result.result 
        : result.result
      
      if (!objectInfo || !objectInfo.fields) {
        throw new Error(`No field information found for ${objectName}`)
      }
      
      // Process and enhance field info
      const fields = objectInfo.fields
        .map(field => ({
          name: field.name,
          label: field.label || field.name,
          type: field.type,
          length: field.length,
          precision: field.precision,
          scale: field.scale,
          custom: field.custom || false,
          nillable: field.nillable !== false,
          createable: field.createable || false,
          updateable: field.updateable || false,
          unique: field.unique || false,
          externalId: field.externalId || false,
          idLookup: field.idLookup || false,
          relationshipName: field.relationshipName,
          referenceTo: field.referenceTo
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
      
      logger.info(`Found ${fields.length} fields for ${objectName} in ${targetOrg}`)
      return fields
      
    } catch (error) {
      logger.error(`Failed to get fields for ${objectName} in ${targetOrg}`, { 
        error: error.message 
      })
      throw new Error(`Failed to retrieve fields for ${objectName}: ${error.message}`)
    }
  }

  /**
   * Execute SOQL query
   */
  async executeSOQL(query, targetOrg, options = {}) {
    try {
      // Escape query for command line
      const escapedQuery = query.replace(/"/g, '\\"')
      
      const command = this.cliType === 'sf'
        ? `data query --query "${escapedQuery}" --target-org ${targetOrg} --json`
        : `force:data:soql:query --query "${escapedQuery}" --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command, {
        timeout: options.timeout || 60000
      })
      
      const result = JSON.parse(output)
      
      const records = this.cliType === 'sf' 
        ? result.result?.records || []
        : result.result?.records || []
      
      logger.info(`SOQL query returned ${records.length} records for ${targetOrg}`)
      return records
      
    } catch (error) {
      logger.error(`SOQL query failed for ${targetOrg}`, { 
        query: query.substring(0, 100) + '...',
        error: error.message 
      })
      throw new Error(`SOQL query failed: ${error.message}`)
    }
  }

  /**
   * Get org limits
   */
  async getOrgLimits(targetOrg) {
    try {
      const command = this.cliType === 'sf'
        ? `org list limits --target-org ${targetOrg} --json`
        : `force:limits:api:display --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command)
      const result = JSON.parse(output)
      
      const limits = this.cliType === 'sf' 
        ? result.result 
        : result.result
      
      logger.info(`Retrieved org limits for ${targetOrg}`)
      return limits
      
    } catch (error) {
      logger.error(`Failed to get org limits for ${targetOrg}`, { error: error.message })
      throw new Error(`Failed to retrieve org limits: ${error.message}`)
    }
  }

  /**
   * Validate org connection
   */
  async validateOrg(targetOrg) {
    try {
      const command = this.cliType === 'sf'
        ? `org display --target-org ${targetOrg} --json`
        : `force:org:display --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command)
      const result = JSON.parse(output)
      
      const orgInfo = this.cliType === 'sf' 
        ? result.result 
        : result.result
      
      logger.info(`Validated org connection for ${targetOrg}`)
      return {
        valid: true,
        orgInfo: orgInfo
      }
      
    } catch (error) {
      logger.error(`Org validation failed for ${targetOrg}`, { error: error.message })
      return {
        valid: false,
        error: error.message
      }
    }
  }

  /**
   * Get organization information
   */
  async getOrgInfo(targetOrg) {
    try {
      const command = this.cliType === 'sf'
        ? `org display --target-org ${targetOrg} --json`
        : `force:org:display --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command)
      const result = JSON.parse(output)
      
      if (result.status !== 0 && !result.result) {
        throw new Error(result.message || 'Failed to get org info')
      }
      
      const orgData = result.result
      
      return {
        username: orgData.username,
        id: orgData.id,
        instanceUrl: orgData.instanceUrl,
        apiVersion: orgData.apiVersion,
        accessToken: orgData.accessToken,
        connectedStatus: orgData.connectedStatus || 'Connected'
      }
    } catch (error) {
      logger.error(`Failed to get org info for ${targetOrg}`, { error: error.message })
      throw new Error(`Failed to get org info: ${error.message}`)
    }
  }

  /**
   * List metadata of a specific type
   */
  async listMetadata(targetOrg, metadataType) {
    try {
      const command = this.cliType === 'sf'
        ? `org list metadata --metadata-type ${metadataType} --target-org ${targetOrg} --json`
        : `force:mdapi:listmetadata --metadatatype ${metadataType} --targetusername ${targetOrg} --json`
      
      const output = await this.executeCommand(command)
      const result = JSON.parse(output)
      
      if (result.status !== 0 && !result.result) {
        throw new Error(result.message || `Failed to list ${metadataType}`)
      }
      
      const metadata = Array.isArray(result.result) ? result.result : []
      
      logger.info(`Found ${metadata.length} ${metadataType} items in ${targetOrg}`)
      
      return {
        success: true,
        metadata: metadata.map(item => ({
          fullName: item.fullName || item.name,
          fileName: item.fileName,
          id: item.id,
          type: item.type || metadataType,
          lastModifiedDate: item.lastModifiedDate,
          lastModifiedByName: item.lastModifiedByName
        }))
      }
    } catch (error) {
      logger.error(`Failed to list ${metadataType} for ${targetOrg}`, { error: error.message })
      return {
        success: false,
        error: error.message,
        metadata: []
      }
    }
  }
}

// Singleton instance
let instance = null

function getInstance() {
  if (!instance) {
    instance = new SFDXRunner()
  }
  return instance
}

module.exports = { 
  SFDXRunner,
  getInstance
}