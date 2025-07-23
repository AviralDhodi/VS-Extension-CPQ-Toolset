// Permissions Extractor Worker
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { logger } = require('../../../shared/utils/logger');

// Parse command line arguments
const args = process.argv.slice(2);
const extractionId = args[args.indexOf('--extractionId') + 1];
const configPath = args[args.indexOf('--configPath') + 1];

if (!extractionId || !configPath) {
    logger.error('Missing required arguments: --extractionId and --configPath');
    process.exit(1);
}

// Send progress updates to parent process
function sendProgress(phase, progress, message, error = null) {
    if (process.send) {
        process.send({
            type: 'progress',
            data: {
                phase,
                progress,
                message,
                timestamp: new Date().toISOString(),
                error: error ? error.toString() : null
            }
        });
    }
}

// Execute SFDX command
function executeSfdx(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const sfdx = spawn(command, args, {
            cwd: options.cwd || process.cwd(),
            ...options,
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        sfdx.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        sfdx.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        sfdx.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`SFDX command failed: ${stderr || stdout}`));
            }
        });
    });
}

// Main extraction process
async function extractPermissions() {
    try {
        sendProgress('initialization', 0, 'Loading configuration...');
        
        // Use sf CLI (sfdx is deprecated)
        const cliPath = 'sf';
        logger.info(`Using sf CLI`);
        
        // Load configuration
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        const { orgs, permissions } = config;
        
        // Create extraction directory
        const extractDir = path.join(__dirname, '../storage/data-extract', extractionId);
        await fs.mkdir(extractDir, { recursive: true });
        
        // Save config to extraction directory
        await fs.writeFile(
            path.join(extractDir, 'config.json'),
            JSON.stringify(config, null, 2)
        );
        
        sendProgress('package_generation', 10, 'Generating package.xml...');
        
        // Create sfdx-project.json (required for sf project commands)
        const projectJson = {
            "packageDirectories": [
                {
                    "path": ".",
                    "default": true
                }
            ],
            "sfdcLoginUrl": "https://login.salesforce.com",
            "sourceApiVersion": "60.0"
        };
        await fs.writeFile(
            path.join(extractDir, 'sfdx-project.json'), 
            JSON.stringify(projectJson, null, 2)
        );
        
        // Discover common elements if needed
        let commonObjects = null;
        let commonApexClasses = null;
        let commonPages = null;
        
        // Check if we need to discover common objects
        if ((config.objectSelection === 'ALL' || config.objectSelection === 'COMMON') && 
            config.selectedPermissionOptions && 
            Object.values(config.selectedPermissionOptions).some(opts => 
                opts.objectPermissions || opts.fieldPermissions)) {
            commonObjects = await discoverCommonObjects(orgs);
            
            // Save common objects info for reference
            const commonObjectsPath = path.join(extractDir, 'common_objects.json');
            await fs.writeFile(commonObjectsPath, JSON.stringify(commonObjects, null, 2));
        }
        
        // Check if we need to discover common Apex classes
        if ((config.apexClassSelection === 'ALL' || config.apexClassSelection === 'COMMON') &&
            config.selectedPermissionOptions &&
            Object.values(config.selectedPermissionOptions).some(opts => opts.apexClasses)) {
            commonApexClasses = await discoverCommonApexClasses(orgs);
            
            // Save common Apex classes info
            const commonApexPath = path.join(extractDir, 'common_apex_classes.json');
            await fs.writeFile(commonApexPath, JSON.stringify(commonApexClasses, null, 2));
        }
        
        // Check if we need to discover common Visualforce pages
        if ((config.pageSelection === 'ALL' || config.pageSelection === 'COMMON') &&
            config.selectedPermissionOptions &&
            Object.values(config.selectedPermissionOptions).some(opts => opts.visualforcePages)) {
            commonPages = await discoverCommonPages(orgs);
            
            // Save common pages info
            const commonPagesPath = path.join(extractDir, 'common_pages.json');
            await fs.writeFile(commonPagesPath, JSON.stringify(commonPages, null, 2));
        }
        
        // Generate package.xml based on configuration
        const packageXml = await generatePackageXml(config, commonObjects, commonApexClasses, commonPages);
        const packagePath = path.join(extractDir, 'package.xml');
        await fs.writeFile(packagePath, packageXml);
        
        // Extract metadata from each org - make separate calls for each metadata type
        const totalOrgs = orgs.length;
        let processedOrgs = 0;
        
        for (const org of orgs) {
            const orgProgress = 20 + (processedOrgs / totalOrgs * 70);
            sendProgress('extraction', orgProgress, `Extracting permissions from ${org}...`);
            
            try {
                // Create org-specific directory
                const orgDir = path.join(extractDir, org);
                await fs.mkdir(orgDir, { recursive: true });
                
                // Create metadata directory structure
                const metadataDir = path.join(orgDir, 'metadata');
                await fs.mkdir(metadataDir, { recursive: true });
                
                // Make separate retrieve calls for each permission type in config
                const metadataTypes = ['Profile', 'PermissionSet', 'PermissionSetGroup', 'MutingPermissionSet'];
                
                for (const metadataType of metadataTypes) {
                    if (permissions[metadataType] && permissions[metadataType].length > 0) {
                        logger.info(`Retrieving ${metadataType} metadata from ${org}...`);
                        sendProgress('extraction', orgProgress, `Retrieving ${metadataType} from ${org}...`);
                        
                        // Generate type-specific package.xml
                        const typeSpecificConfig = {
                            ...config,
                            permissions: {
                                [metadataType]: permissions[metadataType]
                            }
                        };
                        
                        const typePackageXml = await generatePackageXml(typeSpecificConfig, commonObjects, commonApexClasses, commonPages);
                        const typePackagePath = path.join(extractDir, `package-${metadataType}.xml`);
                        await fs.writeFile(typePackagePath, typePackageXml);
                        
                        try {
                            // Retrieve metadata for this specific type
                            const typeMetadataDir = path.join(metadataDir, metadataType);
                            await executeSfdx(cliPath, [
                                'project',
                                'retrieve', 
                                'start',
                                '--manifest', typePackagePath,
                                '--target-org', org,
                                '--target-metadata-dir', typeMetadataDir,
                                '--unzip',
                                '--wait', '30'
                            ], { cwd: extractDir });
                            
                            logger.info(`Successfully retrieved ${metadataType} from ${org}`);
                        } catch (error) {
                            logger.error(`Failed to retrieve ${metadataType} from ${org}:`, error.message);
                            // Continue with other types
                        }
                    }
                }
                
                // Process all retrieved metadata
                const unpackagedDir = path.join(metadataDir);
                await processOrgMetadata(unpackagedDir, org, permissions);
                
                processedOrgs++;
                logger.info(`Successfully extracted all permissions from ${org}`);
                
            } catch (error) {
                logger.error(`Failed to extract from ${org}:`, error.message || error);
                console.error(`Detailed error for ${org}:`, error);
                sendProgress('extraction', orgProgress, `Failed to extract from ${org}: ${error.message}`, error);
                // Continue with other orgs
            }
        }
        
        sendProgress('finalization', 95, 'Finalizing extraction...');
        
        // Create extraction summary
        // Track non-common metadata across orgs
        const nonCommonMetadata = {
            byOrg: {},
            summary: {
                profiles: {},
                permissionSets: {},
                permissionSetGroups: {},
                mutingPermissionSets: {}
            }
        };
        
        // Analyze what metadata exists in each org but not in others
        for (const org of orgs) {
            const orgDir = path.join(extractDir, org);
            const processedPath = path.join(orgDir, 'processed_permissions.json');
            
            try {
                await fs.access(processedPath);
                const processedData = JSON.parse(await fs.readFile(processedPath, 'utf8'));
                const orgMetadata = {
                    profiles: Object.keys(processedData.profiles || {}),
                    permissionSets: Object.keys(processedData.permissionSets || {}),
                    permissionSetGroups: Object.keys(processedData.permissionSetGroups || {}),
                    mutingPermissionSets: Object.keys(processedData.mutingPermissionSets || {})
                };
                
                nonCommonMetadata.byOrg[org] = orgMetadata;
                
                // Track which metadata is unique to this org
                Object.entries(orgMetadata).forEach(([type, items]) => {
                    items.forEach(item => {
                        if (!nonCommonMetadata.summary[type][item]) {
                            nonCommonMetadata.summary[type][item] = [];
                        }
                        nonCommonMetadata.summary[type][item].push(org);
                    });
                });
            } catch (err) {
                // File doesn't exist, skip
            }
        }
        
        // Identify non-common items (exist in some orgs but not all)
        const totalOrgCount = orgs.length;
        const nonCommon = {
            profiles: [],
            permissionSets: [],
            permissionSetGroups: [],
            mutingPermissionSets: []
        };
        
        Object.entries(nonCommonMetadata.summary).forEach(([type, items]) => {
            Object.entries(items).forEach(([itemName, orgList]) => {
                if (orgList.length < totalOrgCount) {
                    nonCommon[type].push({
                        name: itemName,
                        existsIn: orgList,
                        missingFrom: orgs.filter(o => !orgList.includes(o))
                    });
                }
            });
        });
        
        // Save non-common metadata report
        await fs.writeFile(
            path.join(extractDir, 'non_common_metadata.json'),
            JSON.stringify(nonCommon, null, 2)
        );
        
        const summary = {
            extractionId,
            timestamp: new Date().toISOString(),
            orgs: orgs,
            processedOrgs: processedOrgs,
            status: processedOrgs === totalOrgs ? 'completed' : 'partial',
            config: config,
            commonObjects: commonObjects ? {
                total: commonObjects.all.length,
                standard: commonObjects.standard.length,
                custom: commonObjects.custom.length
            } : null,
            nonCommonMetadata: {
                profiles: nonCommon.profiles.length,
                permissionSets: nonCommon.permissionSets.length,
                permissionSetGroups: nonCommon.permissionSetGroups.length,
                mutingPermissionSets: nonCommon.mutingPermissionSets.length
            }
        };
        
        await fs.writeFile(
            path.join(extractDir, 'extraction_summary.json'),
            JSON.stringify(summary, null, 2)
        );
        
        sendProgress('completed', 100, 'Extraction completed successfully');
        logger.info('Permissions extraction completed');
        
        process.exit(0);
        
    } catch (error) {
        logger.error('Extraction failed:', error.message || error);
        console.error('Detailed extraction error:', error);
        sendProgress('failed', 0, error.message || 'Unknown error', error);
        process.exit(1);
    }
}

