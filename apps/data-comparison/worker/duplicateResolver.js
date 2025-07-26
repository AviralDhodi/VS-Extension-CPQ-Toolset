// CPQ Toolset v3 - Duplicate Foreign Key Resolution
const fs = require('fs')
const pkgReader = require('../../../shared/utils/pkgFileReader')
const path = require('path')
const { AppendWriter } = require('./appendWriter')

class DuplicateResolver {
  constructor(options = {}) {
    this.appendWriter = new AppendWriter()
    this.batchSize = options.batchSize || 1000
  }

  /**
   * Analyze all JSONL files for duplicate foreign keys
   */
  async analyzeDuplicateForeignKeys(baseDir, configPath) {
    console.log('Starting duplicate foreign key analysis...')

    // Load configuration
    const config = this.loadConfiguration(configPath)
    const { orgs, objects } = config

    const duplicateReport = {
      timestamp: new Date().toISOString(),
      totalOrgs: orgs.length,
      totalObjects: Object.keys(objects).length,
      duplicatesFound: {},
      summary: {
        totalDuplicates: 0,
        affectedObjects: 0,
        affectedOrgs: 0
      }
    }

    // Analyze each object across all orgs
    for (const [objectName, objectConfig] of Object.entries(objects)) {
      const foreignKey = objectConfig.foreignKey
      if (!foreignKey) continue

      console.log(`Analyzing duplicates for ${objectName} (FK: ${foreignKey})`)

      const objectDuplicates = await this.findDuplicatesForObject(
        baseDir, orgs, objectName, foreignKey
      )

      if (Object.keys(objectDuplicates).length > 0) {
        duplicateReport.duplicatesFound[objectName] = objectDuplicates
        duplicateReport.summary.affectedObjects++
      }
    }

    // Calculate summary statistics
    this.calculateSummaryStats(duplicateReport)

    // Save duplicate report
    const reportPath = path.join(baseDir, 'duplicate_fk_report.json')
    pkgReader.writeFileSync(reportPath, JSON.stringify(duplicateReport, null, 2))
    console.log(`Duplicate analysis complete. Report saved to: ${reportPath}`)

    return duplicateReport
  }

  /**
   * Find duplicates for a specific object across all orgs
   */
  async findDuplicatesForObject(baseDir, orgs, objectName, foreignKey) {
    const duplicates = {}
    const globalForeignKeys = new Map() // FK value -> [{ org, recordIndex, record }]

    // Load records from all orgs
    for (const org of orgs) {
      const orgDir = path.join(baseDir, this.sanitizeOrgName(org))
      const jsonlPath = path.join(orgDir, `${objectName}.jsonl`)

      if (!pkgReader.existsSync(jsonlPath)) {
        console.log(`No data file found for ${objectName} in ${org}`)
        continue
      }

      try {
        const { records } = await this.appendWriter.readJSONL(jsonlPath)
        
        for (let i = 0; i < records.length; i++) {
          const record = records[i]
          const fkValue = record[foreignKey]

          if (fkValue) {
            if (!globalForeignKeys.has(fkValue)) {
              globalForeignKeys.set(fkValue, [])
            }

            globalForeignKeys.get(fkValue).push({
              org: org,
              recordIndex: i,
              record: record
            })
          }
        }

      } catch (error) {
        console.warn(`Failed to load ${objectName} from ${org}:`, error.message)
      }
    }

    // Find duplicates (FK values that appear in multiple orgs)
    for (const [fkValue, occurrences] of globalForeignKeys) {
      if (occurrences.length > 1) {
        // Group by org to see cross-org duplicates
        const orgGroups = {}
        occurrences.forEach(occ => {
          if (!orgGroups[occ.org]) {
            orgGroups[occ.org] = []
          }
          orgGroups[occ.org].push(occ)
        })

        // Only report as duplicate if appears in multiple orgs
        if (Object.keys(orgGroups).length > 1) {
          duplicates[fkValue] = {
            totalOccurrences: occurrences.length,
            orgsAffected: Object.keys(orgGroups),
            orgBreakdown: orgGroups,
            severity: this.calculateDuplicateSeverity(orgGroups)
          }
        }
      }
    }

    return duplicates
  }

