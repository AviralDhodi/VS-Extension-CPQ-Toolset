// Git-like Comparison Viewer Component
console.log('[ComparisonViewer] Component loaded');

class ComparisonViewer {
    constructor() {
        this.comparisonId = null;
        this.diffData = null;
        this.currentFilter = '';
        this.isShellMode = window.parent !== window;
        this.appName = 'Comparison Viewer';
        this.orgColumns = []; // Store actual org column names
        
        this.init();
    }

    init() {
        // Set app name in shell immediately
        this.postMessageToShell({
            type: 'APP_LOADED',
            data: { appName: this.appName }
        });
        
        // Get comparison ID from URL
        this.comparisonId = this.getComparisonId();
        
        if (this.comparisonId) {
            this.logToShell('info', `Loading comparison results: ${this.comparisonId}`);
            this.loadComparisonResults();
        } else {
            this.showError('No comparison ID found. Please navigate from comparison status page.');
        }

        this.setupEventListeners();
        this.setupThemeListener();
        this.postMessageToShell({ type: 'REQUEST_THEME' });
    }
    
    // Shell Communication
    postMessageToShell(message) {
        if (this.isShellMode && window.parent) {
            window.parent.postMessage(message, '*');
        } else {
            console.log('[ComparisonViewer] Shell message:', message);
        }
    }
    
    logToShell(level, message) {
        this.postMessageToShell({
            type: 'ADD_LOG',
            data: { app: this.appName, level: level, message: message }
        });
    }
    
