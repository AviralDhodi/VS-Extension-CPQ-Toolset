/**
 * SLDS 2.0 Compliant Configuration Generator
 * Manual Mode with full accessibility and SLDS patterns
 */

class SLDSConfigGenerator {
    constructor() {
        this.state = {
            currentStep: 'objects',
            selectedOrgs: [],
            commonObjects: [],
            selectedObject: null,
            selectedFields: {},
            lookupRelationships: {},
            currentTab: 'fields'
        };
        
        this.init();
    }

    init() {
        // Initialize event listeners
        this.setupEventListeners();
        // Load initial data
        this.loadCommonObjects();
    }

    setupEventListeners() {
        // Panel 1: Objects
        const objectSearch = document.getElementById('p1-search');
        if (objectSearch) {
            objectSearch.addEventListener('input', (e) => this.filterObjects(e.target.value));
        }

        const sortPackage = document.getElementById('p1-sort-package');
        if (sortPackage) {
            sortPackage.addEventListener('click', () => this.togglePackageGrouping());
        }

        const sortDirection = document.getElementById('p1-sort-direction');
        if (sortDirection) {
            sortDirection.addEventListener('click', () => this.toggleSortDirection());
        }

        // Panel 2: Fields
        const fieldSearch = document.getElementById('p2-search');
        if (fieldSearch) {
            fieldSearch.addEventListener('input', (e) => this.filterFields(e.target.value));
        }

        // Tabs
        const fieldsTab = document.getElementById('fields-tab');
        const lookupsTab = document.getElementById('lookups-tab');
        
        if (fieldsTab) {
            fieldsTab.addEventListener('click', () => this.switchTab('fields'));
        }
        if (lookupsTab) {
            lookupsTab.addEventListener('click', () => this.switchTab('lookups'));
        }

        // Actions
        const clearSelection = document.getElementById('clear-selection');
        if (clearSelection) {
            clearSelection.addEventListener('click', () => this.clearAllSelections());
        }

        const saveAndContinue = document.getElementById('save-and-continue');
        if (saveAndContinue) {
            saveAndContinue.addEventListener('click', () => this.saveAndContinue());
        }
    }