  /**
   * Generate duplicate resolution strategies
   */
  async generateResolutions(duplicateReport, baseDir, strategy = 'conservative') {
    console.log(`Generating resolutions with strategy: ${strategy}`)

    const resolutions = {
      timestamp: new Date().toISOString(),
      strategy: strategy,
      duplicatesAnalyzed: 0,
      resolutionsGenerated: 0,
      blacklistedFKs: [],
      resolutionDetails: {}
    }

    for (const [objectName, objectDuplicates] of Object.entries(duplicateReport.duplicatesFound)) {
      console.log(`Processing resolutions for ${objectName}`)

      const objectResolutions = await this.resolveObjectDuplicates(
        objectName, objectDuplicates, strategy
      )

      resolutions.resolutionDetails[objectName] = objectResolutions
      resolutions.duplicatesAnalyzed += Object.keys(objectDuplicates).length
      resolutions.resolutionsGenerated += objectResolutions.resolutions.length
      resolutions.blacklistedFKs.push(...objectResolutions.blacklisted)
    }

    // Save resolutions
    const resolutionPath = path.join(baseDir, 'duplicate_resolutions.json')
    pkgReader.writeFileSync(resolutionPath, JSON.stringify(resolutions, null, 2))

    // Create blacklist file
    const blacklistPath = path.join(baseDir, 'blacklisted_foreign_keys.json')
    const blacklistData = {
      timestamp: new Date().toISOString(),
      strategy: strategy,
      blacklisted_fks: resolutions.blacklistedFKs,
      total_blacklisted: resolutions.blacklistedFKs.length
    }
    pkgReader.writeFileSync(blacklistPath, JSON.stringify(blacklistData, null, 2))

    // Generate summary
    const summaryPath = path.join(baseDir, 'resolution_summary.json')
    const summary = this.generateResolutionSummary(resolutions)
    pkgReader.writeFileSync(summaryPath, JSON.stringify(summary, null, 2))

    console.log(`Resolutions generated. Files saved:`)
    console.log(`- Resolutions: ${resolutionPath}`)
    console.log(`- Blacklist: ${blacklistPath}`)
    console.log(`- Summary: ${summaryPath}`)

    return resolutions
  }

  /**
   * Resolve duplicates for a specific object
   */
  async resolveObjectDuplicates(objectName, objectDuplicates, strategy) {
    const resolutions = {
      resolutions: [],
      blacklisted: [],
      kept: [],
      strategy: strategy
    }

    for (const [fkValue, duplicateInfo] of Object.entries(objectDuplicates)) {
      const resolution = this.resolveSingleDuplicate(
        objectName, fkValue, duplicateInfo, strategy
      )

      resolutions.resolutions.push(resolution)

      if (resolution.action === 'blacklist') {
        resolutions.blacklisted.push(`${objectName}:${fkValue}`)
      } else if (resolution.action === 'keep') {
        resolutions.kept.push(`${objectName}:${fkValue}`)
      }
    }

    return resolutions
  }