    setupThemeListener() {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'THEME_DATA') {
                this.applyTheme(event.data.theme, event.data.variables);
            }
        });
    }
    
    applyTheme(theme, variables) {
        document.documentElement.setAttribute('data-theme', theme);
        Object.entries(variables).forEach(([name, value]) => {
            document.documentElement.style.setProperty(`--app-${name}`, value);
        });
    }
    
    changeState(newState) {
        if (this.isShellMode && window.parent) {
            this.postMessageToShell({
                type: 'REQUEST_APPVIEW_GENERATION',
                data: { app: 'data-comparison', state: newState }
            });
        } else {
            window.location.href = `/data-comparison/${newState}`;
        }
    }

    getComparisonId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('comparisonId');
    }

    setupEventListeners() {
        const backToStatusBtn = document.getElementById('back-to-status');
        const objectFilter = document.getElementById('object-filter');
        const exportCurrentBtn = document.getElementById('export-current');
        const retryLoadBtn = document.getElementById('retry-load');

        backToStatusBtn?.addEventListener('click', () => this.backToStatus());
        objectFilter?.addEventListener('change', (e) => this.filterResults(e.target.value));
        exportCurrentBtn?.addEventListener('click', () => this.exportCurrentView());
        retryLoadBtn?.addEventListener('click', () => this.loadComparisonResults());
    }

    async loadComparisonResults() {
        try {
            this.logToShell('info', 'Loading comparison results...');
            
            // Show loading state
            this.postMessageToShell({
                type: 'SHOW_LOADER',
                data: { text: 'Loading comparison results...', progress: 20 }
            });

            this.postMessageToShell({
                type: 'APP_STATE_CHANGED',
                data: { state: 'loading', message: 'Loading comparison results...' }
            });

            // Hide error section
            const errorSection = document.getElementById('error-section');
            if (errorSection) {
                errorSection.style.display = 'none';
            }

            // Load the CSV results file
            const response = await fetch(`/data-comparison/api/comparison/${this.comparisonId}/results`);
            
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { text: 'Processing comparison data...', progress: 60 }
            });

            if (response.ok) {
                const text = await response.text();
                
                this.postMessageToShell({
                    type: 'UPDATE_LOADER',
                    data: { text: 'Rendering results...', progress: 80 }
                });

                this.parseDiffResults(text);
                this.hideLoadingState();
                
                this.postMessageToShell({
                    type: 'UPDATE_LOADER',
                    data: { text: 'Complete!', progress: 100 }
                });

                setTimeout(() => {
                    this.postMessageToShell({ type: 'HIDE_LOADER' });
                    this.postMessageToShell({
                        type: 'APP_STATE_CHANGED',
                        data: { state: 'success', message: 'Results loaded successfully' }
                    });
                }, 500);

                this.logToShell('success', `Loaded ${this.diffData.length} comparison results`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.postMessageToShell({ type: 'HIDE_LOADER' });
            this.postMessageToShell({
                type: 'APP_STATE_CHANGED',
                data: { state: 'error', message: 'Failed to load results' }
            });
            this.logToShell('error', `Failed to load results: ${error.message}`);
            this.showError(`Failed to load comparison results: ${error.message}`);
        }
    }

    parseDiffResults(csvText) {
        try {
            const lines = csvText.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('Invalid CSV format - no data found');
            }

            const headers = lines[0].split(',');
            const data = [];

            // Find org columns dynamically (they start with "Org_")
            this.orgColumns = headers.filter(h => h.startsWith('Org_')).map(h => h.trim());
            this.logToShell('info', `Found org columns: ${this.orgColumns.join(', ')}`);

            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const row = {};
                    headers.forEach((header, index) => {
                        row[header.trim()] = values[index] || '';
                    });
                    data.push(row);
                }
            }

            this.diffData = data;
            this.populateObjectFilter();
            this.updateDiffStats();
            this.renderDiffView();
        } catch (error) {
            this.logToShell('error', `Error parsing CSV: ${error.message}`);
            this.showError(`Error parsing comparison results: ${error.message}`);
        }
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current.trim());
        return values;
    }

    populateObjectFilter() {
        const objectFilter = document.getElementById('object-filter');
        if (!objectFilter || !this.diffData) return;

        const objects = [...new Set(this.diffData.map(row => {
            const objectField = row.ObjectFieldName || row.Object || '';
            return objectField.split('.')[0];
        }).filter(Boolean))];

        objectFilter.innerHTML = '<option value="">All Objects</option>';
        objects.forEach(obj => {
            const option = document.createElement('option');
            option.value = obj;
            option.textContent = obj;
            objectFilter.appendChild(option);
        });

        this.logToShell('info', `Found ${objects.length} objects in comparison results`);
    }

    updateDiffStats() {
        if (!this.diffData || this.orgColumns.length < 2) return;

        const filtered = this.currentFilter 
            ? this.diffData.filter(row => {
                const objectField = row.ObjectFieldName || row.Object || '';
                return objectField.startsWith(this.currentFilter);
            })
            : this.diffData;

        const [org1Col, org2Col] = this.orgColumns;

        // Count different types of changes
        const additions = filtered.filter(row => 
            row.DifferenceType === 'RECORD_MISSING' && 
            (row[org1Col] === 'MISSING' || row[org1Col] === '' || !row[org1Col])
        ).length;

        const deletions = filtered.filter(row => 
            row.DifferenceType === 'RECORD_MISSING' && 
            (row[org2Col] === 'MISSING' || row[org2Col] === '' || !row[org2Col])
        ).length;

        const modifications = filtered.filter(row => 
            row.DifferenceType === 'VALUE_DIFFERENCE'
        ).length;

        // Update UI
        document.getElementById('additions-count').textContent = additions;
        document.getElementById('deletions-count').textContent = deletions;
        document.getElementById('modifications-count').textContent = modifications;

        this.logToShell('info', `Stats updated: +${additions} -${deletions} ~${modifications}`);
    }

    renderDiffView() {
        const diffContent = document.getElementById('diff-content');
        if (!diffContent || !this.diffData) return;

        const filtered = this.currentFilter 
            ? this.diffData.filter(row => {
                const objectField = row.ObjectFieldName || row.Object || '';
                return objectField.startsWith(this.currentFilter);
            })
            : this.diffData;

        if (filtered.length === 0) {
            diffContent.innerHTML = `
                <div class="empty-state">
                    <h3>No Results Found</h3>
                    <p>No comparison results match the current filter.</p>
                </div>
            `;
            return;
        }

        let html = '';
        
        // Group by object
        const grouped = {};
        filtered.forEach(row => {
            const objectField = row.ObjectFieldName || row.Object || '';
            const object = objectField.split('.')[0];
            if (!grouped[object]) grouped[object] = [];
            grouped[object].push(row);
        });

        Object.keys(grouped).sort().forEach(object => {
            html += `<div class="diff-object">
                <h4 class="object-name">${object}</h4>
                <div class="diff-lines">`;
            
            grouped[object].forEach(row => {
                const objectField = row.ObjectFieldName || row.Object || '';
                const fieldName = objectField.split('.').slice(1).join('.') || row.Field || 'Unknown Field';
                const diffType = row.DifferenceType === 'RECORD_MISSING' ? 'missing' : 'modified';
                const foreignKey = row.ForeignKeyValue || row.ID || 'N/A';
                
                // Get values from actual org columns
                const [org1Col, org2Col] = this.orgColumns;
                const org1Value = this.formatValue(row[org1Col]);
                const org2Value = this.formatValue(row[org2Col]);
                
                // Generate git-like diff for the values
                const diffHtml = this.generateGitLikeDiff(org1Value, org2Value, org1Col, org2Col);
                
                html += `<div class="diff-line ${diffType}">
                    <span class="line-number" title="Record ID">${foreignKey}</span>
                    <span class="field-name" title="Field: ${fieldName}">${fieldName}</span>
                    <div class="diff-values">
                        ${diffHtml}
                    </div>
                </div>`;
            });
            
            html += `</div></div>`;
        });

        diffContent.innerHTML = html;
        this.logToShell('info', `Rendered ${filtered.length} differences across ${Object.keys(grouped).length} objects`);
    }

    formatValue(value) {
        if (value === null || value === undefined || value === '') {
            return 'MISSING';
        }
        if (value === 'MISSING') {
            return 'MISSING';
        }
        return String(value);
    }

    generateGitLikeDiff(oldValue, newValue, oldLabel, newLabel) {
        // Handle missing values
        if (oldValue === 'MISSING' && newValue === 'MISSING') {
            return `<div class="diff-line-both-missing">Both values missing</div>`;
        }
        
        if (oldValue === 'MISSING') {
            return `<div class="diff-line-addition">
                <div class="diff-line-header">+++ ${newLabel}</div>
                <div class="added-content">${this.escapeHtml(newValue)}</div>
            </div>`;
        }
        
        if (newValue === 'MISSING') {
            return `<div class="diff-line-deletion">
                <div class="diff-line-header">--- ${oldLabel}</div>
                <div class="deleted-content">${this.escapeHtml(oldValue)}</div>
            </div>`;
        }

        // If values are the same, show them as unchanged
        if (oldValue === newValue) {
            return `<div class="diff-line-unchanged">
                <div class="unchanged-content">${this.escapeHtml(oldValue)}</div>
            </div>`;
        }

        // Perform character-by-character comparison
        const diff = this.computeCharacterDiff(oldValue, newValue);
        
        return `<div class="diff-line-modified">
            <div class="diff-line-header">--- ${oldLabel}</div>
            <div class="old-value-diff">${diff.oldHtml}</div>
            <div class="diff-line-header">+++ ${newLabel}</div>
            <div class="new-value-diff">${diff.newHtml}</div>
        </div>`;
    }

    computeCharacterDiff(oldStr, newStr) {
        const oldChars = Array.from(oldStr);
        const newChars = Array.from(newStr);
        const maxLen = Math.max(oldChars.length, newChars.length);
        
        let oldHtml = '';
        let newHtml = '';
        
        for (let i = 0; i < maxLen; i++) {
            const oldChar = oldChars[i] || '';
            const newChar = newChars[i] || '';
            
            if (oldChar === newChar) {
                // Characters match
                if (oldChar) {
                    oldHtml += `<span class="char-unchanged">${this.escapeHtml(oldChar)}</span>`;
                    newHtml += `<span class="char-unchanged">${this.escapeHtml(newChar)}</span>`;
                }
            } else {
                // Characters differ
                if (oldChar) {
                    oldHtml += `<span class="char-deleted">${this.escapeHtml(oldChar)}</span>`;
                }
                if (newChar) {
                    newHtml += `<span class="char-added">${this.escapeHtml(newChar)}</span>`;
                }
            }
        }
        
        return { oldHtml, newHtml };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    filterResults(objectName) {
        this.currentFilter = objectName;
        this.logToShell('info', `Filtering results for object: ${objectName || 'All'}`);
        this.updateDiffStats();
        this.renderDiffView();
    }

    exportCurrentView() {
        if (!this.diffData) return;

        const filtered = this.currentFilter 
            ? this.diffData.filter(row => {
                const objectField = row.ObjectFieldName || row.Object || '';
                return objectField.startsWith(this.currentFilter);
            })
            : this.diffData;

        if (filtered.length === 0) {
            this.logToShell('warning', 'No data to export');
            return;
        }

        const csv = this.convertToCSV(filtered);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comparison-${this.currentFilter || 'all'}-${this.comparisonId}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        this.logToShell('success', `Exported ${filtered.length} rows to CSV`);
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header] || '';
                // Escape quotes and wrap in quotes if contains comma
                const escaped = String(value).replace(/"/g, '""');
                return escaped.includes(',') ? `"${escaped}"` : escaped;
            }).join(','))
        ].join('\n');
        
        return csvContent;
    }

    backToStatus() {
        this.logToShell('info', 'Navigating back to comparison status');
        
        if (this.comparisonId) {
            // Navigate to comparison status with the same comparison ID
            if (this.isShellMode && window.parent) {
                window.parent.location.href = `/data-comparison/comparison-status?comparisonId=${this.comparisonId}`;
            } else {
                window.location.href = `/data-comparison/comparison-status?comparisonId=${this.comparisonId}`;
            }
        } else {
            // Navigate to welcome page
            this.changeState('welcome');
        }
    }

    hideLoadingState() {
        const loadingState = document.querySelector('.loading-state');
        if (loadingState) {
            loadingState.style.display = 'none';
        }
    }

    showError(message) {
        const errorSection = document.getElementById('error-section');
        const errorMessage = document.getElementById('error-message');
        
        if (errorSection && errorMessage) {
            errorMessage.textContent = message;
            errorSection.style.display = 'block';
        }
        
        // Hide loading state
        this.hideLoadingState();
        
        this.logToShell('error', message);
        
        this.postMessageToShell({
            type: 'APP_STATE_CHANGED',
            data: { state: 'error', message: 'Error occurred' }
        });
        
        this.postMessageToShell({ type: 'HIDE_LOADER' });
    }

    destroy() {
        this.logToShell('info', 'Comparison Viewer component destroyed');
        this.postMessageToShell({ type: 'HIDE_LOADER' });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.comparisonViewer = new ComparisonViewer();
    });
} else {
    window.comparisonViewer = new ComparisonViewer();
}

// Cleanup on beforeunload
window.addEventListener('beforeunload', () => {
    if (window.comparisonViewer) {
        window.comparisonViewer.destroy();
    }
});