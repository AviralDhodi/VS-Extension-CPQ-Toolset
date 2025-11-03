// CPQ Toolset v3 - Permissions Analyser App Module
module.exports = {
  name: 'permissions-analyser',
  title: 'Permissions Analyser',
  version: '3.0.0',
  description: 'Analyze and compare Salesforce permissions across multiple organizations',
  author: 'CPQ Toolset Team',
  
  // App metadata
  metadata: {
    icon: 'user',
    category: 'security',
    tags: ['permissions', 'security', 'profiles', 'permission-sets', 'multi-org'],
    requirements: {
      minOrgs: 2,
      pythonRequired: true,
      sfdxRequired: true
    }
  },

  // App capabilities
  capabilities: {
    packageXmlGeneration: true,
    metadataRetrieval: true,
    pythonProcessing: true,
    excelExport: true,
    granularComparison: true,
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
    permissions: {
      type: 'object',
      properties: {
        profiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of profiles to analyze'
        },
        permissionSets: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of permission sets to analyze'
        },
        mutingPermissionSets: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of muting permission sets to analyze'
        },
        objectPermissions: {
          type: 'object',
          properties: {
            objects: {
              type: 'array',
              items: { type: 'string' }
            },
            includeFieldPermissions: { type: 'boolean', default: true }
          }
        },
        apexClasses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Apex class access permissions'
        },
        visualforcePages: {
          type: 'array',
          items: { type: 'string' },
          description: 'Visualforce page access permissions'
        },
        customMetadata: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom metadata type permissions'
        },
        customSettings: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom settings permissions'
        },
        systemPermissions: {
          type: 'boolean',
          default: true,
          description: 'Include system permissions in analysis'
        },
        userPermissions: {
          type: 'boolean',
          default: true,
          description: 'Include user permissions in analysis'
        },
        setupEntityAccess: {
          type: 'boolean',
          default: true,
          description: 'Include setup entity access permissions'
        }
      },
      required: ['profiles', 'permissionSets']
    },
    packageXml: {
      type: 'object',
      properties: {
        version: { type: 'string', default: '60.0' },
        includeAllProfiles: { type: 'boolean', default: false },
        includeAllPermissionSets: { type: 'boolean', default: false }
      }
    }
  },

  // Supported metadata types for package.xml
  metadataTypes: {
    Profile: 'profiles',
    PermissionSet: 'permissionsets',
    MutingPermissionSet: 'mutingpermissionsets',
    CustomObject: 'objects',
    ApexClass: 'classes',
    ApexPage: 'pages',
    CustomMetadata: 'customMetadata',
    CustomSettings: 'customSettings'
  }
};