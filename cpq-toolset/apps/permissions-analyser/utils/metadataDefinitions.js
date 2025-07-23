// Metadata Definitions for Salesforce Permission Types
// Based on Salesforce Metadata API documentation

const METADATA_DEFINITIONS = {
    // Permission Set - Most comprehensive permission type
    PermissionSet: {
        displayName: 'Permission Sets',
        apiName: 'PermissionSet',
        queryObject: 'PermissionSet',
        assignmentObject: 'PermissionSetAssignment',
        supportedPermissions: {
            objectPermissions: {
                label: 'Object Permissions',
                description: 'CRUD permissions on objects',
                requiresObjects: true,
                fields: ['allowCreate', 'allowDelete', 'allowEdit', 'allowRead', 'modifyAllRecords', 'viewAllRecords']
            },
            fieldPermissions: {
                label: 'Field Permissions',
                description: 'Read/Edit permissions on fields',
                requiresObjects: true,
                requiresFields: true,
                fields: ['editable', 'readable']
            },
            apexClasses: {
                label: 'Apex Class Access',
                description: 'Access to Apex classes',
                requiresApexClasses: true,
                fields: ['enabled']
            },
            visualforcePages: {
                label: 'Visualforce Page Access',
                description: 'Access to Visualforce pages',
                requiresPages: true,
                fields: ['enabled']
            },
            customPermissions: {
                label: 'Custom Permissions',
                description: 'Custom permissions defined in the org',
                fields: ['enabled']
            },
            tabSettings: {
                label: 'Tab Visibility',
                description: 'Tab visibility settings',
                fields: ['visibility']
            },
            applicationVisibilities: {
                label: 'App Visibility',
                description: 'Application visibility settings',
                fields: ['default', 'visible']
            },
            recordTypeVisibilities: {
                label: 'Record Type Access',
                description: 'Record type visibility and default',
                requiresRecordTypes: true,
                fields: ['default', 'visible', 'personAccountDefault']
            },
            userPermissions: {
                label: 'User Permissions',
                description: 'System-wide user permissions',
                fields: ['enabled'],
                examples: ['ApiEnabled', 'ViewSetup', 'ModifyAllData']
            },
            customMetadataTypeAccesses: {
                label: 'Custom Metadata Type Access',
                description: 'Access to custom metadata types',
                fields: ['enabled']
            },
            customSettingAccesses: {
                label: 'Custom Setting Access',
                description: 'Access to custom settings',
                fields: ['enabled']
            },
            externalDataSourceAccesses: {
                label: 'External Data Source Access',
                description: 'Access to external data sources',
                fields: ['enabled']
            },
            flowAccesses: {
                label: 'Flow Access',
                description: 'Access to flows',
                fields: ['enabled']
            }
        }
    },

    // Permission Set Group - Collection of permission sets
    PermissionSetGroup: {
        displayName: 'Permission Set Groups',
        apiName: 'PermissionSetGroup',
        queryObject: 'PermissionSetGroup',
        assignmentObject: 'PermissionSetAssignment', // PSGs also use this
        supportedPermissions: {
            permissionSets: {
                label: 'Included Permission Sets',
                description: 'Permission sets included in this group',
                fields: ['permissionSet']
            },
            mutingPermissionSets: {
                label: 'Muting Permission Sets',
                description: 'Permission sets that remove permissions',
                fields: ['mutingPermissionSet']
            },
            status: {
                label: 'Status',
                description: 'Status of the permission set group',
                fields: ['status']
            }
        },
        limitations: [
            'Cannot directly assign object/field permissions',
            'Permissions come from included permission sets',
            'Muting permission sets can remove permissions'
        ]
    },

    // Profile - Legacy but comprehensive permission type
    Profile: {
        displayName: 'Profiles',
        apiName: 'Profile',
        queryObject: 'Profile',
        assignmentObject: null, // Profiles are assigned directly to users
        supportedPermissions: {
            objectPermissions: {
                label: 'Object Permissions',
                description: 'CRUD permissions on objects',
                requiresObjects: true,
                fields: ['allowCreate', 'allowDelete', 'allowEdit', 'allowRead', 'modifyAllRecords', 'viewAllRecords']
            },
            fieldPermissions: {
                label: 'Field Permissions',
                description: 'Read/Edit permissions on fields',
                requiresObjects: true,
                requiresFields: true,
                fields: ['editable', 'readable']
            },
            apexClasses: {
                label: 'Apex Class Access',
                description: 'Access to Apex classes',
                requiresApexClasses: true,
                fields: ['enabled']
            },
            visualforcePages: {
                label: 'Visualforce Page Access',
                description: 'Access to Visualforce pages',
                requiresPages: true,
                fields: ['enabled']
            },
            tabVisibilities: {
                label: 'Tab Visibility',
                description: 'Tab visibility settings',
                fields: ['visibility']
            },
            applicationVisibilities: {
                label: 'App Visibility',
                description: 'Application visibility settings',
                fields: ['default', 'visible']
            },
            recordTypeVisibilities: {
                label: 'Record Type Access',
                description: 'Record type visibility and default',
                requiresRecordTypes: true,
                fields: ['default', 'visible', 'personAccountDefault']
            },
            userPermissions: {
                label: 'User Permissions',
                description: 'System-wide user permissions',
                fields: ['enabled']
            },
            layoutAssignments: {
                label: 'Page Layout Assignments',
                description: 'Page layout assignments for record types',
                requiresLayouts: true,
                fields: ['layout', 'recordType']
            },
            loginHours: {
                label: 'Login Hours',
                description: 'Login hour restrictions',
                fields: ['weekdayStart', 'weekdayEnd']
            },
            loginIpRanges: {
                label: 'Login IP Ranges',
                description: 'IP range restrictions',
                fields: ['startAddress', 'endAddress']
            },
            custom: {
                label: 'Custom Profile Settings',
                description: 'Is this a custom profile',
                fields: ['custom']
            },
            userLicense: {
                label: 'User License',
                description: 'Associated user license',
                fields: ['userLicense']
            }
        }
    },

    // Muting Permission Set - Removes permissions from PSGs
    MutingPermissionSet: {
        displayName: 'Muting Permission Sets',
        apiName: 'MutingPermissionSet',
        queryObject: 'MutingPermissionSet',
        assignmentObject: null, // Not directly assigned, used in PSGs
        supportedPermissions: {
            objectPermissions: {
                label: 'Object Permissions to Remove',
                description: 'CRUD permissions to remove',
                requiresObjects: true,
                fields: ['allowCreate', 'allowDelete', 'allowEdit', 'allowRead', 'modifyAllRecords', 'viewAllRecords']
            },
            fieldPermissions: {
                label: 'Field Permissions to Remove',
                description: 'Field permissions to remove',
                requiresObjects: true,
                requiresFields: true,
                fields: ['editable', 'readable']
            },
            apexClasses: {
                label: 'Apex Class Access to Remove',
                description: 'Apex class access to remove',
                requiresApexClasses: true,
                fields: ['enabled']
            },
            visualforcePages: {
                label: 'Visualforce Page Access to Remove',
                description: 'VF page access to remove',
                requiresPages: true,
                fields: ['enabled']
            },
            customPermissions: {
                label: 'Custom Permissions to Remove',
                description: 'Custom permissions to remove',
                fields: ['enabled']
            },
            userPermissions: {
                label: 'User Permissions to Remove',
                description: 'System permissions to remove',
                fields: ['enabled']
            }
        },
        limitations: [
            'Can only remove permissions, not grant them',
            'Only used within Permission Set Groups',
            'Cannot be assigned directly to users'
        ]
    }
};

