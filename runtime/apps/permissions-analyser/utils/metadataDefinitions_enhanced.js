// Enhanced Metadata Definitions for Salesforce Permission Types
// Based on official Salesforce Metadata API documentation
// https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/

const METADATA_DEFINITIONS = {
    // Profile - Complete structure from documentation
    Profile: {
        displayName: 'Profiles',
        apiName: 'Profile',
        metadataType: 'Profile',
        fileExtension: '.profile-meta.xml',
        supportedPermissions: {
            // Application Visibilities
            applicationVisibilities: {
                label: 'Application Visibilities',
                description: 'Visibility settings for applications',
                requiresApplications: true,
                fields: {
                    application: { type: 'string', required: true },
                    default: { type: 'boolean', default: false },
                    visible: { type: 'boolean', default: true }
                }
            },
            
            // Class Access
            classAccesses: {
                label: 'Apex Class Access',
                description: 'Access to Apex classes',
                requiresApexClasses: true,
                fields: {
                    apexClass: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Custom Permissions
            customPermissions: {
                label: 'Custom Permissions',
                description: 'Custom permissions defined in the org',
                requiresCustomPermissions: true,
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // External Data Source Access
            externalDataSourceAccesses: {
                label: 'External Data Source Access',
                description: 'Access to external data sources',
                requiresExternalDataSources: true,
                fields: {
                    externalDataSource: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Field Level Security (Field Permissions)
            fieldPermissions: {
                label: 'Field Permissions',
                description: 'Field-level security settings',
                requiresObjects: true,
                requiresFields: true,
                fields: {
                    field: { type: 'string', required: true },
                    editable: { type: 'boolean', default: false },
                    readable: { type: 'boolean', default: false }
                }
            },
            
            // Flow Access
            flowAccesses: {
                label: 'Flow Access',
                description: 'Access to flows',
                requiresFlows: true,
                fields: {
                    flow: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Layout Assignments
            layoutAssignments: {
                label: 'Page Layout Assignments',
                description: 'Page layout assignments for record types',
                requiresLayouts: true,
                requiresRecordTypes: true,
                fields: {
                    layout: { type: 'string', required: true },
                    recordType: { type: 'string' }
                }
            },
            
            // Login Hours
            loginHours: {
                label: 'Login Hours',
                description: 'Login hour restrictions by day',
                profileOnly: true,
                fields: {
                    mondayStart: { type: 'time' },
                    mondayEnd: { type: 'time' },
                    tuesdayStart: { type: 'time' },
                    tuesdayEnd: { type: 'time' },
                    wednesdayStart: { type: 'time' },
                    wednesdayEnd: { type: 'time' },
                    thursdayStart: { type: 'time' },
                    thursdayEnd: { type: 'time' },
                    fridayStart: { type: 'time' },
                    fridayEnd: { type: 'time' },
                    saturdayStart: { type: 'time' },
                    saturdayEnd: { type: 'time' },
                    sundayStart: { type: 'time' },
                    sundayEnd: { type: 'time' }
                }
            },
            
            // Login IP Ranges
            loginIpRanges: {
                label: 'Login IP Ranges',
                description: 'IP address restrictions',
                profileOnly: true,
                fields: {
                    description: { type: 'string' },
                    startAddress: { type: 'string', required: true },
                    endAddress: { type: 'string', required: true }
                }
            },
            
            // Object Permissions
            objectPermissions: {
                label: 'Object Permissions',
                description: 'CRUD permissions on objects',
                requiresObjects: true,
                fields: {
                    object: { type: 'string', required: true },
                    allowCreate: { type: 'boolean', default: false },
                    allowDelete: { type: 'boolean', default: false },
                    allowEdit: { type: 'boolean', default: false },
                    allowRead: { type: 'boolean', default: false },
                    modifyAllRecords: { type: 'boolean', default: false },
                    viewAllRecords: { type: 'boolean', default: false }
                }
            },
            
            // Page Access
            pageAccesses: {
                label: 'Visualforce Page Access',
                description: 'Access to Visualforce pages',
                requiresPages: true,
                fields: {
                    apexPage: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Record Type Visibilities
            recordTypeVisibilities: {
                label: 'Record Type Visibilities',
                description: 'Record type visibility and default settings',
                requiresRecordTypes: true,
                fields: {
                    recordType: { type: 'string', required: true },
                    default: { type: 'boolean', default: false },
                    personAccountDefault: { type: 'boolean', default: false },
                    visible: { type: 'boolean', default: true }
                }
            },
            
            // Tab Visibilities
            tabVisibilities: {
                label: 'Tab Visibilities',
                description: 'Tab visibility settings',
                requiresTabs: true,
                fields: {
                    tab: { type: 'string', required: true },
                    visibility: { 
                        type: 'picklist', 
                        values: ['DefaultOff', 'DefaultOn', 'Hidden'],
                        default: 'DefaultOff'
                    }
                }
            },
            
            // User Permissions
            userPermissions: {
                label: 'User Permissions',
                description: 'System-wide user permissions',
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Profile-specific metadata
            custom: {
                label: 'Custom Profile',
                description: 'Whether this is a custom profile',
                profileOnly: true,
                fields: {
                    custom: { type: 'boolean', default: false }
                }
            },
            
            userLicense: {
                label: 'User License',
                description: 'The user license associated with the profile',
                profileOnly: true,
                fields: {
                    userLicense: { type: 'string', required: true }
                }
            },
            
            description: {
                label: 'Description',
                description: 'Profile description',
                profileOnly: true,
                fields: {
                    description: { type: 'string' }
                }
            }
        }
    },
    
    // Permission Set - Complete structure
    PermissionSet: {
        displayName: 'Permission Sets',
        apiName: 'PermissionSet',
        metadataType: 'PermissionSet',
        fileExtension: '.permissionset-meta.xml',
        supportedPermissions: {
            // Same as Profile but without some profile-specific items
            applicationVisibilities: {
                label: 'Application Visibilities',
                description: 'Visibility settings for applications',
                requiresApplications: true,
                fields: {
                    application: { type: 'string', required: true },
                    visible: { type: 'boolean', default: true }
                }
            },
            
            classAccesses: {
                label: 'Apex Class Access',
                description: 'Access to Apex classes',
                requiresApexClasses: true,
                fields: {
                    apexClass: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            customMetadataTypeAccesses: {
                label: 'Custom Metadata Type Access',
                description: 'Access to custom metadata types',
                requiresCustomMetadataTypes: true,
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            customPermissions: {
                label: 'Custom Permissions',
                description: 'Custom permissions defined in the org',
                requiresCustomPermissions: true,
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            customSettingAccesses: {
                label: 'Custom Setting Access',
                description: 'Access to custom settings',
                requiresCustomSettings: true,
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            externalDataSourceAccesses: {
                label: 'External Data Source Access',
                description: 'Access to external data sources',
                requiresExternalDataSources: true,
                fields: {
                    externalDataSource: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            fieldPermissions: {
                label: 'Field Permissions',
                description: 'Field-level security settings',
                requiresObjects: true,
                requiresFields: true,
                fields: {
                    field: { type: 'string', required: true },
                    editable: { type: 'boolean', default: false },
                    readable: { type: 'boolean', default: false }
                }
            },
            
            flowAccesses: {
                label: 'Flow Access',
                description: 'Access to flows',
                requiresFlows: true,
                fields: {
                    flow: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            objectPermissions: {
                label: 'Object Permissions',
                description: 'CRUD permissions on objects',
                requiresObjects: true,
                fields: {
                    object: { type: 'string', required: true },
                    allowCreate: { type: 'boolean', default: false },
                    allowDelete: { type: 'boolean', default: false },
                    allowEdit: { type: 'boolean', default: false },
                    allowRead: { type: 'boolean', default: false },
                    modifyAllRecords: { type: 'boolean', default: false },
                    viewAllRecords: { type: 'boolean', default: false }
                }
            },
            
            pageAccesses: {
                label: 'Visualforce Page Access',
                description: 'Access to Visualforce pages',
                requiresPages: true,
                fields: {
                    apexPage: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            recordTypeVisibilities: {
                label: 'Record Type Visibilities',
                description: 'Record type visibility settings',
                requiresRecordTypes: true,
                fields: {
                    recordType: { type: 'string', required: true },
                    visible: { type: 'boolean', default: true }
                }
            },
            
            tabSettings: {
                label: 'Tab Settings',
                description: 'Tab visibility settings',
                requiresTabs: true,
                fields: {
                    tab: { type: 'string', required: true },
                    visibility: { 
                        type: 'picklist', 
                        values: ['Available', 'None', 'Visible'],
                        default: 'None'
                    }
                }
            },
            
            userPermissions: {
                label: 'User Permissions',
                description: 'System-wide user permissions',
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Permission Set specific
            description: {
                label: 'Description',
                description: 'Permission set description',
                fields: {
                    description: { type: 'string' }
                }
            },
            
            hasActivationRequired: {
                label: 'Activation Required',
                description: 'Whether activation is required',
                fields: {
                    hasActivationRequired: { type: 'boolean', default: false }
                }
            },
            
            label: {
                label: 'Label',
                description: 'Permission set label',
                fields: {
                    label: { type: 'string', required: true }
                }
            },
            
            license: {
                label: 'License',
                description: 'Associated license',
                fields: {
                    license: { type: 'string' }
                }
            }
        }
    },
    
    // Permission Set Group
    PermissionSetGroup: {
        displayName: 'Permission Set Groups',
        apiName: 'PermissionSetGroup',
        metadataType: 'PermissionSetGroup',
        fileExtension: '.permissionsetgroup-meta.xml',
        supportedPermissions: {
            description: {
                label: 'Description',
                description: 'Permission set group description',
                fields: {
                    description: { type: 'string' }
                }
            },
            
            hasActivationRequired: {
                label: 'Activation Required',
                description: 'Whether activation is required',
                fields: {
                    hasActivationRequired: { type: 'boolean', default: false }
                }
            },
            
            label: {
                label: 'Label',
                description: 'Permission set group label',
                fields: {
                    label: { type: 'string', required: true }
                }
            },
            
            mutingPermissionSets: {
                label: 'Muting Permission Sets',
                description: 'Permission sets that remove permissions',
                requiresMutingPermissionSets: true,
                fields: {
                    mutingPermissionSet: { type: 'string', required: true }
                }
            },
            
            permissionSets: {
                label: 'Permission Sets',
                description: 'Permission sets included in this group',
                requiresPermissionSets: true,
                fields: {
                    permissionSet: { type: 'string', required: true }
                }
            },
            
            status: {
                label: 'Status',
                description: 'Status of the permission set group',
                fields: {
                    status: { 
                        type: 'picklist',
                        values: ['Updated', 'Outdated', 'Updating'],
                        default: 'Updated'
                    }
                }
            }
        }
    },
    
    // Muting Permission Set
    MutingPermissionSet: {
        displayName: 'Muting Permission Sets',
        apiName: 'MutingPermissionSet',
        metadataType: 'MutingPermissionSet',
        fileExtension: '.mutingpermissionset-meta.xml',
        supportedPermissions: {
            // Only includes permissions that can be removed
            classAccesses: {
                label: 'Apex Class Access to Remove',
                description: 'Remove access to Apex classes',
                requiresApexClasses: true,
                fields: {
                    apexClass: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            customPermissions: {
                label: 'Custom Permissions to Remove',
                description: 'Remove custom permissions',
                requiresCustomPermissions: true,
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            externalDataSourceAccesses: {
                label: 'External Data Source Access to Remove',
                description: 'Remove access to external data sources',
                requiresExternalDataSources: true,
                fields: {
                    externalDataSource: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            fieldPermissions: {
                label: 'Field Permissions to Remove',
                description: 'Remove field-level permissions',
                requiresObjects: true,
                requiresFields: true,
                fields: {
                    field: { type: 'string', required: true },
                    editable: { type: 'boolean', default: false },
                    readable: { type: 'boolean', default: false }
                }
            },
            
            flowAccesses: {
                label: 'Flow Access to Remove',
                description: 'Remove access to flows',
                requiresFlows: true,
                fields: {
                    flow: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            objectPermissions: {
                label: 'Object Permissions to Remove',
                description: 'Remove CRUD permissions on objects',
                requiresObjects: true,
                fields: {
                    object: { type: 'string', required: true },
                    allowCreate: { type: 'boolean', default: false },
                    allowDelete: { type: 'boolean', default: false },
                    allowEdit: { type: 'boolean', default: false },
                    allowRead: { type: 'boolean', default: false },
                    modifyAllRecords: { type: 'boolean', default: false },
                    viewAllRecords: { type: 'boolean', default: false }
                }
            },
            
            pageAccesses: {
                label: 'Visualforce Page Access to Remove',
                description: 'Remove access to Visualforce pages',
                requiresPages: true,
                fields: {
                    apexPage: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            userPermissions: {
                label: 'User Permissions to Remove',
                description: 'Remove system-wide user permissions',
                fields: {
                    name: { type: 'string', required: true },
                    enabled: { type: 'boolean', required: true }
                }
            },
            
            // Muting Permission Set specific
            description: {
                label: 'Description',
                description: 'Muting permission set description',
                fields: {
                    description: { type: 'string' }
                }
            },
            
            label: {
                label: 'Label',
                description: 'Muting permission set label',
                fields: {
                    label: { type: 'string', required: true }
                }
            }
        }
    }
};

// Helper function to get all possible permission options for UI
function getAllPermissionOptions() {
    const allOptions = new Set();
    
    Object.values(METADATA_DEFINITIONS).forEach(def => {
        Object.keys(def.supportedPermissions).forEach(perm => {
            allOptions.add(perm);
        });
    });
    
    return Array.from(allOptions).sort();
}

// Helper function to get required metadata types for package.xml
function getRequiredMetadataTypes(selectedPermissionTypes, selectedOptions) {
    const requiredTypes = new Set();
    
    selectedPermissionTypes.forEach(permType => {
        // Add the permission type itself
        requiredTypes.add(permType);
        
        const definition = METADATA_DEFINITIONS[permType];
        if (!definition) return;
        
        // Check selected options for this permission type
        Object.entries(selectedOptions[permType] || {}).forEach(([optionName, config]) => {
            if (!config || !config.enabled) return;
            
            const option = definition.supportedPermissions[optionName];
            if (!option) return;
            
            // Add required metadata types based on option requirements
            if (option.requiresObjects) requiredTypes.add('CustomObject');
            if (option.requiresFields) requiredTypes.add('CustomField');
            if (option.requiresApexClasses) requiredTypes.add('ApexClass');
            if (option.requiresPages) requiredTypes.add('ApexPage');
            if (option.requiresApplications) requiredTypes.add('CustomApplication');
            if (option.requiresCustomPermissions) requiredTypes.add('CustomPermission');
            if (option.requiresFlows) requiredTypes.add('Flow');
            if (option.requiresTabs) requiredTypes.add('CustomTab');
            if (option.requiresRecordTypes) requiredTypes.add('RecordType');
            if (option.requiresLayouts) requiredTypes.add('Layout');
            if (option.requiresPermissionSets) requiredTypes.add('PermissionSet');
            if (option.requiresMutingPermissionSets) requiredTypes.add('MutingPermissionSet');
            if (option.requiresExternalDataSources) requiredTypes.add('ExternalDataSource');
            if (option.requiresCustomSettings) requiredTypes.add('CustomSetting');
            if (option.requiresCustomMetadataTypes) requiredTypes.add('CustomMetadata');
        });
    });
    
    return Array.from(requiredTypes);
}

// Helper to validate if an option is available for a permission type
function isOptionAvailable(permissionType, optionName) {
    const definition = METADATA_DEFINITIONS[permissionType];
    return definition && definition.supportedPermissions[optionName] !== undefined;
}

// Get display information for permission options
function getPermissionOptionInfo(permissionType, optionName) {
    const definition = METADATA_DEFINITIONS[permissionType];
    if (!definition || !definition.supportedPermissions[optionName]) {
        return null;
    }
    
    return definition.supportedPermissions[optionName];
}

module.exports = {
    METADATA_DEFINITIONS,
    getAllPermissionOptions,
    getRequiredMetadataTypes,
    isOptionAvailable,
    getPermissionOptionInfo
};