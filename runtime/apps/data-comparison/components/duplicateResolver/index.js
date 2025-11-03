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
        
        // Set up radio button names and IDs
        const radioInputs = clone.querySelectorAll('input[type="radio"]');
        radioInputs.forEach(input => {
            input.name = `resolution_${resolutionKey}`;
            input.id = `${input.value}_${resolutionKey}`;
            // Update the label's for attribute
            const label = input.nextElementSibling;
            if (label && label.tagName === 'LABEL') {
                label.setAttribute('for', input.id);
            }
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
        const [orgName, objectName, fkValue] = resolutionKey.split(':');
        const card = document.querySelector(`[data-org-name="${orgName}"][data-object-name="${objectName}"][data-fk-value="${fkValue}"]`);
        
        if (action === 'skip') {
            this.resolutions.set(resolutionKey, { action: 'skip' });
            // Add visual feedback
            card.classList.add('resolved');
            this.showResolutionFeedback(card, 'skip');
            // Disable and uncheck record selection
            const radios = card.querySelectorAll('.record-radio');
            radios.forEach(radio => {
                radio.disabled = true;
                radio.checked = false;
            });
            // Clear all record selections
            // Add visual class to indicate skip mode
            card.classList.add('skip-mode');
            // Clear any previous "keep" resolution
            const currentResolution = this.resolutions.get(resolutionKey);
            if (currentResolution) {
                delete currentResolution.keepRecordId;
            }
        } else if (action === 'keep') {
            // Enable record selection
            const radios = card.querySelectorAll('.record-radio');
            radios.forEach(radio => radio.disabled = false);
            // Remove skip mode and resolved state until a record is selected
            card.classList.remove('resolved', 'skip-mode');
            // Remove any existing feedback
            const existingFeedback = card.querySelector('.resolution-badge');
            if (existingFeedback) {
                existingFeedback.remove();
            }
            // If no record is selected, select the first one
            const selectedRadio = card.querySelector('.record-radio:checked');
            if (!selectedRadio) {
                const firstRadio = card.querySelector('.record-radio');
                if (firstRadio) {
                    firstRadio.checked = true;
                    firstRadio.dispatchEvent(new Event('change'));
                }
            }
        }
        
        this.updateApplyButton();
    }

    handleRecordSelection(resolutionKey, lineNumber) {
        const currentResolution = this.resolutions.get(resolutionKey) || {};
        currentResolution.action = 'keep';
        currentResolution.keepRecordId = lineNumber;
        this.resolutions.set(resolutionKey, currentResolution);
        
        // Add visual feedback
        const [orgName, objectName, fkValue] = resolutionKey.split(':');
        const card = document.querySelector(`[data-org-name="${orgName}"][data-object-name="${objectName}"][data-fk-value="${fkValue}"]`);
        card.classList.add('resolved');
        this.showResolutionFeedback(card, 'keep', lineNumber);
        
        this.updateApplyButton();
    }
    
    showResolutionFeedback(card, action, recordId = null) {
        // Remove any existing feedback
        const existingFeedback = card.querySelector('.resolution-badge');
        if (existingFeedback) {
            existingFeedback.remove();
        }
        
        // Create SLDS badge element
        const feedback = document.createElement('span');
        
        if (action === 'skip') {
            feedback.className = 'slds-badge slds-theme_warning resolution-badge';
            feedback.innerHTML = `
                <svg class="slds-icon slds-icon_xx-small slds-icon-text-warning slds-m-right_xx-small" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#warning"></use>
                </svg>
                Will skip this foreign key
            `;
        } else if (action === 'keep') {
            feedback.className = 'slds-badge slds-theme_success resolution-badge';
            feedback.innerHTML = `
                <svg class="slds-icon slds-icon_xx-small slds-icon-text-success slds-m-right_xx-small" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#success"></use>
                </svg>
                Will keep record #${recordId}
            `;
        }
        
        // Add margin
        feedback.style.marginLeft = 'var(--slds-g-spacing-medium, 1rem)';
        
        // Add to card header
        const header = card.querySelector('.slds-card__header-title');
        header.appendChild(feedback);
        
        // Show temporary success message
        this.showSuccessToast(`Resolution set: ${action === 'skip' ? 'Skip FK' : 'Keep record #' + recordId}`);
    }
    
    showSuccessToast(message) {
        // Remove any existing toast
        const existingToast = document.querySelector('.slds-notify_container');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Create SLDS toast container
        const toastContainer = document.createElement('div');
        toastContainer.className = 'slds-notify_container slds-is-fixed';
        toastContainer.innerHTML = `
            <div class="slds-notify slds-notify_toast slds-theme_success" role="status">
                <span class="slds-assistive-text">success</span>
                <span class="slds-icon_container slds-icon-utility-success slds-m-right_small slds-no-flex slds-align-top" title="Success">
                    <svg class="slds-icon slds-icon_small" aria-hidden="true">
                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#success"></use>
                    </svg>
                </span>
                <div class="slds-notify__content">
                    <h2 class="slds-text-heading_small">${message}</h2>
                </div>
                <div class="slds-notify__close">
                    <button class="slds-button slds-button_icon slds-button_icon-inverse" title="Close">
                        <svg class="slds-button__icon slds-button__icon_large" aria-hidden="true">
                            <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#close"></use>
                        </svg>
                        <span class="slds-assistive-text">Close</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(toastContainer);
        
        // Add close button functionality
        const closeBtn = toastContainer.querySelector('.slds-notify__close button');
        closeBtn.addEventListener('click', () => toastContainer.remove());
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (toastContainer.parentNode) {
                toastContainer.remove();
            }
        }, 3000);
    }

    resolveAllKeepFirst() {
        let count = 0;
        document.querySelectorAll('.duplicate-group').forEach(card => {
            const resolutionKey = `${card.dataset.orgName}:${card.dataset.objectName}:${card.dataset.fkValue}`;
            
            // Remove skip mode if present
            card.classList.remove('skip-mode');
            
            // Select "keep" option
            const keepRadio = card.querySelector('.resolution-keep');
            if (keepRadio) {
                keepRadio.checked = true;
                keepRadio.dispatchEvent(new Event('change'));
            }
            
            // Enable and select first record
            const firstRecordRadio = card.querySelector('.record-radio');
            if (firstRecordRadio) {
                firstRecordRadio.disabled = false;
                firstRecordRadio.checked = true;
                firstRecordRadio.dispatchEvent(new Event('change'));
                count++;
            }
        });
        
        this.showSuccessToast(`Applied "Keep First" to ${count} duplicate groups`);
        this.updateApplyButton();
    }

    resolveAllKeepLast() {
        let count = 0;
        document.querySelectorAll('.duplicate-group').forEach(card => {
            const resolutionKey = `${card.dataset.orgName}:${card.dataset.objectName}:${card.dataset.fkValue}`;
            
            // Remove skip mode if present
            card.classList.remove('skip-mode');
            
            // Select "keep" option
            const keepRadio = card.querySelector('.resolution-keep');
            if (keepRadio) {
                keepRadio.checked = true;
                keepRadio.dispatchEvent(new Event('change'));
            }
            
            // Enable and select last record
            const recordRadios = card.querySelectorAll('.record-radio');
            if (recordRadios.length > 0) {
                const lastRadio = recordRadios[recordRadios.length - 1];
                lastRadio.disabled = false;
                lastRadio.checked = true;
                lastRadio.dispatchEvent(new Event('change'));
                count++;
            }
        });
        
        this.showSuccessToast(`Applied "Keep Last" to ${count} duplicate groups`);
        this.updateApplyButton();
    }

    skipAllForeignKeys() {
        let count = 0;
        document.querySelectorAll('.duplicate-group').forEach(card => {
            const resolutionKey = `${card.dataset.orgName}:${card.dataset.objectName}:${card.dataset.fkValue}`;
            
            // Select the skip radio button
            const skipRadio = card.querySelector('.resolution-skip');
            if (skipRadio) {
                skipRadio.checked = true;
                skipRadio.dispatchEvent(new Event('change'));
                count++;
            }
            
            // Make sure all record radios are unchecked and disabled
            const recordRadios = card.querySelectorAll('.record-radio');
            recordRadios.forEach(radio => {
                radio.checked = false;
                radio.disabled = true;
            });
            
            // Clear all record selections
            
            // Ensure skip mode is applied
            card.classList.add('skip-mode', 'resolved');
            
            // Update resolution data
            this.resolutions.set(resolutionKey, { action: 'skip' });
        });
        
        this.showSuccessToast(`Applied "Skip" to ${count} duplicate groups`);
        this.updateApplyButton();
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
        // Create a more informative confirmation dialog
        const totalGroups = document.querySelectorAll('.duplicate-group').length;
        const keepCount = Array.from(this.resolutions.values()).filter(r => r.action === 'keep').length;
        const skipCount = Array.from(this.resolutions.values()).filter(r => r.action === 'skip').length;
        
        const confirmMessage = `
Resolution Summary:
- Total duplicates: ${totalGroups}
- Records to keep: ${keepCount}
- Foreign keys to skip: ${skipCount}

This will modify your data and continue with the comparison.
Do you want to proceed?`;
        
        if (!confirm(confirmMessage)) {
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