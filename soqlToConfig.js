// SOQL to Data Comparison Config Converter
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

// Field types that are typically used as foreign keys
const FOREIGN_KEY_PATTERNS = [
    'Id',
    '__c', // Custom fields often used as external IDs
    'Name', // Standard name field
    'External_ID__c',
    'ExternalId__c',
    'External_Id__c'
];

function parseSoqlQuery(soql) {
    // Enhanced SOQL parser with better regex patterns
    // Handle SELECT with optional whitespace/newlines
    const selectMatch = soql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    const fromMatch = soql.match(/FROM\s+([\w]+)(?:[\s\n\r]*WHERE|[\s\n\r]*$)/i);
    
    // Extract WHERE clause until next SELECT or blank line
    let whereMatch = null;
    const fromIndex = soql.search(/FROM\s+\w+/i);
    if (fromIndex !== -1) {
        const afterFrom = soql.substring(fromIndex);
        const whereStartMatch = afterFrom.match(/WHERE\s+/i);
        if (whereStartMatch) {
            const whereStart = fromIndex + whereStartMatch.index + whereStartMatch[0].length;
            const restOfQuery = soql.substring(whereStart);
            
            // Find end: either next SELECT or blank line (\n\n)
            const nextSelectIndex = restOfQuery.search(/SELECT\s+/i);
            const blankLineIndex = restOfQuery.search(/\n\s*\n/);
            
            let whereEnd = restOfQuery.length;
            if (nextSelectIndex !== -1) {
                whereEnd = Math.min(whereEnd, nextSelectIndex);
            }
            if (blankLineIndex !== -1) {
                whereEnd = Math.min(whereEnd, blankLineIndex);
            }
            
            const whereClause = restOfQuery.substring(0, whereEnd).trim();
            if (whereClause) {
                whereMatch = [null, whereClause];
            }
        }
    }
    
    if (!selectMatch || !fromMatch) {
        throw new Error('Invalid SOQL query format');
    }
    
    // Parse fields with enhanced cleaning
    const fieldsStr = selectMatch[1];
    const fields = parseFieldsFromSelect(fieldsStr);
    
    // Parse object (clean any \n or \r)
    const objectName = fromMatch[1].replace(/[\n\r]/g, '');
    
    // Parse WHERE clause if exists
    let filter = null;
    if (whereMatch && whereMatch[1]) {
        filter = parseWhereClause(whereMatch[1]);
    }
    
    return { fields, objectName, filter };
}

function parseFieldsFromSelect(fieldsStr) {
    // Split by comma and process each field
    return fieldsStr.split(',').map(field => {
        // Remove whitespace, newlines, carriage returns
        let cleaned = field.trim().replace(/[\n\r]/g, '');
        
        // Handle field aliases (fieldName Ext or fieldName AS Ext)
        const aliasMatch = cleaned.match(/^(\S+)\s+(?:AS\s+)?(\w+)$/i);
        if (aliasMatch) {
            const [, fieldName, alias] = aliasMatch;
            // Check if alias is 'Ext' (foreign key indicator)
            if (alias.toLowerCase() === 'ext') {
                // Mark this field as potential foreign key and include it
                cleaned = fieldName + ' EXT_ALIAS'; // Special marker
            } else {
                // Regular alias, just use field name
                cleaned = fieldName;
            }
        }
        
        // Convert lookup fields from __r to __c notation
        if (cleaned.includes('__r.')) {
            cleaned = cleaned.replace(/__r\./g, '__c.');
        }
        
        // Handle standard relationship fields
        if (cleaned.includes('.') && !cleaned.includes('__')) {
            const [relationship, fieldName] = cleaned.split('.');
            // Convert standard relationships
            if (relationship === 'Owner') cleaned = `OwnerId.${fieldName}`;
            else if (relationship === 'CreatedBy') cleaned = `CreatedById.${fieldName}`;
            else if (relationship === 'LastModifiedBy') cleaned = `LastModifiedById.${fieldName}`;
            else cleaned = `${relationship}Id.${fieldName}`; // Default: add Id suffix
        }
        
        return cleaned;
    }).filter(f => f);
}

function parseWhereClause(whereStr) {
    // Enhanced WHERE clause parser with better cleaning
    // Clean newlines and carriage returns from WHERE clause
    const cleanedWhere = whereStr.replace(/[\n\r]/g, ' ').trim();
    
    // For Sub Menu mode, we store the raw WHERE clause as customFilter
    // This matches the sample config format
    return cleanedWhere;
}