    async loadCommonObjects() {
        const loading = document.getElementById('p1-loading');
        const list = document.getElementById('p1-objects-list');
        
        // Show loading state
        if (loading) loading.classList.remove('slds-hide');
        if (list) list.classList.add('slds-hide');

        try {
            // Get selected orgs from session storage
            const selectedOrgs = JSON.parse(sessionStorage.getItem('selectedOrgs') || '[]');
            this.state.selectedOrgs = selectedOrgs;

            // Fetch common objects
            const response = await fetch('/api/compare/common-objects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgIds: selectedOrgs.map(org => org.id) })
            });

            if (!response.ok) throw new Error('Failed to fetch objects');
            
            const data = await response.json();
            this.state.commonObjects = data.commonObjects || [];
            
            // Render objects
            this.renderObjects();
            
            // Hide loading, show list
            if (loading) loading.classList.add('slds-hide');
            if (list) list.classList.remove('slds-hide');
            
        } catch (error) {
            console.error('Error loading objects:', error);
            this.showError('Failed to load objects');
        }
    }

    renderObjects() {
        const list = document.getElementById('p1-objects-list');
        if (!list) return;

        list.innerHTML = '';
        
        this.state.commonObjects.forEach(obj => {
            const li = document.createElement('li');
            li.className = 'slds-item';
            li.role = 'option';
            li.tabIndex = 0;
            li.innerHTML = `
                <div class="slds-p-horizontal_small slds-p-vertical_xx-small slds-has-flexi-truncate">
                    <div class="slds-grid slds-grid_vertical-align-center">
                        <span class="slds-checkbox slds-m-right_x-small">
                            <input type="checkbox" id="obj-${obj.name}" value="${obj.name}" />
                            <label class="slds-checkbox__label" for="obj-${obj.name}">
                                <span class="slds-checkbox_faux"></span>
                                <span class="slds-form-element__label slds-assistive-text">Select ${obj.label}</span>
                            </label>
                        </span>
                        <span class="slds-has-flexi-truncate">
                            <div class="slds-text-body_regular slds-text-color_default">
                                ${obj.label}
                            </div>
                            <div class="slds-text-body_small slds-text-color_weak">
                                ${obj.name}
                            </div>
                        </span>
                    </div>
                </div>
            `;
            
            // Add click handler
            li.addEventListener('click', (e) => {
                if (!e.target.matches('input[type="checkbox"]')) {
                    const checkbox = li.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.selectObject(obj, checkbox.checked);
                    }
                }
            });

            // Add keyboard support
            li.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const checkbox = li.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.selectObject(obj, checkbox.checked);
                    }
                }
            });

            const checkbox = li.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.selectObject(obj, e.target.checked);
                });
            }

            list.appendChild(li);
        });
    }

    async selectObject(obj, isSelected) {
        if (isSelected) {
            this.state.selectedObject = obj;
            await this.loadObjectFields(obj);
            this.updatePanel2Title(obj.label);
        } else {
            // Remove from selection
            delete this.state.selectedFields[obj.name];
            this.updateSelectionSummary();
        }
    }

    async loadObjectFields(obj) {
        const placeholder = document.getElementById('p2-placeholder');
        const fieldsList = document.getElementById('p2-fields-list');
        
        if (placeholder) placeholder.classList.add('slds-hide');
        if (fieldsList) fieldsList.classList.remove('slds-hide');

        try {
            // Fetch fields for selected object
            const response = await fetch('/api/compare/object-fields', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgIds: this.state.selectedOrgs.map(org => org.id),
                    objectName: obj.name 
                })
            });

            if (!response.ok) throw new Error('Failed to fetch fields');
            
            const data = await response.json();
            const fields = data.fields || [];
            
            // Separate regular fields and lookup fields
            const regularFields = fields.filter(f => !f.referenceTo);
            const lookupFields = fields.filter(f => f.referenceTo);
            
            // Render fields
            this.renderFields(regularFields, 'p2-fields-list');
            this.renderFields(lookupFields, 'p2-lookups-list');
            
        } catch (error) {
            console.error('Error loading fields:', error);
            this.showError('Failed to load fields');
        }
    }

    renderFields(fields, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'slds-form-element';
        fieldset.role = 'group';
        
        const legend = document.createElement('legend');
        legend.className = 'slds-assistive-text';
        legend.textContent = containerId.includes('lookup') ? 'Lookup Fields' : 'Regular Fields';
        fieldset.appendChild(legend);

        fields.forEach(field => {
            const div = document.createElement('div');
            div.className = 'slds-form-element__control slds-p-horizontal_small slds-p-vertical_xx-small';
            
            const checkbox = document.createElement('div');
            checkbox.className = 'slds-checkbox';
            checkbox.innerHTML = `
                <input type="checkbox" id="field-${field.name}" value="${field.name}" />
                <label class="slds-checkbox__label" for="field-${field.name}">
                    <span class="slds-checkbox_faux"></span>
                    <span class="slds-form-element__label">
                        <span class="slds-text-body_regular">${field.label}</span>
                        <span class="slds-text-body_small slds-text-color_weak slds-m-left_xx-small">${field.name}</span>
                    </span>
                </label>
            `;
            
            const input = checkbox.querySelector('input');
            if (input) {
                input.addEventListener('change', (e) => {
                    this.toggleFieldSelection(field, e.target.checked);
                });
            }

            div.appendChild(checkbox);
            fieldset.appendChild(div);
        });

        container.appendChild(fieldset);
    }

    toggleFieldSelection(field, isSelected) {
        const objName = this.state.selectedObject?.name;
        if (!objName) return;

        if (!this.state.selectedFields[objName]) {
            this.state.selectedFields[objName] = [];
        }

        if (isSelected) {
            if (!this.state.selectedFields[objName].includes(field.name)) {
                this.state.selectedFields[objName].push(field.name);
            }
        } else {
            const index = this.state.selectedFields[objName].indexOf(field.name);
            if (index > -1) {
                this.state.selectedFields[objName].splice(index, 1);
            }
        }

        this.updateSelectionSummary();
    }

    updatePanel2Title(title) {
        const titleElement = document.getElementById('p2-object-name');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }

    updateSelectionSummary() {
        const emptyState = document.getElementById('p3-empty-state');
        const selectionTree = document.getElementById('p3-selection-tree');
        const selectionCount = document.getElementById('selection-count');
        const continueBtn = document.getElementById('save-and-continue');
        
        // Count total fields
        let totalFields = 0;
        Object.values(this.state.selectedFields).forEach(fields => {
            totalFields += fields.length;
        });

        // Update count badge
        if (selectionCount) {
            selectionCount.querySelector('.slds-badge__label').textContent = `${totalFields} fields`;
        }

        // Enable/disable continue button
        if (continueBtn) {
            continueBtn.disabled = totalFields === 0;
        }

        // Show/hide empty state
        if (totalFields === 0) {
            if (emptyState) emptyState.classList.remove('slds-hide');
            if (selectionTree) selectionTree.classList.add('slds-hide');
        } else {
            if (emptyState) emptyState.classList.add('slds-hide');
            if (selectionTree) {
                selectionTree.classList.remove('slds-hide');
                this.renderSelectionTree();
            }
        }
    }

    renderSelectionTree() {
        const tree = document.querySelector('#p3-selection-tree .slds-tree');
        if (!tree) return;

        tree.innerHTML = '';

        Object.entries(this.state.selectedFields).forEach(([objName, fields]) => {
            if (fields.length === 0) return;

            const li = document.createElement('li');
            li.className = 'slds-tree__item';
            li.setAttribute('aria-expanded', 'true');
            li.innerHTML = `
                <button class="slds-button slds-button_icon slds-button_icon-x-small slds-m-right_x-small" 
                        aria-label="Expand ${objName}">
                    <svg class="slds-button__icon slds-button__icon_small" aria-hidden="true">
                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#chevrondown"></use>
                    </svg>
                </button>
                <span class="slds-has-flexi-truncate">
                    <span class="slds-tree__item-label slds-text-body_regular slds-text-color_default">
                        ${objName}
                    </span>
                    <span class="slds-badge slds-m-left_x-small">
                        <span class="slds-badge__label">${fields.length}</span>
                    </span>
                </span>
            `;

            // Add nested fields
            const ul = document.createElement('ul');
            ul.className = 'slds-tree__group slds-nested';
            ul.role = 'group';

            fields.forEach(fieldName => {
                const fieldLi = document.createElement('li');
                fieldLi.className = 'slds-tree__item';
                fieldLi.innerHTML = `
                    <button class="slds-button slds-button_icon slds-button_icon-x-small slds-m-right_x-small" 
                            disabled aria-hidden="true">
                        <svg class="slds-button__icon slds-button__icon_small" aria-hidden="true">
                            <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#chevronright"></use>
                        </svg>
                    </button>
                    <span class="slds-has-flexi-truncate">
                        <span class="slds-tree__item-label slds-text-body_small slds-text-color_weak">
                            ${fieldName}
                        </span>
                    </span>
                `;
                ul.appendChild(fieldLi);
            });

            li.appendChild(ul);
            tree.appendChild(li);
        });
    }

    switchTab(tabName) {
        const fieldsTab = document.getElementById('fields-tab');
        const lookupsTab = document.getElementById('lookups-tab');
        const fieldsPanel = document.getElementById('fields-panel');
        const lookupsPanel = document.getElementById('lookups-panel');

        if (tabName === 'fields') {
            // Activate fields tab
            fieldsTab?.parentElement?.classList.add('slds-is-active');
            lookupsTab?.parentElement?.classList.remove('slds-is-active');
            fieldsTab?.setAttribute('aria-selected', 'true');
            fieldsTab?.setAttribute('tabindex', '0');
            lookupsTab?.setAttribute('aria-selected', 'false');
            lookupsTab?.setAttribute('tabindex', '-1');
            
            // Show fields panel
            fieldsPanel?.classList.add('slds-show');
            fieldsPanel?.classList.remove('slds-hide');
            lookupsPanel?.classList.add('slds-hide');
            lookupsPanel?.classList.remove('slds-show');
        } else {
            // Activate lookups tab
            lookupsTab?.parentElement?.classList.add('slds-is-active');
            fieldsTab?.parentElement?.classList.remove('slds-is-active');
            lookupsTab?.setAttribute('aria-selected', 'true');
            lookupsTab?.setAttribute('tabindex', '0');
            fieldsTab?.setAttribute('aria-selected', 'false');
            fieldsTab?.setAttribute('tabindex', '-1');
            
            // Show lookups panel
            lookupsPanel?.classList.add('slds-show');
            lookupsPanel?.classList.remove('slds-hide');
            fieldsPanel?.classList.add('slds-hide');
            fieldsPanel?.classList.remove('slds-show');
        }

        this.state.currentTab = tabName;
    }

    filterObjects(searchTerm) {
        const items = document.querySelectorAll('#p1-objects-list li');
        const term = searchTerm.toLowerCase();

        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes(term)) {
                item.classList.remove('slds-hide');
            } else {
                item.classList.add('slds-hide');
            }
        });
    }

    filterFields(searchTerm) {
        const selector = this.state.currentTab === 'fields' ? '#p2-fields-list' : '#p2-lookups-list';
        const items = document.querySelectorAll(`${selector} .slds-checkbox`);
        const term = searchTerm.toLowerCase();

        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            const parent = item.parentElement;
            if (text.includes(term)) {
                parent?.classList.remove('slds-hide');
            } else {
                parent?.classList.add('slds-hide');
            }
        });
    }

    clearAllSelections() {
        // Clear state
        this.state.selectedFields = {};
        this.state.lookupRelationships = {};
        
        // Uncheck all checkboxes
        document.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            cb.checked = false;
        });

        // Update UI
        this.updateSelectionSummary();
    }

    async saveAndContinue() {
        // Save configuration to session storage
        const config = {
            selectedOrgs: this.state.selectedOrgs,
            selectedFields: this.state.selectedFields,
            lookupRelationships: this.state.lookupRelationships
        };

        sessionStorage.setItem('manualModeConfig', JSON.stringify(config));
        
        // Show success toast
        this.showToast('Configuration saved successfully', 'success');
        
        // Navigate to next step
        // window.location.href = '/filters-page';
    }

    togglePackageGrouping() {
        // Implementation for package grouping
        console.log('Toggle package grouping');
    }

    toggleSortDirection() {
        const icon = document.querySelector('#p1-sort-direction svg use');
        const currentHref = icon?.getAttribute('xlink:href');
        
        if (currentHref?.includes('arrowup')) {
            icon?.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#arrowdown');
            // Sort descending
        } else {
            icon?.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#arrowup');
            // Sort ascending
        }
    }

    showToast(message, type = 'info') {
        // Create toast container if not exists
        let container = document.querySelector('.slds-notify_container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'slds-notify_container slds-is-fixed';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `slds-notify slds-notify_toast slds-theme_${type}`;
        toast.setAttribute('role', 'status');
        toast.innerHTML = `
            <span class="slds-assistive-text">${type}</span>
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
        `;

        container.appendChild(toast);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 3000);
    }

    showError(message) {
        this.showToast(message, 'error');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.sldsConfigGenerator = new SLDSConfigGenerator();
});