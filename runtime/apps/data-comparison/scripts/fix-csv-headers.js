#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Fix CSV headers to use actual org usernames instead of Org_1, Org_2
 */

function fixCSVHeaders(csvPath, configPath) {
    try {
        // Read the config file to get org mappings
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        
        // Build mapping from alias to username
        const aliasToUsername = {};
        if (config.orgs && Array.isArray(config.orgs)) {
            config.orgs.forEach(org => {
                if (org.alias && org.username) {
                    aliasToUsername[org.alias] = org.username;
                }
            });
        }
        
        // Read the CSV file
        let csvContent = fs.readFileSync(csvPath, 'utf8');
        
        // Replace column headers
        const lines = csvContent.split('\n');
        if (lines.length > 0) {
            let headerLine = lines[0];
            
            // Replace Org_<alias> with actual username
            Object.entries(aliasToUsername).forEach(([alias, username]) => {
                const pattern = `Org_${alias}`;
                if (headerLine.includes(pattern)) {
                    headerLine = headerLine.replace(pattern, username);
                    console.log(`Replaced ${pattern} with ${username}`);
                }
            });
            
            // Also handle generic Org_1, Org_2 pattern if orgs are ordered
            const orgs = config.orgs || [];
            for (let i = 0; i < orgs.length; i++) {
                const genericPattern = `Org_${i + 1}`;
                if (headerLine.includes(genericPattern) && orgs[i].username) {
                    headerLine = headerLine.replace(genericPattern, orgs[i].username);
                    console.log(`Replaced ${genericPattern} with ${orgs[i].username}`);
                }
            }
            
            // Reconstruct CSV with fixed headers
            lines[0] = headerLine;
            csvContent = lines.join('\n');
            
            // Write back to the same file
            fs.writeFileSync(csvPath, csvContent);
            console.log(`Successfully updated CSV headers in ${csvPath}`);
        }
        
    } catch (error) {
        console.error('Error fixing CSV headers:', error.message);
        throw error;
    }
}

// If called directly from command line
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: fix-csv-headers.js <csv-path> <config-path>');
        process.exit(1);
    }
    
    const [csvPath, configPath] = args;
    fixCSVHeaders(csvPath, configPath);
}

module.exports = { fixCSVHeaders };