  /**
   * Resolve a single duplicate FK
   */
  resolveSingleDuplicate(objectName, fkValue, duplicateInfo, strategy) {
    const resolution = {
      objectName: objectName,
      foreignKeyValue: fkValue,
      severity: duplicateInfo.severity,
      orgsAffected: duplicateInfo.orgsAffected,
      totalOccurrences: duplicateInfo.totalOccurrences,
      action: 'keep', // default
      reason: '',
      selectedOrg: null
    }

    switch (strategy) {
      case 'conservative':
        // Blacklist all high-severity duplicates
        if (duplicateInfo.severity >= 0.8) {
          resolution.action = 'blacklist'
          resolution.reason = 'High-severity duplicate - data differs significantly across orgs'
        } else {
          resolution.action = 'keep'
          resolution.selectedOrg = this.selectBestOrg(duplicateInfo.orgBreakdown)
          resolution.reason = `Low-severity duplicate - keeping record from ${resolution.selectedOrg}`
        }
        break

      case 'aggressive':
        // Only blacklist severe conflicts
        if (duplicateInfo.severity >= 0.95) {
          resolution.action = 'blacklist'
          resolution.reason = 'Severe data conflict - completely different records'
        } else {
          resolution.action = 'keep'
          resolution.selectedOrg = this.selectBestOrg(duplicateInfo.orgBreakdown)
          resolution.reason = `Manageable duplicate - keeping record from ${resolution.selectedOrg}`
        }
        break

      case 'blacklist_all':
        // Blacklist all duplicates
        resolution.action = 'blacklist'
        resolution.reason = 'Blacklist-all strategy - removing all duplicate foreign keys'
        break

      case 'keep_first':
        // Keep record from first org alphabetically
        const firstOrg = duplicateInfo.orgsAffected.sort()[0]
        resolution.action = 'keep'
        resolution.selectedOrg = firstOrg
        resolution.reason = `Keep-first strategy - keeping record from ${firstOrg}`
        break

      default:
        resolution.action = 'keep'
        resolution.reason = 'Unknown strategy - defaulting to keep'
    }

    return resolution
  }

  /**
   * Select the "best" org for a duplicate (used in resolution strategies)
   */
  selectBestOrg(orgBreakdown) {
    // Simple heuristic: prefer production orgs, then alphabetically first
    const orgs = Object.keys(orgBreakdown)
    
    // Look for production indicators
    const productionOrgs = orgs.filter(org => 
      !org.includes('scratch') && 
      !org.includes('test') && 
      !org.includes('dev')
    )
    
    if (productionOrgs.length > 0) {
      return productionOrgs.sort()[0]
    }
    
    return orgs.sort()[0]
  }

  /**
   * Calculate duplicate severity (0-1, where 1 is most severe)
   */
  calculateDuplicateSeverity(orgGroups) {
    // Compare records across orgs to determine how different they are
    const orgs = Object.keys(orgGroups)
    if (orgs.length < 2) return 0

    // Get first record from each org
    const records = orgs.map(org => orgGroups[org][0].record)
    
    // Compare field values across records
    let totalFields = 0
    let differentFields = 0

    const firstRecord = records[0]
    const fieldNames = Object.keys(firstRecord).filter(key => !key.startsWith('_'))

    for (const fieldName of fieldNames) {
      totalFields++
      const values = records.map(record => record[fieldName])
      const uniqueValues = new Set(values.filter(v => v !== null && v !== undefined))
      
      if (uniqueValues.size > 1) {
        differentFields++
      }
    }

    return totalFields > 0 ? differentFields / totalFields : 0
  }

  /**
   * Calculate summary statistics for duplicate report
   */
  calculateSummaryStats(duplicateReport) {
    let totalDuplicates = 0
    let affectedOrgs = new Set()

    for (const [objectName, objectDuplicates] of Object.entries(duplicateReport.duplicatesFound)) {
      for (const [fkValue, duplicateInfo] of Object.entries(objectDuplicates)) {
        totalDuplicates++
        duplicateInfo.orgsAffected.forEach(org => affectedOrgs.add(org))
      }
    }

    duplicateReport.summary.totalDuplicates = totalDuplicates
    duplicateReport.summary.affectedOrgs = affectedOrgs.size
  }

