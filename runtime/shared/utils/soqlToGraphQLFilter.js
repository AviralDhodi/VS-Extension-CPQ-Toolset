// CPQ Toolset v3 - SOQL to GraphQL Filter Converter V2
// Enhanced version with proper nested condition parsing

class SOQLToGraphQLFilterConverter {
    constructor() {
        // Map SOQL operators to GraphQL operators
        this.operatorMap = {
            '=': 'eq',
            '!=': 'ne',
            '<>': 'ne',
            '>': 'gt',
            '>=': 'gte',
            '<': 'lt',
            '<=': 'lte',
            'LIKE': 'like',
            'IN': 'in',
            'NOT IN': 'nin',
            'INCLUDES': 'includes',
            'EXCLUDES': 'excludes'
        };

        // Date/DateTime functions
        this.dateFunctions = ['TODAY', 'YESTERDAY', 'TOMORROW', 'LAST_N_DAYS', 'NEXT_N_DAYS', 
                             'LAST_WEEK', 'THIS_WEEK', 'NEXT_WEEK', 'LAST_MONTH', 'THIS_MONTH', 
                             'NEXT_MONTH', 'LAST_QUARTER', 'THIS_QUARTER', 'NEXT_QUARTER', 
                             'LAST_YEAR', 'THIS_YEAR', 'NEXT_YEAR'];
        
        this.simplifiedFilters = [];
    }

    /**
     * Convert SOQL WHERE clause to GraphQL filter
     * @param {string} soqlWhere - SOQL WHERE clause
     * @param {string} objectName - Salesforce object name
     * @returns {object} GraphQL filter object
     */
    convertSOQLToGraphQL(soqlWhere, objectName) {
        if (!soqlWhere || soqlWhere.trim() === '') {
            return null;
        }

        try {
            // Remove WHERE keyword if present
            soqlWhere = soqlWhere.replace(/^WHERE\s+/i, '').trim();
            
            // Parse the expression
            const parsed = this.parseExpression(soqlWhere);
            
            // Convert to GraphQL filter
            return this.convertToGraphQL(parsed);
        } catch (error) {
            console.error('Error converting SOQL to GraphQL:', error);
            throw new Error(`Failed to convert SOQL filter: ${error.message}`);
        }
    }

    /**
     * Parse a SOQL expression handling nested parentheses and boolean operators
     * @param {string} expr - SOQL expression
     * @returns {object} Parsed expression tree
     */
    parseExpression(expr) {
        expr = expr.trim();
        
        // Handle parentheses - find matching pairs
        if (expr.startsWith('(')) {
            const matchingParen = this.findMatchingParen(expr, 0);
            if (matchingParen === expr.length - 1) {
                // Entire expression is wrapped in parentheses
                return this.parseExpression(expr.slice(1, -1));
            }
        }
        
        // Parse OR expressions (lowest precedence)
        const orParts = this.splitByOperator(expr, 'OR');
        if (orParts.length > 1) {
            return {
                type: 'OR',
                conditions: orParts.map(part => this.parseExpression(part))
            };
        }
        
        // Parse AND expressions
        const andParts = this.splitByOperator(expr, 'AND');
        if (andParts.length > 1) {
            return {
                type: 'AND',
                conditions: andParts.map(part => this.parseExpression(part))
            };
        }
        
        // Must be a simple condition
        return {
            type: 'CONDITION',
            value: this.parseSimpleCondition(expr)
        };
    }

