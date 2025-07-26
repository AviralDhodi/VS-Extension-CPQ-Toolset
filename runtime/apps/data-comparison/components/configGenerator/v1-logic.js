/**
 * V1-Style Configuration Generator with Per-Org Filtering Enhancement
 * Working AJAX-based implementation
 */
class V1ConfigGenerator {
    constructor() {
        this.selectedObject = null;
        this.objectFields = [];
        this.commonObjects = [];
        this.selectedOrgs = [];
        this.configData = null;
        
        // Config state (v1 pattern)
        this.config = {
            validated: {},
            volatile: {}
        };
        
        // Per-org filters (NEW ENHANCEMENT)
        this.orgFilters = {};
        
        this.currentFilterTab = 'active';
        this.selectedReferenceField = null;
        
        this.init();
    }

    async init() {
        console.log('🚀 V1 Config Generator initializing...');
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        // Bind events
        this.bindEvents();
        
        // Check for existing config
        await this.checkAndRestoreConfig();
        
        // Load objects
        await this.loadCommonObjects();
        
        console.log('✅ V1 Config Generator initialized');
    }

    bindEvents() {
        // Objects panel
        document.getElementById('objects-search').addEventListener('input', (e) => this.filterObjects(e.target.value));
        document.getElementById('objects-list').addEventListener('click', (e) => this.handleObjectClick(e));
        document.getElementById('retry-objects').addEventListener('click', () => this.loadCommonObjects());

        // Fields panel
        document.getElementById('fields-search').addEventListener('input', (e) => this.filterFields(e.target.value));
        document.getElementById('fields-list').addEventListener('click', (e) => this.handleFieldClick(e));
        document.getElementById('select-all-fields').addEventListener('click', () => this.selectAllFields());
        document.getElementById('clear-all-fields').addEventListener('click', () => this.clearAllFields());

        // Config panel
        document.getElementById('validate-and-save-btn').addEventListener('click', () => this.validateAndSave());
        document.getElementById('add-filters-btn').addEventListener('click', () => this.openFiltersModal());

        // Filters modal
        document.getElementById('close-filters-modal').addEventListener('click', () => this.closeFiltersModal());
        document.getElementById('cancel-filters').addEventListener('click', () => this.closeFiltersModal());
        document.getElementById('save-filters').addEventListener('click', () => this.saveFilters());
        
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchFilterTab(e.target.dataset.tab));
        });

        // Reference modal
        document.getElementById('close-reference-modal').addEventListener('click', () => this.closeReferenceModal());
        document.getElementById('cancel-reference').addEventListener('click', () => this.closeReferenceModal());
        document.getElementById('add-reference').addEventListener('click', () => this.addReferenceField());
        document.getElementById('reference-search-input').addEventListener('input', (e) => this.filterReferenceFields(e.target.value));
    }

    async checkAndRestoreConfig() {
        // Check session storage for active config
        const activeConfig = sessionStorage.getItem('cpq-config-active');
        if (activeConfig) {
            try {
                const config = JSON.parse(activeConfig);
                this.configData = { configFilename: config.filename };
                this.selectedOrgs = config.selectedOrgs || [];
                
                // Load validated config
                await this.loadValidatedConfig(config.filename);
                
                // Restore volatile config
                this.loadFromSessionStorage();
                
                console.log('🔄 Restored existing config:', config.filename);
            } catch (error) {
                console.warn('Failed to restore config:', error);
            }
        }
    }

    async loadValidatedConfig(filename) {
        try {
            const response = await fetch('/data-comparison/api/config/load', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.config) {
                    this.config.validated = data.config.objects || {};
                    console.log('✅ Loaded validated config');
                }
            }
        } catch (error) {
            console.error('Failed to load validated config:', error);
        }
    }

    loadFromSessionStorage() {
        try {
            const volatile = sessionStorage.getItem('cpq-config-generator-volatile');
            if (volatile) {
                this.config.volatile = JSON.parse(volatile);
            }
            
            const filters = sessionStorage.getItem('cpq-config-generator-org-filters');
            if (filters) {
                this.orgFilters = JSON.parse(filters);
            }
        } catch (error) {
            console.warn('Failed to load from session storage:', error);
        }
    }

    saveToSessionStorage() {
        try {
            sessionStorage.setItem('cpq-config-generator-volatile', JSON.stringify(this.config.volatile));
            sessionStorage.setItem('cpq-config-generator-org-filters', JSON.stringify(this.orgFilters));
        } catch (error) {
            console.warn('Failed to save to session storage:', error);
        }
    }

    async loadCommonObjects() {
        if (!this.selectedOrgs || this.selectedOrgs.length === 0) {
            console.log('No organizations available');
            return;
        }

        const objectsLoading = document.getElementById('objects-loading');
        const objectsError = document.getElementById('objects-error');
        const objectsList = document.getElementById('objects-list');

        objectsLoading.classList.remove('hidden');
        objectsError.classList.add('hidden');
        objectsList.innerHTML = '';

        try {
            const response = await fetch('/data-comparison/api/objects/common', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username),
                    configFilename: this.configData?.configFilename
                })
            });

            const data = await response.json();
            
            if (data.success && data.objects) {
                this.commonObjects = data.objects;
                this.renderObjects();
                objectsLoading.classList.add('hidden');
                console.log(`✅ Loaded ${this.commonObjects.length} common objects`);
            } else {
                throw new Error(data.error || 'Failed to load objects');
            }

        } catch (error) {
            console.error('Failed to load objects:', error);
            objectsLoading.classList.add('hidden');
            objectsError.classList.remove('hidden');
        }
    }

    renderObjects() {
        const objectsList = document.getElementById('objects-list');
        const objectsCount = document.getElementById('objects-count');
        
        objectsCount.textContent = `${this.commonObjects.length} objects`;

        const html = this.commonObjects.map(obj => {
            const isSelected = this.selectedObject === obj.name;
            const isConfigured = this.config.volatile[obj.name] && 
                                this.config.volatile[obj.name].Fields && 
                                this.config.volatile[obj.name].Fields.length > 0;
            const isValidated = this.config.validated[obj.name] !== undefined;

            let classes = ['object-item'];
            if (isSelected) classes.push('selected');
            if (isValidated) classes.push('configured');
            else if (isConfigured) classes.push('volatile');

            return `
                <div class="${classes.join(' ')}" data-object="${obj.name}">
                    <div class="object-info">
                        <div class="object-name">${obj.name}</div>
                        <div class="object-label">${obj.label || obj.name}</div>
                    </div>
                </div>
            `;
        }).join('');

        objectsList.innerHTML = html;
    }

    filterObjects(searchTerm) {
        const items = document.querySelectorAll('.object-item');
        const term = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const name = item.querySelector('.object-name').textContent.toLowerCase();
            const label = item.querySelector('.object-label').textContent.toLowerCase();
            const matches = name.includes(term) || label.includes(term);
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    async handleObjectClick(event) {
        const objectItem = event.target.closest('.object-item');
        if (!objectItem) return;

        const objectName = objectItem.dataset.object;
        if (objectName === this.selectedObject) return;

        // Update selection
        document.querySelectorAll('.object-item').forEach(item => {
            item.classList.remove('selected');
        });
        objectItem.classList.add('selected');

        this.selectedObject = objectName;
        document.getElementById('selected-object-name').textContent = objectName;
        document.getElementById('fields-title').textContent = `Fields: ${objectName}`;

        // Load fields
        await this.loadObjectFields(objectName);
    }

    async loadObjectFields(objectName) {
        const fieldsLoading = document.getElementById('fields-loading');
        const fieldsList = document.getElementById('fields-list');
        const noObjectSelected = document.getElementById('no-object-selected');

        noObjectSelected.classList.add('hidden');
        fieldsLoading.classList.remove('hidden');
        fieldsList.innerHTML = '';

        try {
            const response = await fetch(`/data-comparison/api/objects/${objectName}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username)
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.objectFields = data.fields || [];
                this.renderFields();
                fieldsLoading.classList.add('hidden');
                
                // Enable field controls
                document.getElementById('select-all-fields').disabled = false;
                document.getElementById('clear-all-fields').disabled = false;
                
                console.log(`✅ Loaded ${this.objectFields.length} fields for ${objectName}`);
            } else {
                throw new Error(data.error || 'Failed to load fields');
            }

        } catch (error) {
            console.error('Failed to load fields:', error);
            fieldsLoading.classList.add('hidden');
        }
    }

    renderFields() {
        if (!this.selectedObject) return;

        const fieldsList = document.getElementById('fields-list');
        const fieldsCount = document.getElementById('fields-count');
        
        const currentConfig = this.getVolatileConfig();
        fieldsCount.textContent = `${this.objectFields.length} fields`;

        const html = this.objectFields.map(field => {
            const isSelected = currentConfig.Fields.includes(field.name);
            const isForeignKey = currentConfig.foreignKey === field.name;
            const isReference = field.referenceTo && field.referenceTo.length > 0;
            const isLookup = field.name.includes('.');

            let classes = ['field-item'];
            if (isSelected) classes.push('selected');
            if (isLookup) classes.push('lookup-field');

            return `
                <div class="${classes.join(' ')}" data-field="${field.name}">
                    <div class="field-checkbox">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} data-field="${field.name}">
                    </div>
                    <div class="field-info">
                        <div class="field-name">${field.name}</div>
                        <div class="field-label">${field.label || field.name}</div>
                        <div class="field-type">${field.type}${isReference ? ' (Reference)' : ''}</div>
                    </div>
                    <div class="field-actions">
                        <button class="star-btn ${isForeignKey ? 'active' : ''}" 
                                data-field="${field.name}" 
                                title="Set as Foreign Key">
                            <i data-lucide="star"></i>
                        </button>
                        ${isReference ? `
                            <button class="expand-btn" 
                                    data-field="${field.name}"
                                    data-reference-to="${field.referenceTo[0]}"
                                    title="Expand reference field">
                                <i data-lucide="external-link"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        fieldsList.innerHTML = html;
        
        // Re-initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

        this.updateConfigSummary();
    }

    handleFieldClick(event) {
        const target = event.target;
        
        // Handle star button
        if (target.closest('.star-btn')) {
            event.stopPropagation();
            const fieldName = target.closest('.star-btn').dataset.field;
            this.toggleForeignKey(fieldName);
            return;
        }

        // Handle expand button
        if (target.closest('.expand-btn')) {
            event.stopPropagation();
            const fieldName = target.closest('.expand-btn').dataset.field;
            const referenceTo = target.closest('.expand-btn').dataset.referenceTo;
            this.openReferenceModal(fieldName, referenceTo);
            return;
        }

        // Handle checkbox or field click
        const fieldItem = target.closest('.field-item');
        if (fieldItem) {
            const fieldName = fieldItem.dataset.field;
            const checkbox = fieldItem.querySelector('input[type="checkbox"]');
            
            if (target.type === 'checkbox') {
                this.toggleFieldSelection(fieldName, target.checked);
            } else {
                // Click anywhere else toggles selection
                const newState = !checkbox.checked;
                checkbox.checked = newState;
                this.toggleFieldSelection(fieldName, newState);
            }
        }
    }

    toggleFieldSelection(fieldName, selected) {
        const objectConfig = this.getOrCreateVolatileConfig();
        
        if (selected) {
            if (!objectConfig.Fields.includes(fieldName)) {
                objectConfig.Fields.push(fieldName);
            }
        } else {
            const index = objectConfig.Fields.indexOf(fieldName);
            if (index > -1) {
                objectConfig.Fields.splice(index, 1);
                
                // Clear foreign key if this field was the foreign key
                if (objectConfig.foreignKey === fieldName) {
                    objectConfig.foreignKey = null;
                }
            }
        }

        this.updateVolatileConfig(objectConfig);
        this.renderFields();
    }

    toggleForeignKey(fieldName) {
        const objectConfig = this.getOrCreateVolatileConfig();
        
        if (objectConfig.foreignKey === fieldName) {
            objectConfig.foreignKey = null;
        } else {
            objectConfig.foreignKey = fieldName;
            // Ensure field is selected
            if (!objectConfig.Fields.includes(fieldName)) {
                objectConfig.Fields.push(fieldName);
            }
        }

        this.updateVolatileConfig(objectConfig);
        this.renderFields();
    }

    selectAllFields() {
        const objectConfig = this.getOrCreateVolatileConfig();
        objectConfig.Fields = this.objectFields.map(f => f.name);
        this.updateVolatileConfig(objectConfig);
        this.renderFields();
    }

    clearAllFields() {
        const objectConfig = this.getOrCreateVolatileConfig();
        objectConfig.Fields = [];
        objectConfig.foreignKey = null;
        this.updateVolatileConfig(objectConfig);
        this.renderFields();
    }

    filterFields(searchTerm) {
        const items = document.querySelectorAll('.field-item');
        const term = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const name = item.querySelector('.field-name').textContent.toLowerCase();
            const label = item.querySelector('.field-label').textContent.toLowerCase();
            const matches = name.includes(term) || label.includes(term);
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    getOrCreateVolatileConfig() {
        if (!this.selectedObject) return null;
        
        if (!this.config.volatile[this.selectedObject]) {
            this.config.volatile[this.selectedObject] = {
                Fields: [],
                Active: [],
                foreignKey: null,
                ActiveCondition: "",
                LastModifiedBetween: [null, null],
                CreatedBetween: [null, null]
            };
        }
        
        return this.config.volatile[this.selectedObject];
    }

    getVolatileConfig() {
        if (!this.selectedObject) {
            return {
                Fields: [],
                Active: [],
                foreignKey: null,
                ActiveCondition: "",
                LastModifiedBetween: [null, null],
                CreatedBetween: [null, null]
            };
        }
        
        return this.config.volatile[this.selectedObject] || {
            Fields: [],
            Active: [],
            foreignKey: null,
            ActiveCondition: "",
            LastModifiedBetween: [null, null],
            CreatedBetween: [null, null]
        };
    }

    updateVolatileConfig(objectConfig) {
        if (this.selectedObject) {
            this.config.volatile[this.selectedObject] = objectConfig;
            this.saveToSessionStorage();
        }
    }

    updateConfigSummary() {
        const config = this.getVolatileConfig();
        
        // Update field count
        document.getElementById('selected-fields-count').textContent = config.Fields.length;
        
        // Update foreign key status
        const fkStatus = document.getElementById('foreign-key-status');
        const fkInfo = document.getElementById('foreign-key-info');
        
        if (config.foreignKey) {
            fkStatus.textContent = 'Set';
            fkInfo.innerHTML = `<span class="foreign-key-selected">${config.foreignKey}</span>`;
        } else {
            fkStatus.textContent = 'No FK';
            fkInfo.innerHTML = `<span class="no-foreign-key">No foreign key selected</span>`;
        }
        
        // Update action buttons
        const isValid = this.isConfigurationValid();
        document.getElementById('validate-and-save-btn').disabled = !isValid;
        document.getElementById('add-filters-btn').disabled = !isValid;
        
        // Update configured objects list
        this.updateConfiguredObjectsList();
    }

    updateConfiguredObjectsList() {
        const container = document.getElementById('configured-objects-list');
        const configuredObjects = Object.keys(this.config.volatile).filter(objName => 
            this.config.volatile[objName].Fields.length > 0
        );

        if (configuredObjects.length === 0) {
            container.innerHTML = '<p class="no-objects">No objects configured yet</p>';
            return;
        }

        const html = configuredObjects.map(objName => {
            const config = this.config.volatile[objName];
            const isValidated = this.config.validated[objName] !== undefined;
            
            return `
                <div class="configured-object">
                    <div class="object-info">
                        <div class="object-name">${objName}</div>
                        <div class="object-details">
                            ${config.Fields.length} fields • ${config.foreignKey || 'No FK'}
                        </div>
                    </div>
                    <div class="object-status">
                        <i data-lucide="${isValidated ? 'check-circle' : 'clock'}"></i>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    isConfigurationValid() {
        if (!this.selectedObject) return false;
        
        const config = this.getVolatileConfig();
        
        return config.Fields.length > 0 && 
               config.foreignKey && 
               config.Fields.includes(config.foreignKey);
    }

    async validateAndSave() {
        if (!this.isConfigurationValid()) return;

        try {
            const response = await fetch('/data-comparison/api/validation/object', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectName: this.selectedObject,
                    config: this.getVolatileConfig()
                })
            });

            const data = await response.json();
            
            if (data.success) {
                // Move from volatile to validated
                this.config.validated[this.selectedObject] = { ...this.config.volatile[this.selectedObject] };
                
                // Update config file
                await this.updateConfigFile();
                
                console.log(`✅ Validated and saved ${this.selectedObject}`);
                this.updateConfigSummary();
                this.renderObjects(); // Update object indicators
            } else {
                throw new Error(data.error || 'Validation failed');
            }

        } catch (error) {
            console.error('Validation failed:', error);
            alert('Validation failed: ' + error.message);
        }
    }

    async updateConfigFile() {
        if (!this.configData?.configFilename) return;

        try {
            const response = await fetch('/data-comparison/api/config/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.configData.configFilename,
                    objects: this.config.volatile,
                    orgFilters: this.orgFilters, // NEW: Include per-org filters
                    action: 'add-objects'
                })
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to update config file');
            }

        } catch (error) {
            console.error('Failed to update config file:', error);
            throw error;
        }
    }

    // NEW ENHANCEMENT: Per-Org Filtering
    openFiltersModal() {
        if (!this.selectedObject || !this.isConfigurationValid()) return;

        document.getElementById('filter-object-name').textContent = this.selectedObject;
        document.getElementById('filters-modal').classList.remove('hidden');
        
        this.initializeOrgFilters();
        this.renderOrgFilters();
    }

    closeFiltersModal() {
        document.getElementById('filters-modal').classList.add('hidden');
    }

    initializeOrgFilters() {
        if (!this.orgFilters[this.selectedObject]) {
            this.orgFilters[this.selectedObject] = {};
            
            // Initialize each org with default filters
            this.selectedOrgs.forEach(org => {
                this.orgFilters[this.selectedObject][org.username] = {
                    Active: [],
                    ActiveCondition: "",
                    LastModifiedBetween: [null, null],
                    CreatedBetween: [null, null]
                };
            });
        }
    }

    switchFilterTab(tab) {
        this.currentFilterTab = tab;
        
        // Update tab UI
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.filter-tab[data-tab="${tab}"]`).classList.add('active');
        
        this.renderOrgFilters();
    }

    renderOrgFilters() {
        const container = document.getElementById('org-filters-content');
        const currentConfig = this.getVolatileConfig();
        
        const html = this.selectedOrgs.map(org => {
            const orgFilters = this.orgFilters[this.selectedObject][org.username];
            const orgName = org.alias || org.username;
            
            let content = '';
            
            if (this.currentFilterTab === 'active') {
                content = `
                    <div class="filter-section">
                        <label>Active Fields for ${orgName}:</label>
                        <div class="active-fields-checkboxes">
                            ${currentConfig.Fields.map(fieldName => `
                                <label class="checkbox-label">
                                    <input type="checkbox" 
                                           ${orgFilters.Active.includes(fieldName) ? 'checked' : ''}
                                           data-org="${org.username}" 
                                           data-field="${fieldName}">
                                    ${fieldName}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else if (this.currentFilterTab === 'dates') {
                content = `
                    <div class="filter-section">
                        <label>Last Modified Between:</label>
                        <div class="date-range">
                            <input type="date" 
                                   value="${orgFilters.LastModifiedBetween[0] || ''}"
                                   data-org="${org.username}" 
                                   data-filter="LastModifiedBetween"
                                   data-index="0">
                            <span>to</span>
                            <input type="date" 
                                   value="${orgFilters.LastModifiedBetween[1] || ''}"
                                   data-org="${org.username}" 
                                   data-filter="LastModifiedBetween"
                                   data-index="1">
                        </div>
                        
                        <label>Created Between:</label>
                        <div class="date-range">
                            <input type="date" 
                                   value="${orgFilters.CreatedBetween[0] || ''}"
                                   data-org="${org.username}" 
                                   data-filter="CreatedBetween"
                                   data-index="0">
                            <span>to</span>
                            <input type="date" 
                                   value="${orgFilters.CreatedBetween[1] || ''}"
                                   data-org="${org.username}" 
                                   data-filter="CreatedBetween"
                                   data-index="1">
                        </div>
                    </div>
                `;
            } else if (this.currentFilterTab === 'conditions') {
                content = `
                    <div class="filter-section">
                        <label>Custom Condition for ${orgName}:</label>
                        <textarea rows="3" 
                                  placeholder="e.g., SBQQ__Active__c = TRUE AND CreatedDate > LAST_N_DAYS:30"
                                  data-org="${org.username}"
                                  data-filter="ActiveCondition">${orgFilters.ActiveCondition}</textarea>
                        <small>Use SOQL WHERE clause syntax</small>
                    </div>
                `;
            }
            
            return `
                <div class="org-filter-section">
                    <div class="org-filter-header">${orgName}</div>
                    ${content}
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
        
        // Bind filter events
        this.bindFilterEvents();
    }

    bindFilterEvents() {
        const container = document.getElementById('org-filters-content');
        
        // Active field checkboxes
        container.querySelectorAll('input[type="checkbox"][data-org]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const org = e.target.dataset.org;
                const field = e.target.dataset.field;
                const orgFilters = this.orgFilters[this.selectedObject][org];
                
                if (e.target.checked) {
                    if (!orgFilters.Active.includes(field)) {
                        orgFilters.Active.push(field);
                    }
                } else {
                    const index = orgFilters.Active.indexOf(field);
                    if (index > -1) {
                        orgFilters.Active.splice(index, 1);
                    }
                }
            });
        });
        
        // Date inputs
        container.querySelectorAll('input[type="date"][data-org]').forEach(input => {
            input.addEventListener('change', (e) => {
                const org = e.target.dataset.org;
                const filter = e.target.dataset.filter;
                const index = parseInt(e.target.dataset.index);
                
                this.orgFilters[this.selectedObject][org][filter][index] = e.target.value || null;
            });
        });
        
        // Condition textareas
        container.querySelectorAll('textarea[data-org]').forEach(textarea => {
            textarea.addEventListener('input', (e) => {
                const org = e.target.dataset.org;
                const filter = e.target.dataset.filter;
                
                this.orgFilters[this.selectedObject][org][filter] = e.target.value;
            });
        });
    }

    saveFilters() {
        this.saveToSessionStorage();
        console.log('✅ Per-org filters saved for', this.selectedObject);
        this.closeFiltersModal();
    }

    // Reference Field Modal
    async openReferenceModal(parentField, referenceTo) {
        document.getElementById('reference-path').textContent = `${this.selectedObject}.${parentField} → ${referenceTo}`;
        document.getElementById('reference-description').textContent = `Select a field from ${referenceTo} to include in your comparison.`;
        document.getElementById('reference-modal').classList.remove('hidden');
        
        // Load reference fields
        await this.loadReferenceFields(referenceTo);
    }

    closeReferenceModal() {
        document.getElementById('reference-modal').classList.add('hidden');
        this.selectedReferenceField = null;
    }

    async loadReferenceFields(objectName) {
        try {
            const response = await fetch(`/data-comparison/api/objects/${objectName}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username)
                })
            });

            const data = await response.json();
            
            if (data.success) {
                this.renderReferenceFields(data.fields || []);
            } else {
                throw new Error(data.error || 'Failed to load reference fields');
            }

        } catch (error) {
            console.error('Failed to load reference fields:', error);
        }
    }

    renderReferenceFields(fields) {
        const container = document.getElementById('reference-fields-list');
        const count = document.getElementById('reference-fields-count');
        
        count.textContent = `${fields.length} fields`;
        
        const html = fields.map(field => `
            <div class="reference-field-item" data-field="${field.name}">
                <div class="field-info">
                    <div class="field-name">${field.name}</div>
                    <div class="field-label">${field.label || field.name}</div>
                    <div class="field-type">${field.type}</div>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = html;
        
        // Bind selection events
        container.querySelectorAll('.reference-field-item').forEach(item => {
            item.addEventListener('click', () => {
                // Clear previous selection
                container.querySelectorAll('.reference-field-item').forEach(i => i.classList.remove('selected'));
                
                // Select this item
                item.classList.add('selected');
                this.selectedReferenceField = item.dataset.field;
                
                // Enable add button
                document.getElementById('add-reference').disabled = false;
                document.getElementById('add-reference').textContent = `Add ${this.selectedReferenceField}`;
            });
        });
    }

    filterReferenceFields(searchTerm) {
        const items = document.querySelectorAll('.reference-field-item');
        const term = searchTerm.toLowerCase();
        
        items.forEach(item => {
            const name = item.querySelector('.field-name').textContent.toLowerCase();
            const label = item.querySelector('.field-label').textContent.toLowerCase();
            const matches = name.includes(term) || label.includes(term);
            item.style.display = matches ? 'flex' : 'none';
        });
    }

    addReferenceField() {
        if (!this.selectedReferenceField) return;
        
        const objectConfig = this.getOrCreateVolatileConfig();
        const lookupFieldName = `${this.selectedReferenceField}.Name`; // Simplified for demo
        
        if (!objectConfig.Fields.includes(lookupFieldName)) {
            objectConfig.Fields.push(lookupFieldName);
            this.updateVolatileConfig(objectConfig);
            this.renderFields();
        }
        
        this.closeReferenceModal();
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Get orgs from session storage
    const activeConfig = sessionStorage.getItem('cpq-config-active');
    if (activeConfig) {
        try {
            const config = JSON.parse(activeConfig);
            const generator = new V1ConfigGenerator();
            generator.selectedOrgs = config.selectedOrgs || [];
        } catch (error) {
            console.error('Failed to initialize:', error);
        }
    } else {
        console.warn('No active config found - need to set up orgs first');
    }
});