  /**
   * Generate resolution summary
   */
  generateResolutionSummary(resolutions) {
    const summary = {
      timestamp: new Date().toISOString(),
      strategy: resolutions.strategy,
      totalDuplicatesAnalyzed: resolutions.duplicatesAnalyzed,
      totalResolutionsGenerated: resolutions.resolutionsGenerated,
      totalBlacklisted: resolutions.blacklistedFKs.length,
      actionBreakdown: {
        blacklist: 0,
        keep: 0,
        other: 0
      },
      objectBreakdown: {}
    }

    // Analyze resolution actions
    for (const [objectName, objectResolutions] of Object.entries(resolutions.resolutionDetails)) {
      summary.objectBreakdown[objectName] = {
        totalResolutions: objectResolutions.resolutions.length,
        blacklisted: objectResolutions.blacklisted.length,
        kept: objectResolutions.kept.length
      }

      objectResolutions.resolutions.forEach(resolution => {
        if (summary.actionBreakdown[resolution.action]) {
          summary.actionBreakdown[resolution.action]++
        } else {
          summary.actionBreakdown.other++
        }
      })
    }

    return summary
  }

  /**
   * Load configuration file
   */
  loadConfiguration(configPath) {
    if (!pkgReader.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`)
    }

    try {
      const content = pkgReader.readFileSync(configPath, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`Failed to parse configuration file: ${error.message}`)
    }
  }

  /**
   * Sanitize org name for directory usage
   */
  sanitizeOrgName(orgName) {
    return orgName.replace(/[@.]/g, '_')
  }

  /**
   * Apply resolutions to remove blacklisted records
   */
  async applyResolutions(baseDir, resolutionsPath) {
    console.log('Applying duplicate resolutions...')

    const resolutions = JSON.parse(pkgReader.readFileSync(resolutionsPath, 'utf8'))
    const blacklistedFKs = new Set(resolutions.blacklistedFKs)

    if (blacklistedFKs.size === 0) {
      console.log('No blacklisted FKs to apply')
      return { processed: 0, removed: 0 }
    }

    let totalProcessed = 0
    let totalRemoved = 0

    // Process each object's resolutions
    for (const [objectName, objectResolutions] of Object.entries(resolutions.resolutionDetails)) {
      const result = await this.applyObjectResolutions(
        baseDir, objectName, objectResolutions, blacklistedFKs
      )
      
      totalProcessed += result.processed
      totalRemoved += result.removed
    }

    console.log(`Applied resolutions: ${totalRemoved} records removed from ${totalProcessed} processed`)
    return { processed: totalProcessed, removed: totalRemoved }
  }

  /**
   * Apply resolutions for a specific object
   */
  async applyObjectResolutions(baseDir, objectName, objectResolutions, blacklistedFKs) {
    let processed = 0
    let removed = 0

    // Find all org directories
    const orgDirs = pkgReader.readdirSync(baseDir)
      .filter(item => pkgReader.statSync(path.join(baseDir, item)).isDirectory())

    for (const orgDir of orgDirs) {
      const jsonlPath = path.join(baseDir, orgDir, `${objectName}.jsonl`)
      
      if (!pkgReader.existsSync(jsonlPath)) continue

      try {
        // Read existing records
        const { records } = await this.appendWriter.readJSONL(jsonlPath)
        
        // Filter out blacklisted records
        const filteredRecords = records.filter(record => {
          const fkValue = record[objectName] ? record[objectName] : record._primaryKey
          const blacklistKey = `${objectName}:${fkValue}`
          
          if (blacklistedFKs.has(blacklistKey)) {
            removed++
            return false
          }
          
          processed++
          return true
        })

        // Rewrite file if any records were removed
        if (filteredRecords.length !== records.length) {
          await this.appendWriter.writeJSONL(filteredRecords, jsonlPath)
          console.log(`Updated ${jsonlPath}: ${records.length} -> ${filteredRecords.length} records`)
        }

      } catch (error) {
        console.warn(`Failed to process ${jsonlPath}:`, error.message)
      }
    }

    return { processed, removed }
  }
}

module.exports = { DuplicateResolver }