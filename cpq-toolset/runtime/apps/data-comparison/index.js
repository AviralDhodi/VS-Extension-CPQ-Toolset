// CPQ Toolset v3 - Data Comparison App Module
module.exports = {
  name: 'data-comparison',
  title: 'Data Comparison',
  version: '3.0.0',
  description: 'Compare Salesforce CPQ data across multiple organizations',
  author: 'CPQ Toolset Team',
  
  // App metadata
  metadata: {
    icon: 'chart',
    category: 'analysis',
    tags: ['comparison', 'multi-org', 'cpq', 'salesforce'],
    requirements: {
      minOrgs: 2,
      pythonRequired: true,
      sfdxRequired: true
    }
  },

  // App capabilities
  capabilities: {
    dataExtraction: true,
    pythonProcessing: true,
    excelExport: true,
    parquetSupport: true,
    multiOrgAnalysis: true
  },

  // Configuration schema
  configSchema: {
    version: '3.0.0',
    orgs: {
      type: 'array',
      minItems: 2,
      items: { type: 'string' }
    },
    objects: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: { type: 'string' }
          },
          foreignKey: { type: 'string' },
          orgFilters: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                activeCondition: { type: 'string' },
                dateFilterType: { type: 'string' },
                dateFrom: { type: 'string' },
                dateTo: { type: 'string' },
                customFilters: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            }
          }
        },
        required: ['fields']
      }
    }
  },

  // App routes are loaded from ./routes/index.js
  // App state is managed by ./state/index.js
  // Workers are in ./worker/
  // Python scripts are in ./python/
  // Components are in ./components/
};