// Helper function to get required metadata types for package.xml
function getRequiredMetadataTypes(selectedPermissionTypes, selectedPermissions) {
    const requiredTypes = new Set();
    
    selectedPermissionTypes.forEach(permType => {
        const definition = METADATA_DEFINITIONS[permType];
        if (!definition) return;
        
        // Always include the permission type itself
        requiredTypes.add(permType);
        
        // Check what additional metadata is required
        Object.entries(selectedPermissions[permType] || {}).forEach(([permName, isSelected]) => {
            if (!isSelected) return;
            
            const perm = definition.supportedPermissions[permName];
            if (!perm) return;
            
            if (perm.requiresObjects) requiredTypes.add('CustomObject');
            if (perm.requiresFields) requiredTypes.add('CustomField');
            if (perm.requiresApexClasses) requiredTypes.add('ApexClass');
            if (perm.requiresPages) requiredTypes.add('ApexPage');
            if (perm.requiresRecordTypes) requiredTypes.add('RecordType');
            if (perm.requiresLayouts) requiredTypes.add('Layout');
        });
    });
    
    return Array.from(requiredTypes);
}

// Helper to build SOQL for getting assignment counts
function getAssignmentCountQuery(permissionType) {
    const def = METADATA_DEFINITIONS[permissionType];
    if (!def || !def.assignmentObject) return null;
    
    if (permissionType === 'PermissionSet') {
        return `
            SELECT PermissionSet.Name, PermissionSet.Label, 
                   COUNT(AssigneeId) AssignmentCount
            FROM PermissionSetAssignment
            WHERE PermissionSetId != null
            GROUP BY PermissionSet.Name, PermissionSet.Label
            ORDER BY COUNT(AssigneeId) DESC
        `;
    } else if (permissionType === 'PermissionSetGroup') {
        return `
            SELECT PermissionSetGroup.DeveloperName, PermissionSetGroup.MasterLabel,
                   COUNT(AssigneeId) AssignmentCount
            FROM PermissionSetAssignment
            WHERE PermissionSetGroupId != null
            GROUP BY PermissionSetGroup.DeveloperName, PermissionSetGroup.MasterLabel
            ORDER BY COUNT(AssigneeId) DESC
        `;
    }
    
    return null;
}

module.exports = {
    METADATA_DEFINITIONS,
    getRequiredMetadataTypes,
    getAssignmentCountQuery
};