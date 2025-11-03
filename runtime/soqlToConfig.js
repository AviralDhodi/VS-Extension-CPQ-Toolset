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
    // Basic SOQL parser - extracts SELECT fields, FROM object, and WHERE clause
    const selectMatch = soql.match(/SELECT\s+([\s\S]+?)\s+FROM\s+/i);
    const fromMatch = soql.match(/FROM\s+(\w+)(?:\s+WHERE\s+|$)/i);
    const whereMatch = soql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i);
    
    if (!selectMatch || !fromMatch) {
        throw new Error('Invalid SOQL query format');
    }
    
    // Parse fields
    const fieldsStr = selectMatch[1];
    const fields = fieldsStr.split(',').map(f => f.trim()).filter(f => f);
    
    // Parse object
    const objectName = fromMatch[1];
    
    // Parse WHERE clause if exists
    let filter = null;
    if (whereMatch) {
        filter = parseWhereClause(whereMatch[1]);
    }
    
    return { fields, objectName, filter };
}

function parseWhereClause(whereStr) {
    // Simple WHERE clause parser - handles basic conditions
    // This is a simplified version - real implementation would need more robust parsing
    const conditions = [];
    
    // Handle simple equality conditions
    const equalityPattern = /(\w+)\s*=\s*'([^']+)'/g;
    let match;
    while ((match = equalityPattern.exec(whereStr)) !== null) {
        conditions.push({
            field: match[1],
            operator: 'eq',
            value: match[2]
        });
    }
    
    // Handle IN conditions
    const inPattern = /(\w+)\s+IN\s*\(([^)]+)\)/gi;
    while ((match = inPattern.exec(whereStr)) !== null) {
        const values = match[2].split(',').map(v => v.trim().replace(/'/g, ''));
        conditions.push({
            field: match[1],
            operator: 'in',
            value: values
        });
    }
    
    // Handle LIKE conditions
    const likePattern = /(\w+)\s+LIKE\s+'([^']+)'/gi;
    while ((match = likePattern.exec(whereStr)) !== null) {
        conditions.push({
            field: match[1],
            operator: 'like',
            value: match[2]
        });
    }
    
    return conditions.length > 0 ? conditions : null;
}

function identifyForeignKey(fields) {
    // Try to identify the most likely foreign key field
    
    // First priority: Id field
    if (fields.includes('Id')) {
        return 'Id';
    }
    
    // Second priority: Fields ending with __c that contain 'Id' or 'External'
    const customIdFields = fields.filter(f => 
        f.endsWith('__c') && 
        (f.toLowerCase().includes('id') || f.toLowerCase().includes('external'))
    );
    if (customIdFields.length > 0) {
        return customIdFields[0];
    }
    
    // Third priority: Name field
    if (fields.includes('Name')) {
        return 'Name';
    }
    
    // Fourth priority: Any field ending with __c
    const customFields = fields.filter(f => f.endsWith('__c'));
    if (customFields.length > 0) {
        return customFields[0];
    }
    
    // Default to first field if no obvious foreign key
    return fields[0];
}

function generateConfig(soqlQueries) {
    const configs = [];
    
    for (const soql of soqlQueries) {
        try {
            const { fields, objectName, filter } = parseSoqlQuery(soql);
            const foreignKey = identifyForeignKey(fields);
            
            const config = {
                object: objectName,
                foreignKey: foreignKey,
                fields: fields,
                compareFields: fields.filter(f => f !== foreignKey), // All fields except FK
                includeAllFields: false
            };
            
            // Add filter if present
            if (filter) {
                config.filter = filter;
            }
            
            configs.push(config);
        } catch (error) {
            console.error(`Error parsing SOQL: ${error.message}`);
        }
    }
    
    return {
        version: "3.0",
        name: "Generated from SOQL",
        description: "Auto-generated comparison config from SOQL queries",
        orgs: ["Org_1", "Org_2"], // Default org names
        comparisons: configs
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
    
    // Extract SOQL queries from the text
    // Look for patterns like SELECT ... FROM ...
    const soqlPattern = /SELECT\s+[\s\S]+?\s+FROM\s+\w+(?:\s+WHERE[\s\S]+?)?(?=\s*(?:SELECT|$))/gi;
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
                `Generated comparison config with ${config.comparisons.length} object(s). ` +
                `Please review and update org names, foreign keys, and fields as needed.`
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