// Discover common objects across all orgs
async function discoverCommonObjects(orgs) {
    const { getInstance: getSFDXRunner } = require('../../../shared/utils/sfdxRunner');
    const sfdxRunner = getSFDXRunner();
    
    logger.info('Discovering common objects across orgs...');
    const orgObjects = {};
    const allObjects = new Set();
    
    // Get objects from each org
    for (const org of orgs) {
        try {
            const objects = await sfdxRunner.getObjects(org);
            orgObjects[org] = new Set(objects.map(obj => obj.name));
            objects.forEach(obj => allObjects.add(obj.name));
            logger.info(`Found ${objects.length} objects in ${org}`);
        } catch (error) {
            logger.error(`Failed to get objects from ${org}:`, error.message);
            orgObjects[org] = new Set();
        }
    }
    
    // Find common objects (present in all orgs)
    const commonObjects = Array.from(allObjects).filter(objName => 
        orgs.every(org => orgObjects[org].has(objName))
    );
    
    // Separate standard and custom objects
    const standardObjects = commonObjects.filter(name => !name.endsWith('__c'));
    const customObjects = commonObjects.filter(name => name.endsWith('__c'));
    
    logger.info(`Found ${commonObjects.length} common objects (${standardObjects.length} standard, ${customObjects.length} custom)`);
    
    return {
        all: commonObjects,
        standard: standardObjects,
        custom: customObjects,
        byOrg: orgObjects
    };
}

