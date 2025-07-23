// Duplicate Foreign Key Resolver Component
class DuplicateResolver {
    constructor() {
        this.comparisonId = null;
        this.duplicateReport = null;
        this.resolutions = new Map(); // Track resolution decisions
        this.init();
    }

    init() {
        // Get comparison ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.comparisonId = urlParams.get('comparisonId');

        if (!this.comparisonId) {
            this.showError('No comparison ID provided');
            return;
        }

        // Bind event listeners
        this.bindEvents();

        // Load duplicate report
        this.loadDuplicateReport();
    }

    bindEvents() {
        // Global resolution buttons
        document.getElementById('resolve-all-keep-first').addEventListener('click', () => this.resolveAllKeepFirst());
        document.getElementById('resolve-all-keep-last').addEventListener('click', () => this.resolveAllKeepLast());
        document.getElementById('skip-all-fks').addEventListener('click', () => this.skipAllForeignKeys());

        // Action buttons
        document.getElementById('cancel-btn').addEventListener('click', () => this.cancel());
        document.getElementById('apply-resolution-btn').addEventListener('click', () => this.applyResolution());
    }

    async loadDuplicateReport() {
        this.showLoading(true);

        try {
            const response = await fetch(`/data-comparison/api/comparison/${this.comparisonId}/duplicates`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load duplicate report');
            }

            this.duplicateReport = data.report;
            this.displayDuplicates();
            this.updateSummary();

        } catch (error) {
            console.error('Failed to load duplicates:', error);
            this.showError('Failed to load duplicate foreign keys report');
        } finally {
            this.showLoading(false);
        }
    }

    displayDuplicates() {
        const container = document.getElementById('duplicate-groups-container');
        container.innerHTML = '';

        if (!this.duplicateReport || !this.duplicateReport.duplicates) {
            container.innerHTML = '<p class="slds-text-align_center">No duplicate foreign keys found</p>';
            return;
        }

        // Process each org's duplicates
        Object.entries(this.duplicateReport.duplicates).forEach(([orgName, orgData]) => {
            Object.entries(orgData.objects).forEach(([objectName, objectData]) => {
                Object.entries(objectData.duplicates).forEach(([fkValue, duplicateInfo]) => {
                    const groupEl = this.createDuplicateGroup(
                        orgName,
                        objectName,
                        objectData.foreign_key_field,
                        fkValue,
                        duplicateInfo
                    );
                    container.appendChild(groupEl);
                });
            });
        });
    }

    createDuplicateGroup(orgName, objectName, fkField, fkValue, duplicateInfo) {
        const template = document.getElementById('duplicate-group-template');
        const clone = template.content.cloneNode(true);

        // Set header info
        clone.querySelector('.org-name').textContent = orgName;
        clone.querySelector('.object-name').textContent = objectName;
        clone.querySelector('.fk-field').textContent = fkField;
        clone.querySelector('.fk-value').textContent = fkValue;
        clone.querySelector('.record-count').textContent = duplicateInfo.record_count;

        const card = clone.querySelector('.duplicate-group');
        card.dataset.orgName = orgName;
        card.dataset.objectName = objectName;
        card.dataset.fkValue = fkValue;

        // Create unique resolution key
        const resolutionKey = `${orgName}:${objectName}:${fkValue}`;
        
        // Set up radio button names
        const radioInputs = clone.querySelectorAll('input[type="radio"]');
        radioInputs.forEach(input => {
            input.name = `resolution_${resolutionKey}`;
            input.addEventListener('change', (e) => this.handleResolutionChange(resolutionKey, e.target.value));
        });

        // Set up expand/collapse
        const expandBtn = clone.querySelector('.expand-btn');
        expandBtn.addEventListener('click', () => this.toggleGroup(card));

        // Create records table
        const tableContainer = clone.querySelector('.records-table-container');
        tableContainer.appendChild(this.createRecordsTable(duplicateInfo.records, resolutionKey));

        return card;
    }

