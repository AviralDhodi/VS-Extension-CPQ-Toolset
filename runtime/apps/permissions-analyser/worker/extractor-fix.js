// Add this function after discoverCommonPages function

// Discover common fields for objects across all orgs
async function discoverCommonFields(orgs, objects) {
    const { getInstance: getSFDXRunner } = require('../../../shared/utils/sfdxRunner');
    const sfdxRunner = getSFDXRunner();
    
    logger.info('Discovering common fields across orgs...');
    const commonFields = [];
    
    // For each object, get fields from all orgs and find common ones
    for (const objName of objects) {
        const orgFields = {};
        const allFields = new Set();
        
        // Get fields from each org
        for (const org of orgs) {
            try {
                const fields = await sfdxRunner.getObjectFields(objName, org);
                const fieldNames = fields.map(f => f.name);
                orgFields[org] = new Set(fieldNames);
                fieldNames.forEach(field => allFields.add(field));
                logger.info(`Found ${fields.length} fields for ${objName} in ${org}`);
            } catch (error) {
                logger.error(`Failed to get fields for ${objName} from ${org}:`, error.message);
                orgFields[org] = new Set();
            }
        }
        
        // Find fields present in all orgs
        const objCommonFields = Array.from(allFields).filter(fieldName => 
            orgs.every(org => orgFields[org].has(fieldName))
        );
        
        // Add to common fields list in Object.Field format
        objCommonFields.forEach(field => {
            commonFields.push(`${objName}.${field}`);
        });
    }
    
    logger.info(`Found ${commonFields.length} common fields across all objects`);
    return commonFields;
}

// Updated generatePackageXml function with CustomField support
async function generatePackageXml(config, commonObjects = null, commonApexClasses = null, commonPages = null, commonFields = null) {
    const { getRequiredMetadataTypes } = require('../utils/metadataDefinitions');
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">`;

    // Process each permission type and its selected items
    const metadataByType = {};
    
    // Add selected permission items
    Object.entries(config.permissions || {}).forEach(([permType, items]) => {
        if (items && items.length > 0) {
            if (!metadataByType[permType]) metadataByType[permType] = new Set();
            items.forEach(item => metadataByType[permType].add(item));
        }
    });
    
    // Add dependent metadata based on selected permission options
    const requiredTypes = getRequiredMetadataTypes(
        Object.keys(config.permissions || {}),
        config.selectedPermissionOptions || {}
    );
    
    // Handle required metadata types
    if (config.selectedPermissionOptions) {
        Object.entries(config.selectedPermissionOptions).forEach(([permType, options]) => {
            // Handle objects if field/object permissions are selected
            if (options.objectPermissions || options.fieldPermissions) {
                if (!metadataByType.CustomObject) metadataByType.CustomObject = new Set();
                
                // Add objects based on user selection
                if (config.objectSelection === 'ALL') {
                    if (commonObjects && commonObjects.all.length > 0) {
                        commonObjects.all.forEach(obj => {
                            metadataByType.CustomObject.add(obj);
                        });
                    } else {
                        metadataByType.CustomObject.add('*');
                    }
                } else if (config.objectSelection === 'COMMON') {
                    if (commonObjects && commonObjects.all) {
                        commonObjects.all.forEach(obj => {
                            metadataByType.CustomObject.add(obj);
                        });
                    }
                }
            }
            
            // Handle fields if fieldPermissions are selected
            if (options.fieldPermissions) {
                if (!metadataByType.CustomField) metadataByType.CustomField = new Set();
                
                if (config.fieldSelection === 'ALL') {
                    // Add wildcard for all fields
                    metadataByType.CustomField.add('*');
                } else if (config.fieldSelection === 'COMMON' && commonFields) {
                    // Add discovered common fields
                    commonFields.forEach(field => {
                        metadataByType.CustomField.add(field);
                    });
                } else if (!config.fieldSelection || config.fieldSelection === 'AUTO') {
                    // Default behavior - use common fields if available, otherwise wildcard
                    if (commonFields && commonFields.length > 0) {
                        commonFields.forEach(field => {
                            metadataByType.CustomField.add(field);
                        });
                    } else {
                        metadataByType.CustomField.add('*');
                    }
                }
            }
            
            // Add other metadata types as before...
            // [Keep existing logic for ApexClass, ApexPage, RecordType, etc.]
        });
    }
    
    // Build XML for each metadata type
    Object.entries(metadataByType).forEach(([typeName, members]) => {
        if (members.size > 0) {
            xml += `
    <types>`;
            Array.from(members).forEach(member => {
                xml += `
        <members>${member}</members>`;
            });
            xml += `
        <name>${typeName}</name>
    </types>`;
        }
    });

    xml += `
    <version>60.0</version>
</Package>`;

    return xml;
}

// Update the main extraction logic to discover common fields
// In the performExtraction function, add this after discovering common objects:

/*
// Example code for discovering common fields:
// Discover common fields if needed
let commonFields = null;
if (config.selectedPermissionOptions && 
    Object.values(config.selectedPermissionOptions).some(opts => opts.fieldPermissions)) {
    
    // Get objects to check fields for
    let objectsToCheck = [];
    if (config.objectSelection === 'COMMON' && commonObjects) {
        objectsToCheck = commonObjects.all || [];
    } else if (config.objectSelection === 'ALL' && commonObjects) {
        objectsToCheck = commonObjects.all || [];
    }
    
    if (objectsToCheck.length > 0) {
        commonFields = await discoverCommonFields(orgs, objectsToCheck);
        
        // Save common fields info
        const commonFieldsPath = path.join(extractDir, 'common_fields.json');
        await fs.writeFile(commonFieldsPath, JSON.stringify(commonFields, null, 2));
    }
}

// Then pass commonFields to generatePackageXml:
const packageXml = await generatePackageXml(config, commonObjects, commonApexClasses, commonPages, commonFields);
*/