// Discover common Apex classes across all orgs
async function discoverCommonApexClasses(orgs) {
    const { getInstance: getSFDXRunner } = require('../../../shared/utils/sfdxRunner');
    const sfdxRunner = getSFDXRunner();
    
    logger.info('Discovering common Apex classes across orgs...');
    const orgClasses = {};
    const allClasses = new Set();
    
    for (const org of orgs) {
        try {
            const query = "SELECT Name FROM ApexClass WHERE NamespacePrefix = null ORDER BY Name";
            const result = await sfdxRunner.query(query, org);
            const classes = result.records.map(r => r.Name);
            orgClasses[org] = new Set(classes);
            classes.forEach(cls => allClasses.add(cls));
            logger.info(`Found ${classes.length} Apex classes in ${org}`);
        } catch (error) {
            logger.error(`Failed to get Apex classes from ${org}:`, error.message);
            orgClasses[org] = new Set();
        }
    }
    
    // Find common classes
    const commonClasses = Array.from(allClasses).filter(className => 
        orgs.every(org => orgClasses[org].has(className))
    );
    
    logger.info(`Found ${commonClasses.length} common Apex classes`);
    
    return {
        all: commonClasses,
        byOrg: orgClasses
    };
}

// Discover common Visualforce pages across all orgs
async function discoverCommonPages(orgs) {
    const { getInstance: getSFDXRunner } = require('../../../shared/utils/sfdxRunner');
    const sfdxRunner = getSFDXRunner();
    
    logger.info('Discovering common Visualforce pages across orgs...');
    const orgPages = {};
    const allPages = new Set();
    
    for (const org of orgs) {
        try {
            const query = "SELECT Name FROM ApexPage WHERE NamespacePrefix = null ORDER BY Name";
            const result = await sfdxRunner.query(query, org);
            const pages = result.records.map(r => r.Name);
            orgPages[org] = new Set(pages);
            pages.forEach(page => allPages.add(page));
            logger.info(`Found ${pages.length} Visualforce pages in ${org}`);
        } catch (error) {
            logger.error(`Failed to get Visualforce pages from ${org}:`, error.message);
            orgPages[org] = new Set();
        }
    }
    
    // Find common pages
    const commonPages = Array.from(allPages).filter(pageName => 
        orgs.every(org => orgPages[org].has(pageName))
    );
    
    logger.info(`Found ${commonPages.length} common Visualforce pages`);
    
    return {
        all: commonPages,
        byOrg: orgPages
    };
}