    createRecordsTable(records, resolutionKey) {
        const template = document.getElementById('records-table-template');
        const table = template.content.cloneNode(true);
        const tbody = table.querySelector('tbody');

        records.forEach((record, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <div class="slds-form-element">
                        <div class="slds-form-element__control">
                            <span class="slds-radio">
                                <input type="radio" 
                                       id="record_${resolutionKey}_${index}" 
                                       name="record_${resolutionKey}"
                                       value="${record.line_number}"
                                       class="record-radio">
                                <label class="slds-radio__label" for="record_${resolutionKey}_${index}">
                                    <span class="slds-radio_faux"></span>
                                    <span class="slds-assistive-text">Select this record</span>
                                </label>
                            </span>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="slds-truncate" title="${record.record_id}">
                        ${record.record_id}
                    </div>
                </td>
                <td>
                    <div class="slds-truncate" title="${record.record_data.Name || '-'}">
                        ${record.record_data.Name || '-'}
                    </div>
                </td>
                <td>
                    ${this.formatKeyFields(record.record_data)}
                </td>
                <td>
                    ${this.formatDifferences(record, records)}
                </td>
            `;

            // Add change listener
            const radio = row.querySelector('.record-radio');
            radio.addEventListener('change', () => {
                this.handleRecordSelection(resolutionKey, record.line_number);
                // Update row highlighting
                tbody.querySelectorAll('tr').forEach(tr => tr.classList.remove('selected-record'));
                row.classList.add('selected-record');
            });

            tbody.appendChild(row);
        });

        // Select first record by default
        const firstRadio = tbody.querySelector('.record-radio');
        if (firstRadio) {
            firstRadio.checked = true;
            firstRadio.dispatchEvent(new Event('change'));
        }

        return table;
    }

    formatKeyFields(recordData) {
        const keyFields = ['Id', 'Name', 'SBQQ__Active__c', 'SBQQ__Rule__c'];
        const items = keyFields
            .filter(field => recordData[field] !== undefined)
            .map(field => `<li><span class="field-name">${field}:</span> <span class="field-value">${recordData[field] || '-'}</span></li>`);
        
        return `<ul class="key-fields-list">${items.join('')}</ul>`;
    }

    formatDifferences(record, allRecords) {
        // Show differences between all records
        const differences = [];
        const recordData = record.record_data;
        
        // Get all field names from all records
        const allFields = new Set();
        allRecords.forEach(r => {
            Object.keys(r.record_data).forEach(field => {
                if (!field.startsWith('_') && field !== 'Id') {
                    allFields.add(field);
                }
            });
        });
        
        // Check each field for differences across all records
        allFields.forEach(field => {
            const values = allRecords.map(r => r.record_data[field]);
            const uniqueValues = [...new Set(values)];
            
            // If this field has different values across records
            if (uniqueValues.length > 1) {
                const currentValue = recordData[field];
                const otherValues = uniqueValues.filter(v => v !== currentValue);
                
                differences.push(`
                    <div class="field-difference">
                        <span class="field-name">${field}:</span>
                        <span class="field-value" title="This record's value">${currentValue || 'null'}</span>
                        <span class="slds-text-color_weak"> vs </span>
                        <span class="field-value slds-text-color_warning" title="Other record values">${otherValues.join(', ') || 'null'}</span>
                    </div>
                `);
            }
        });

        return differences.length > 0 ? differences.join('') : '<span class="slds-text-color_success">All fields identical</span>';
    }

    toggleGroup(card) {
        const isExpanded = card.classList.contains('expanded');
        const detailsSection = card.querySelector('.duplicate-details');
        
        if (isExpanded) {
            card.classList.remove('expanded');
            detailsSection.style.display = 'none';
        } else {
            card.classList.add('expanded');
            detailsSection.style.display = 'block';
        }
    }

    handleResolutionChange(resolutionKey, action) {
        if (action === 'skip') {
            this.resolutions.set(resolutionKey, { action: 'skip' });
        } else if (action === 'keep') {
            // Enable record selection
            const [orgName, objectName, fkValue] = resolutionKey.split(':');
            const card = document.querySelector(`[data-org-name="${orgName}"][data-object-name="${objectName}"][data-fk-value="${fkValue}"]`);
            const radios = card.querySelectorAll('.record-radio');
            radios.forEach(radio => radio.disabled = false);
        }
        
        this.updateApplyButton();
    }

    handleRecordSelection(resolutionKey, lineNumber) {
        const currentResolution = this.resolutions.get(resolutionKey) || {};
        currentResolution.action = 'keep';
        currentResolution.keepRecordId = lineNumber;
        this.resolutions.set(resolutionKey, currentResolution);
        
        this.updateApplyButton();
    }

    resolveAllKeepFirst() {
        document.querySelectorAll('.duplicate-group').forEach(card => {
            const resolutionKey = `${card.dataset.orgName}:${card.dataset.objectName}:${card.dataset.fkValue}`;
            
            // Select "keep" option
            const keepRadio = card.querySelector('.resolution-keep');
            if (keepRadio) {
                keepRadio.checked = true;
                keepRadio.dispatchEvent(new Event('change'));
            }
            
            // Select first record
            const firstRecordRadio = card.querySelector('.record-radio');
            if (firstRecordRadio) {
                firstRecordRadio.checked = true;
                firstRecordRadio.dispatchEvent(new Event('change'));
            }
        });
    }

    resolveAllKeepLast() {
        document.querySelectorAll('.duplicate-group').forEach(card => {
            const resolutionKey = `${card.dataset.orgName}:${card.dataset.objectName}:${card.dataset.fkValue}`;
            
            // Select "keep" option
            const keepRadio = card.querySelector('.resolution-keep');
            if (keepRadio) {
                keepRadio.checked = true;
                keepRadio.dispatchEvent(new Event('change'));
            }
            
            // Select last record
            const recordRadios = card.querySelectorAll('.record-radio');
            if (recordRadios.length > 0) {
                const lastRadio = recordRadios[recordRadios.length - 1];
                lastRadio.checked = true;
                lastRadio.dispatchEvent(new Event('change'));
            }
        });
    }

    skipAllForeignKeys() {
        document.querySelectorAll('.duplicate-group').forEach(card => {
            const skipRadio = card.querySelector('.resolution-skip');
            if (skipRadio) {
                skipRadio.checked = true;
                skipRadio.dispatchEvent(new Event('change'));
            }
        });
    }

    updateSummary() {
        if (!this.duplicateReport || !this.duplicateReport.summary) return;

        const summary = this.duplicateReport.summary;
        document.getElementById('total-duplicates').textContent = summary.total_duplicate_fks || 0;
        document.getElementById('affected-orgs').textContent = summary.total_orgs_with_duplicates || 0;
        document.getElementById('affected-objects').textContent = summary.total_objects_with_duplicates || 0;
        
        this.updateProgressIndicator();
    }

    updateProgressIndicator() {
        const totalGroups = document.querySelectorAll('.duplicate-group').length;
        const resolvedGroups = this.resolutions.size;
        const progress = totalGroups > 0 ? Math.round((resolvedGroups / totalGroups) * 100) : 0;
        
        document.getElementById('resolution-progress').textContent = `${progress}%`;
    }

    updateApplyButton() {
        const totalGroups = document.querySelectorAll('.duplicate-group').length;
        const resolvedGroups = this.resolutions.size;
        const applyBtn = document.getElementById('apply-resolution-btn');
        
        applyBtn.disabled = resolvedGroups < totalGroups;
        this.updateProgressIndicator();
    }

    async applyResolution() {
        if (!confirm('Apply resolution and continue with comparison? This will modify your data.')) {
            return;
        }

        this.showLoading(true);

        try {
            const resolutionData = {
                comparisonId: this.comparisonId,
                resolutions: Array.from(this.resolutions.entries()).map(([key, value]) => {
                    const [orgName, objectName, fkValue] = key.split(':');
                    return {
                        orgName,
                        objectName,
                        fkValue,
                        action: value.action,
                        keepRecordId: value.keepRecordId
                    };
                })
            };

            const response = await fetch('/data-comparison/api/comparison/resolve-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(resolutionData)
            });

            const result = await response.json();

            if (result.success) {
                // Redirect to comparison status
                window.location.href = `/data-comparison/comparison-status?comparisonId=${this.comparisonId}`;
            } else {
                throw new Error(result.error || 'Failed to apply resolution');
            }

        } catch (error) {
            console.error('Failed to apply resolution:', error);
            alert(`Failed to apply resolution: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    cancel() {
        if (confirm('Cancel duplicate resolution? The comparison will be terminated.')) {
            window.location.href = '/data-comparison';
        }
    }

    showError(message) {
        // You can enhance this with a proper SLDS modal
        alert(message);
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        overlay.style.display = show ? 'block' : 'none';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new DuplicateResolver();
});