function identifyForeignKey(fields) {
    // Enhanced foreign key identification with EXT_ALIAS support
    
    // First priority: Field marked with EXT_ALIAS (from 'Ext' alias)
    const extField = fields.find(f => f.includes(' EXT_ALIAS'));
    if (extField) {
        return extField.replace(' EXT_ALIAS', ''); // Remove marker
    }
    
    // Second priority: Id field
    if (fields.includes('Id')) {
        return 'Id';
    }
    
    // Third priority: Fields ending with __c that contain 'Id' or 'External'
    const customIdFields = fields.filter(f => 
        f.endsWith('__c') && 
        (f.toLowerCase().includes('id') || f.toLowerCase().includes('external'))
    );
    if (customIdFields.length > 0) {
        return customIdFields[0];
    }
    
    // Fourth priority: Name field
    if (fields.includes('Name')) {
        return 'Name';
    }
    
    // Fifth priority: Any field ending with __c
    const customFields = fields.filter(f => f.endsWith('__c'));
    if (customFields.length > 0) {
        return customFields[0];
    }
    
    // Default to first field if no obvious foreign key
    return fields[0];
}

function generateConfig(soqlQueries) {
    const objects = {};
    let totalFields = 0;
    
    for (const soql of soqlQueries) {
        try {
            const { fields, objectName, filter } = parseSoqlQuery(soql);
            
            // Clean EXT_ALIAS markers from fields
            const cleanedFields = fields.map(f => f.replace(' EXT_ALIAS', ''));
            const foreignKey = identifyForeignKey(fields);
            
            // Create org filters (shared mode - same filter for both orgs)
            const orgFilters = {};
            if (filter) {
                orgFilters['username1'] = { customFilter: filter };
                orgFilters['username2'] = { customFilter: filter };
            }
            
            objects[objectName] = {
                fields: cleanedFields,
                foreignKey: foreignKey,
                orgFilters: orgFilters
            };
            
            totalFields += cleanedFields.length;
            
        } catch (error) {
            console.error(`Error parsing SOQL: ${error.message}`);
        }
    }
    
    // Generate config in same format as Manual Mode and sample config
    return {
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        orgs: ['username1', 'username2'], // Stub orgs as specified
        objects: objects,
        fetchMethod: 'graphql',
        metadata: {
            totalOrgs: 2, // Hardcoded for Sub Menu mode
            totalObjects: Object.keys(objects).length,
            totalFields: totalFields,
            configGenerator: 'enhanced',
            uiVersion: 'v1-ux-v2-styling',
            fetchMethod: 'graphql'
        }
    };
}

// VS Code command handler
async function soqlToConfigCommand() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }
    
    const document = editor.document;
    const text = document.getText();
    
    // Extract SOQL queries from the text using enhanced regex
    // Handle multiline queries, whitespace, and different terminators
    const soqlPattern = /SELECT\s+[\s\S]+?\s+FROM\s+\w+(?:\s+WHERE[\s\S]+?)?(?=\s*(?:SELECT|\n\s*\n|$))/gi;
    const queries = text.match(soqlPattern);
    
    if (!queries || queries.length === 0) {
        vscode.window.showErrorMessage('No SOQL queries found in the current file');
        return;
    }
    
    // Generate config
    const config = generateConfig(queries);
    
    // Show preview and ask for save location
    const saveOptions = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(
            path.dirname(document.uri.fsPath), 
            'comparison-config.json'
        )),
        filters: {
            'JSON files': ['json'],
            'All files': ['*']
        }
    });
    
    if (saveOptions) {
        try {
            fs.writeFileSync(saveOptions.fsPath, JSON.stringify(config, null, 2));
            
            // Open the generated config
            const doc = await vscode.workspace.openTextDocument(saveOptions.fsPath);
            await vscode.window.showTextDocument(doc);
            
            vscode.window.showInformationMessage(
                `Generated comparison config with ${Object.keys(config.objects).length} object(s). ` +
                `Please review and update org usernames, foreign keys, and fields as needed.`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to save config: ${error.message}`);
        }
    }
}

module.exports = {
    parseSoqlQuery,
    generateConfig,
    soqlToConfigCommand
};