    /**
     * Split expression by operator, respecting parentheses
     * @param {string} expr - Expression to split
     * @param {string} operator - Operator to split by (AND/OR)
     * @returns {array} Array of expression parts
     */
    splitByOperator(expr, operator) {
        const parts = [];
        let current = '';
        let depth = 0;
        let inString = false;
        let stringChar = null;
        
        const regex = new RegExp(`\\s+${operator}\\s+`, 'i');
        
        for (let i = 0; i < expr.length; i++) {
            const char = expr[i];
            
            // Handle string literals
            if ((char === "'" || char === '"') && (i === 0 || expr[i-1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = null;
                }
            }
            
            // Track parentheses depth when not in string
            if (!inString) {
                if (char === '(') depth++;
                else if (char === ')') depth--;
            }
            
            // Check for operator at depth 0
            if (depth === 0 && !inString) {
                const substring = expr.substring(i);
                const match = substring.match(regex);
                if (match && match.index === 0) {
                    if (current.trim()) {
                        parts.push(current.trim());
                    }
                    current = '';
                    i += match[0].length - 1; // Skip the operator
                    continue;
                }
            }
            
            current += char;
        }
        
        if (current.trim()) {
            parts.push(current.trim());
        }
        
        return parts;
    }

    /**
     * Find matching closing parenthesis
     * @param {string} str - String to search
     * @param {number} start - Starting position of opening paren
     * @returns {number} Position of matching closing paren
     */
    findMatchingParen(str, start) {
        let depth = 1;
        let inString = false;
        let stringChar = null;
        
        for (let i = start + 1; i < str.length; i++) {
            const char = str[i];
            
            // Handle string literals
            if ((char === "'" || char === '"') && (i === 0 || str[i-1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = null;
                }
            }
            
            if (!inString) {
                if (char === '(') depth++;
                else if (char === ')') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
        }
        
        throw new Error('Unmatched parenthesis');
    }

    /**
     * Parse a simple condition (no AND/OR)
     * @param {string} condition - Simple SOQL condition
     * @returns {object} Parsed condition
     */
    parseSimpleCondition(condition) {
        condition = condition.trim();
        
        // Handle relationship fields with __r or __c notation
        const relationshipMatch = condition.match(/^([\w_]+(?:__[rc])\.[\w_]+)\s*(=|!=|<>|>=|<=|>|<|IN|NOT\s+IN|LIKE)\s*(.*)$/i);
        if (relationshipMatch) {
            const fullField = relationshipMatch[1];
            const operator = relationshipMatch[2].toUpperCase().replace(/\s+/g, ' ');
            let value = relationshipMatch[3].trim();
            
            const [baseField, relatedField] = fullField.split('.');
            
            // Parse the value
            value = this.parseValue(value, operator);
            
            return {
                field: fullField,
                baseField: baseField,
                relatedField: relatedField,
                operator: operator,
                value: value,
                isRelationship: true
            };
        }

        // Handle boolean fields
        const booleanMatch = condition.match(/^([\w_]+)\s*=\s*(true|false)$/i);
        if (booleanMatch) {
            return {
                field: booleanMatch[1],
                operator: '=',
                value: booleanMatch[2].toLowerCase() === 'true'
            };
        }

        // Handle IN/NOT IN operators
        const inMatch = condition.match(/^([\w_]+)\s+(IN|NOT\s+IN)\s*\((.*)\)$/i);
        if (inMatch) {
            const values = this.parseInValues(inMatch[3]);
            return {
                field: inMatch[1],
                operator: inMatch[2].toUpperCase().replace(/\s+/g, ' '),
                value: values
            };
        }

        // Handle LIKE operator
        const likeMatch = condition.match(/^([\w_]+)\s+LIKE\s+['"](.*)['"]$/i);
        if (likeMatch) {
            return {
                field: likeMatch[1],
                operator: 'LIKE',
                value: likeMatch[2]
            };
        }

        // Handle standard comparison operators
        const comparisonMatch = condition.match(/^([\w_]+)\s*(=|!=|<>|>=|<=|>|<)\s*(.*)$/);
        if (comparisonMatch) {
            let value = this.parseValue(comparisonMatch[3].trim(), comparisonMatch[2]);
            
            return {
                field: comparisonMatch[1],
                operator: comparisonMatch[2],
                value: value
            };
        }

        // Handle date literals
        const dateLiteralMatch = condition.match(/^([\w_]+)\s*(=|!=|<>|>=|<=|>|<)\s*(\w+)$/);
        if (dateLiteralMatch && this.dateFunctions.includes(dateLiteralMatch[3])) {
            return {
                field: dateLiteralMatch[1],
                operator: dateLiteralMatch[2],
                value: this.convertDateLiteral(dateLiteralMatch[3])
            };
        }

        console.warn('Could not parse condition:', condition);
        return null;
    }

    /**
     * Parse IN clause values
     * @param {string} valueStr - Comma-separated values
     * @returns {array} Array of values
     */
    parseInValues(valueStr) {
        const values = [];
        let current = '';
        let inString = false;
        let stringChar = null;
        
        for (let i = 0; i < valueStr.length; i++) {
            const char = valueStr[i];
            
            if ((char === "'" || char === '"') && (i === 0 || valueStr[i-1] !== '\\')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                    stringChar = null;
                }
            }
            
            if (char === ',' && !inString) {
                if (current.trim()) {
                    values.push(this.parseValue(current.trim()));
                }
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            values.push(this.parseValue(current.trim()));
        }
        
        return values;
    }

    /**
     * Parse a value (remove quotes, convert types)
     * @param {string} value - Value to parse
     * @param {string} operator - Operator context
     * @returns {any} Parsed value
     */
    parseValue(value, operator = null) {
        // Handle IN/NOT IN with parentheses
        if ((operator === 'IN' || operator === 'NOT IN') && value.startsWith('(') && value.endsWith(')')) {
            return this.parseInValues(value.slice(1, -1));
        }
        
        // Remove quotes
        if ((value.startsWith("'") && value.endsWith("'")) || 
            (value.startsWith('"') && value.endsWith('"'))) {
            return value.slice(1, -1);
        }
        
        // Check for null
        if (value.toUpperCase() === 'NULL') {
            return null;
        }
        
        // Check for boolean
        if (value.toUpperCase() === 'TRUE') return true;
        if (value.toUpperCase() === 'FALSE') return false;
        
        // Check for number
        if (!isNaN(value) && value !== '') {
            return Number(value);
        }
        
        return value;
    }

    /**
     * Convert parsed expression tree to GraphQL filter
     * @param {object} parsed - Parsed expression tree
     * @returns {object} GraphQL filter
     */
    convertToGraphQL(parsed) {
        if (!parsed) return null;
        
        if (parsed.type === 'OR') {
            const conditions = parsed.conditions
                .map(c => this.convertToGraphQL(c))
                .filter(c => c !== null);
            
            if (conditions.length === 0) return null;
            if (conditions.length === 1) return conditions[0];
            return { or: conditions };
        }
        
        if (parsed.type === 'AND') {
            const conditions = parsed.conditions
                .map(c => this.convertToGraphQL(c))
                .filter(c => c !== null);
            
            if (conditions.length === 0) return null;
            if (conditions.length === 1) return conditions[0];
            return { and: conditions };
        }
        
        if (parsed.type === 'CONDITION') {
            return this.convertConditionToGraphQL(parsed.value);
        }
        
        return null;
    }

    /**
     * Convert a single condition to GraphQL format
     * @param {object} condition - Parsed condition
     * @returns {object} GraphQL filter condition
     */
    convertConditionToGraphQL(condition) {
        if (!condition) return null;
        
        const { field, operator, value, isRelationship, baseField, relatedField } = condition;
        const graphQLOperator = this.operatorMap[operator] || operator.toLowerCase();

        // Handle relationship fields with proper GraphQL syntax
        if (isRelationship) {
            console.log(`🔗 Converting relationship field filter: ${field}`);
            console.log(`   Original: ${field} ${operator} ${Array.isArray(value) ? '[' + value.slice(0, 3).join(', ') + (value.length > 3 ? '...' : '') + ']' : value}`);
            
            // Keep __r for relationship fields - DO NOT convert to __c
            const relationshipName = baseField;
            
            // Handle different operators for relationship fields
            if (operator === 'IN' || operator === 'NOT IN') {
                const op = operator === 'IN' ? 'in' : 'nin';
                return {
                    [relationshipName]: {
                        [relatedField]: {
                            [op]: value
                        }
                    }
                };
            } else if (value === null) {
                return {
                    [relationshipName]: {
                        [relatedField]: {
                            [graphQLOperator]: null
                        }
                    }
                };
            } else {
                // Standard comparison on relationship field
                return {
                    [relationshipName]: {
                        [relatedField]: {
                            [graphQLOperator]: value
                        }
                    }
                };
            }
        }

        // Handle null values
        if (value === null) {
            return {
                [field]: {
                    [graphQLOperator]: null
                }
            };
        }

        // Handle boolean values
        if (typeof value === 'boolean') {
            return {
                [field]: {
                    eq: value
                }
            };
        }

        // Handle IN/NOT IN operators
        if (operator === 'IN' || operator === 'NOT IN') {
            const op = operator === 'IN' ? 'in' : 'nin';
            return {
                [field]: {
                    [op]: value
                }
            };
        }

        // Handle LIKE operator (convert SQL wildcards to GraphQL)
        if (operator === 'LIKE') {
            // SQL uses % for wildcards, GraphQL uses standard regex
            const regexValue = value.replace(/%/g, '.*');
            return {
                [field]: {
                    like: regexValue
                }
            };
        }

        // Standard comparison
        return {
            [field]: {
                [graphQLOperator]: value
            }
        };
    }

    /**
     * Convert date literals to actual dates
     * @param {string} literal - Date literal (e.g., TODAY, YESTERDAY)
     * @returns {string} ISO date string
     */
    convertDateLiteral(literal) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        switch (literal) {
            case 'TODAY':
                return today.toISOString();
            case 'YESTERDAY':
                today.setDate(today.getDate() - 1);
                return today.toISOString();
            case 'TOMORROW':
                today.setDate(today.getDate() + 1);
                return today.toISOString();
            default:
                return literal;
        }
    }

    /**
     * Build a complete GraphQL filter from org filters configuration
     * @param {object} orgFilters - Org filters from config
     * @param {string} orgKey - Organization key
     * @returns {object} GraphQL filter object
     */
    buildFiltersFromConfig(orgFilters, orgKey) {
        const filters = [];
        const orgFilter = orgFilters[orgKey];
        
        if (!orgFilter) {
            return null;
        }

        // Handle active condition
        if (orgFilter.activeCondition) {
            const activeFilter = this.convertSOQLToGraphQL(orgFilter.activeCondition);
            if (activeFilter) {
                filters.push(activeFilter);
            }
        }

        // Handle date filters
        if (orgFilter.dateFilterType && (orgFilter.dateFrom || orgFilter.dateTo)) {
            const dateFilter = this.buildDateRangeFilter(
                orgFilter.dateFilterType,
                orgFilter.dateFrom,
                orgFilter.dateTo
            );
            if (dateFilter) {
                filters.push(dateFilter);
            }
        }

        // Handle custom filters
        if (orgFilter.customFilter && orgFilter.customFilter.trim() !== '') {
            try {
                const customFilter = this.convertSOQLToGraphQL(orgFilter.customFilter);
                if (customFilter) {
                    filters.push(customFilter);
                }
            } catch (error) {
                console.warn(`Failed to convert custom filter: ${error.message}`);
            }
        }

        // Combine all filters with AND
        if (filters.length === 0) {
            return null;
        } else if (filters.length === 1) {
            return filters[0];
        } else {
            return {
                and: filters
            };
        }
    }

    /**
     * Build date range filter
     * @param {string} field - Date field name
     * @param {string} from - Start date (ISO format)
     * @param {string} to - End date (ISO format)
     * @returns {object} Date range filter
     */
    buildDateRangeFilter(field, from, to) {
        const conditions = [];

        if (from) {
            conditions.push({
                [field]: {
                    gte: from + 'T00:00:00Z'
                }
            });
        }

        if (to) {
            conditions.push({
                [field]: {
                    lte: to + 'T23:59:59Z'
                }
            });
        }

        if (conditions.length === 0) {
            return null;
        } else if (conditions.length === 1) {
            return conditions[0];
        } else {
            return {
                and: conditions
            };
        }
    }

    /**
     * Get filter simplification report
     * @returns {object} Report of simplified filters
     */
    getSimplificationReport() {
        return {
            hasSimplifications: this.simplifiedFilters && this.simplifiedFilters.length > 0,
            count: this.simplifiedFilters ? this.simplifiedFilters.length : 0,
            simplifications: this.simplifiedFilters || [],
            recommendation: this.simplifiedFilters && this.simplifiedFilters.length > 0
                ? 'Some filters could not be fully converted - check logs for details'
                : 'All filters were successfully converted to GraphQL syntax'
        };
    }

    /**
     * Clear simplification tracking
     */
    clearSimplifications() {
        this.simplifiedFilters = [];
    }
}

// Export singleton instance
let instance = null;

module.exports = {
    SOQLToGraphQLFilterConverter,
    getInstance: () => {
        if (!instance) {
            instance = new SOQLToGraphQLFilterConverter();
        }
        return instance;
    }
};