// Generate package.xml content based on user selections
async function generatePackageXml(config, commonObjects = null, commonApexClasses = null, commonPages = null) {
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
    
    // Add specific objects if field/object permissions are selected
    if (config.selectedPermissionOptions) {
        Object.entries(config.selectedPermissionOptions).forEach(([permType, options]) => {
            if (options.objectPermissions || options.fieldPermissions) {
                if (!metadataByType.CustomObject) metadataByType.CustomObject = new Set();
                
                // Add objects based on user selection
                if (config.objectSelection === 'ALL') {
                    if (commonObjects && commonObjects.all.length > 0) {
                        // Use discovered common objects instead of wildcard
                        commonObjects.all.forEach(obj => {
                            metadataByType.CustomObject.add(obj);
                        });
                    } else {
                        // Fallback to wildcard if no common objects discovered
                        metadataByType.CustomObject.add('*');
                    }
                } else if (config.objectSelection === 'COMMON') {
                    // For common objects only, use the discovered common objects
                    if (commonObjects && commonObjects.common) {
                        commonObjects.common.forEach(obj => {
                            metadataByType.CustomObject.add(obj);
                        });
                    } else if (commonObjects && commonObjects.all) {
                        // Fallback to all common objects if common array doesn't exist
                        commonObjects.all.forEach(obj => {
                            metadataByType.CustomObject.add(obj);
                        });
                    } else {
                        logger.warn('No common objects found across all orgs');
                    }
                } else if (config.specificObjects && config.specificObjects.length > 0) {
                    config.specificObjects.forEach(obj => {
                        metadataByType.CustomObject.add(obj);
                    });
                }
            }
            
            // Add Apex classes if selected
            if (options.apexClasses) {
                if (!metadataByType.ApexClass) metadataByType.ApexClass = new Set();
                if (config.apexClassSelection === 'ALL') {
                    metadataByType.ApexClass.add('*');
                } else if (config.apexClassSelection === 'COMMON') {
                    // For common classes only, use the discovered common classes
                    if (commonApexClasses && commonApexClasses.all && commonApexClasses.all.length > 0) {
                        commonApexClasses.all.forEach(cls => {
                            metadataByType.ApexClass.add(cls);
                        });
                    } else {
                        logger.warn('No common Apex classes found across all orgs');
                    }
                } else if (config.specificApexClasses) {
                    config.specificApexClasses.forEach(cls => metadataByType.ApexClass.add(cls));
                }
            }
            
            // Add VF pages if selected
            if (options.visualforcePages) {
                if (!metadataByType.ApexPage) metadataByType.ApexPage = new Set();
                if (config.pageSelection === 'ALL') {
                    metadataByType.ApexPage.add('*');
                } else if (config.pageSelection === 'COMMON') {
                    // For common pages only, use the discovered common pages
                    if (commonPages && commonPages.all && commonPages.all.length > 0) {
                        commonPages.all.forEach(page => {
                            metadataByType.ApexPage.add(page);
                        });
                    } else {
                        logger.warn('No common Visualforce pages found across all orgs');
                    }
                } else if (config.specificPages) {
                    config.specificPages.forEach(page => metadataByType.ApexPage.add(page));
                }
            }
            
            // Add record types if needed
            if (options.recordTypeVisibilities && config.recordTypes) {
                if (!metadataByType.RecordType) metadataByType.RecordType = new Set();
                config.recordTypes.forEach(rt => metadataByType.RecordType.add(rt));
            }
            
            // Add custom permissions if selected
            if (options.customPermissions && config.customPermissions) {
                if (!metadataByType.CustomPermission) metadataByType.CustomPermission = new Set();
                config.customPermissions.forEach(cp => metadataByType.CustomPermission.add(cp));
            }
            
            // Add tabs if selected
            if (options.tabSettings && config.tabs) {
                if (!metadataByType.CustomTab) metadataByType.CustomTab = new Set();
                config.tabs.forEach(tab => metadataByType.CustomTab.add(tab));
            }
            
            // Add apps if selected
            if (options.applicationVisibilities && config.applications) {
                if (!metadataByType.CustomApplication) metadataByType.CustomApplication = new Set();
                config.applications.forEach(app => metadataByType.CustomApplication.add(app));
            }
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

// Process retrieved metadata for an org
async function processOrgMetadata(orgDir, orgAlias, permissions) {
    const processedData = {
        org: orgAlias,
        profiles: {},
        permissionSets: {},
        permissionSetGroups: {},
        mutingPermissionSets: {},
        objectPermissions: {},
        apexClassAccess: {},
        pageAccess: {},
        systemPermissions: {},
        userPermissions: {}
    };

    // Process profiles
    if (permissions.Profile && permissions.Profile.length > 0) {
        // Check both old structure and new structure
        const possibleDirs = [
            path.join(orgDir, 'Profile', 'unpackaged', 'unpackaged', 'profiles'),
            path.join(orgDir, 'unpackaged', 'unpackaged', 'profiles'),
            path.join(orgDir, 'profiles')
        ];
        
        for (const profilesDir of possibleDirs) {
            try {
                if (await fs.pathExists(profilesDir)) {
                    const profileFiles = await fs.readdir(profilesDir);
                    for (const file of profileFiles) {
                        if (file.endsWith('.profile-meta.xml') || file.endsWith('.profile')) {
                            const profileName = file.replace('.profile-meta.xml', '').replace('.profile', '');
                            const content = await fs.readFile(path.join(profilesDir, file), 'utf8');
                            processedData.profiles[profileName] = parseProfileMetadata(content);
                        }
                    }
                    break; // Found profiles, no need to check other dirs
                }
            } catch (error) {
                // Continue to next possible directory
            }
        }
        
        if (Object.keys(processedData.profiles).length === 0) {
            logger.warn(`No profiles found for ${orgAlias}`);
        }
    }

    // Process permission sets
    if (permissions.PermissionSet && permissions.PermissionSet.length > 0) {
        const possibleDirs = [
            path.join(orgDir, 'PermissionSet', 'unpackaged', 'unpackaged', 'permissionsets'),
            path.join(orgDir, 'unpackaged', 'unpackaged', 'permissionsets'),
            path.join(orgDir, 'permissionsets')
        ];
        
        for (const permSetsDir of possibleDirs) {
            try {
                if (await fs.pathExists(permSetsDir)) {
                    const permSetFiles = await fs.readdir(permSetsDir);
                    for (const file of permSetFiles) {
                        if (file.endsWith('.permissionset-meta.xml') || file.endsWith('.permissionset')) {
                            const permSetName = file.replace('.permissionset-meta.xml', '').replace('.permissionset', '');
                            const content = await fs.readFile(path.join(permSetsDir, file), 'utf8');
                            processedData.permissionSets[permSetName] = parsePermissionSetMetadata(content);
                        }
                    }
                    break;
                }
            } catch (error) {
                // Continue to next possible directory
            }
        }
        
        if (Object.keys(processedData.permissionSets).length === 0) {
            logger.warn(`No permission sets found for ${orgAlias}`);
        }
    }
    
    // Process permission set groups
    if (permissions.PermissionSetGroup && permissions.PermissionSetGroup.length > 0) {
        const possibleDirs = [
            path.join(orgDir, 'PermissionSetGroup', 'unpackaged', 'unpackaged', 'permissionsetgroups'),
            path.join(orgDir, 'unpackaged', 'unpackaged', 'permissionsetgroups'),
            path.join(orgDir, 'permissionsetgroups')
        ];
        
        for (const psgDir of possibleDirs) {
            try {
                if (await fs.pathExists(psgDir)) {
                    const psgFiles = await fs.readdir(psgDir);
                    for (const file of psgFiles) {
                        if (file.endsWith('.permissionsetgroup-meta.xml') || file.endsWith('.permissionsetgroup')) {
                            const psgName = file.replace('.permissionsetgroup-meta.xml', '').replace('.permissionsetgroup', '');
                            const content = await fs.readFile(path.join(psgDir, file), 'utf8');
                            processedData.permissionSetGroups[psgName] = parsePermissionSetGroupMetadata(content);
                        }
                    }
                    break;
                }
            } catch (error) {
                // Continue to next possible directory
            }
        }
        
        if (Object.keys(processedData.permissionSetGroups).length === 0) {
            logger.warn(`No permission set groups found for ${orgAlias}`);
        }
    }
    
    // Process muting permission sets
    if (permissions.MutingPermissionSet && permissions.MutingPermissionSet.length > 0) {
        const possibleDirs = [
            path.join(orgDir, 'MutingPermissionSet', 'unpackaged', 'unpackaged', 'mutingpermissionsets'),
            path.join(orgDir, 'unpackaged', 'unpackaged', 'mutingpermissionsets'),
            path.join(orgDir, 'mutingpermissionsets')
        ];
        
        for (const mpsDir of possibleDirs) {
            try {
                if (await fs.pathExists(mpsDir)) {
                    const mpsFiles = await fs.readdir(mpsDir);
                    for (const file of mpsFiles) {
                        if (file.endsWith('.mutingpermissionset-meta.xml') || file.endsWith('.mutingpermissionset')) {
                            const mpsName = file.replace('.mutingpermissionset-meta.xml', '').replace('.mutingpermissionset', '');
                            const content = await fs.readFile(path.join(mpsDir, file), 'utf8');
                            processedData.mutingPermissionSets[mpsName] = parseMutingPermissionSetMetadata(content);
                        }
                    }
                    break;
                }
            } catch (error) {
                // Continue to next possible directory
            }
        }
        
        if (Object.keys(processedData.mutingPermissionSets).length === 0) {
            logger.warn(`No muting permission sets found for ${orgAlias}`);
        }
    }

    // Save processed data to the org directory (not the unpackaged directory)
    const orgBaseDir = orgDir.includes('unpackaged') 
        ? path.resolve(orgDir, '../../..') 
        : orgDir;
    const outputPath = path.join(orgBaseDir, 'processed_permissions.json');
    await fs.writeFile(outputPath, JSON.stringify(processedData, null, 2));
    
    return processedData;
}

// Parse profile metadata (simplified - you may need to use xml2js for proper parsing)
function parseProfileMetadata(xmlContent) {
    const profile = {
        objectPermissions: [],
        fieldPermissions: [],
        apexClassAccesses: [],
        pageAccesses: [],
        userPermissions: []
    };

    // Extract object permissions
    const objPermMatches = xmlContent.match(/<objectPermissions>[\s\S]*?<\/objectPermissions>/g) || [];
    profile.objectPermissions = objPermMatches.map(match => {
        const obj = match.match(/<object>(.*?)<\/object>/)?.[1];
        const allowCreate = match.includes('<allowCreate>true</allowCreate>');
        const allowRead = match.includes('<allowRead>true</allowRead>');
        const allowEdit = match.includes('<allowEdit>true</allowEdit>');
        const allowDelete = match.includes('<allowDelete>true</allowDelete>');
        const modifyAllRecords = match.includes('<modifyAllRecords>true</modifyAllRecords>');
        const viewAllRecords = match.includes('<viewAllRecords>true</viewAllRecords>');
        
        return {
            object: obj,
            allowCreate,
            allowRead,
            allowEdit,
            allowDelete,
            modifyAllRecords,
            viewAllRecords
        };
    });

    // Extract field permissions
    const fieldPermMatches = xmlContent.match(/<fieldPermissions>[\s\S]*?<\/fieldPermissions>/g) || [];
    profile.fieldPermissions = fieldPermMatches.map(match => {
        const field = match.match(/<field>(.*?)<\/field>/)?.[1];
        const editable = match.includes('<editable>true</editable>');
        const readable = match.includes('<readable>true</readable>');
        
        return { field, editable, readable };
    });
    
    // Extract user permissions
    const userPermMatches = xmlContent.match(/<userPermissions>[\s\S]*?<\/userPermissions>/g) || [];
    profile.userPermissions = userPermMatches.map(match => {
        const name = match.match(/<name>(.*?)<\/name>/)?.[1];
        const enabled = match.includes('<enabled>true</enabled>');
        
        return { name, enabled };
    });
    
    // Extract apex class access
    const apexMatches = xmlContent.match(/<classAccesses>[\s\S]*?<\/classAccesses>/g) || [];
    profile.apexClassAccesses = apexMatches.map(match => {
        const apexClass = match.match(/<apexClass>(.*?)<\/apexClass>/)?.[1];
        const enabled = match.includes('<enabled>true</enabled>');
        
        return { apexClass, enabled };
    });
    
    // Extract page access
    const pageMatches = xmlContent.match(/<pageAccesses>[\s\S]*?<\/pageAccesses>/g) || [];
    profile.pageAccesses = pageMatches.map(match => {
        const apexPage = match.match(/<apexPage>(.*?)<\/apexPage>/)?.[1];
        const enabled = match.includes('<enabled>true</enabled>');
        
        return { apexPage, enabled };
    });

    return profile;
}

// Parse permission set metadata (simplified)
function parsePermissionSetMetadata(xmlContent) {
    // Similar to parseProfileMetadata but for permission sets
    return parseProfileMetadata(xmlContent);
}

function parsePermissionSetGroupMetadata(xmlContent) {
    // Parse PSG metadata - mainly contains references to permission sets
    const metadata = {
        permissionSets: [],
        mutingPermissionSets: [],
        description: ''
    };
    
    // Extract permission set references
    const psMatches = xmlContent.match(/<permissionSets>([^<]+)<\/permissionSets>/g);
    if (psMatches) {
        metadata.permissionSets = psMatches.map(match => 
            match.replace(/<\/?permissionSets>/g, '')
        );
    }
    
    // Extract muting permission set references
    const mpsMatches = xmlContent.match(/<mutingPermissionSets>([^<]+)<\/mutingPermissionSets>/g);
    if (mpsMatches) {
        metadata.mutingPermissionSets = mpsMatches.map(match => 
            match.replace(/<\/?mutingPermissionSets>/g, '')
        );
    }
    
    // Extract description
    const descMatch = xmlContent.match(/<description>([^<]*)<\/description>/);
    if (descMatch) {
        metadata.description = descMatch[1];
    }
    
    return metadata;
}

function parseMutingPermissionSetMetadata(xmlContent) {
    // Muting permission sets remove permissions
    // Parse similar to regular permission sets but note they remove rather than grant
    const metadata = parseProfileMetadata(xmlContent);
    metadata.isMuting = true; // Flag to indicate this removes permissions
    return metadata;
}

// Start extraction
extractPermissions().catch(error => {
    logger.error('Fatal error:', error);
    process.exit(1);
});