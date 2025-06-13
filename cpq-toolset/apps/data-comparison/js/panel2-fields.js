// /apps/data-comparison/js/panel2-fields.js
class Panel2Fields {
    constructor() {
        this.state = {
            currentObject: null,
            mode: 'fields', // 'fields' or 'lookups'
            searchTerm: '',
            fields: [],
            lookupFields: [],
            validated: {},
            volatile: {}
        };
        
        this.elements = {
            panel: document.getElementById('panel2'),
            fieldsTab: document.getElementById('p2-fields-tab'),
            lookupsTab: document.getElementById('p2-lookups-tab'),
            searchInput: document.getElementById('p2-search'),
            fieldsList: document.getElementById('p2-fields-list')
        };
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Panel 2 Events
        document.addEventListener('p2PanelEvent', this.handleP2PanelEvent.bind(this));
        document.addEventListener('p2MainEvent', this.handleP2MainEvent.bind(this));
        
        // Settings Events
        this.elements.fieldsTab?.addEventListener('click', () => this.switchMode('fields'));
        this.elements.lookupsTab?.addEventListener('click', () => this.switchMode('lookups'));
        this.elements.searchInput?.addEventListener('input', this.handleSearchInput.bind(this));
        
        // Field interaction events
        this.elements.fieldsList?.addEventListener('click', this.handleFieldClick.bind(this));
        this.elements.fieldsList?.addEventListener('change', this.handleFieldChange.bind(this));
    }

    /**
     * Handle p2PanelEvent - receives object selection
     */
    handleP2PanelEvent(event) {
        const { objectName, validated, volatile } = event.detail || {};
        
        console.log('Panel2: p2PanelEvent received', event.detail);
        
        this.state.currentObject = objectName;
        this.state.validated = validated || {};
        this.state.volatile = volatile || {};
        
        // Request data for this object
        this.requestData(objectName);
    }

    /**
     * Handle p2MainEvent - receives field data and config
     */
    handleP2MainEvent(event) {
        const { blank, objectName, fields, lookupFields, validated, volatile } = event.detail || {};
        
        console.log('Panel2: p2MainEvent received', event.detail);
        console.log('Panel2: Fields count:', fields?.length, 'Lookups count:', lookupFields?.length);
        
        if (blank) {
            this.clearPanel();
            return;
        }
        
        this.state.currentObject = objectName;
        this.state.fields = fields || [];
        this.state.lookupFields = lookupFields || [];
        this.state.validated = validated || {};
        this.state.volatile = volatile || {};
        
        console.log('Panel2: Setting state to loaded, current fields:', this.state.fields.length);
        this.setPanelState('loaded');
        this.renderFields();
    }

    /**
     * Handle search input
     */
    handleSearchInput(event) {
        this.state.searchTerm = event.target.value.toLowerCase();
        this.renderFields();
    }

    /**
     * Switch between Fields and Lookups mode
     */
    switchMode(newMode) {
        if (this.state.mode === newMode) return;
        
        this.state.mode = newMode;
        this.state.searchTerm = '';
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        
        // Update tab visual state
        this.elements.fieldsTab?.classList.toggle('active', newMode === 'fields');
        this.elements.lookupsTab?.classList.toggle('active', newMode === 'lookups');
        
        // Update panel mode attribute
        this.elements.panel.setAttribute('data-panel2-mode', newMode);
        
        this.renderFields();
    }

    /**
     * Handle field interactions (clicks on star, active, expand buttons)
     */
    handleFieldClick(event) {
        const target = event.target;
        const fieldItem = target.closest('.field-item');
        if (!fieldItem) return;
        
        const fieldName = fieldItem.dataset.field;
        if (!fieldName) return;
        
        if (target.closest('.field-star')) {
            this.toggleStar(fieldName);
        } else if (target.closest('.field-active')) {
            this.toggleActive(fieldName);
        } else if (target.closest('.expand-lookup')) {
            this.expandLookup(fieldName);
        }
    }

    /**
     * Handle field checkbox changes
     */
    handleFieldChange(event) {
        if (!event.target.matches('.field-checkbox')) return;
        
        const fieldItem = event.target.closest('.field-item');
        const fieldName = fieldItem?.dataset.field;
        
        if (fieldName) {
            this.toggleFieldSelection(fieldName, event.target.checked);
        }
    }

    /**
     * Toggle field selection
     */
    toggleFieldSelection(fieldName, selected) {
        if (!this.state.currentObject) return;
        
        const config = this.getOrCreateVolatileConfig();
        
        if (selected) {
            if (!config.Fields.includes(fieldName)) {
                config.Fields.push(fieldName);
            }
        } else {
            config.Fields = config.Fields.filter(f => f !== fieldName);
            // If this was the foreign key, remove it
            if (config.foreignKey === fieldName) {
                config.foreignKey = null;
            }
            // Remove from active fields too
            config.Active = config.Active.filter(f => f !== fieldName);
        }
        
        this.updateVolatileConfig(config);
        this.updateFieldVisualState(fieldName);
    }

    /**
     * Toggle star (foreign key)
     */
    toggleStar(fieldName) {
        if (!this.state.currentObject) return;
        
        const config = this.getOrCreateVolatileConfig();
        
        // Only one foreign key allowed per object
        if (config.foreignKey === fieldName) {
            config.foreignKey = null;
        } else {
            config.foreignKey = fieldName;
            // Auto-select this field
            if (!config.Fields.includes(fieldName)) {
                config.Fields.push(fieldName);
            }
        }
        
        this.updateVolatileConfig(config);
        this.renderFields(); // Re-render to update all star states
    }

    /**
     * Toggle active field
     */
    toggleActive(fieldName) {
        if (!this.state.currentObject) return;
        
        const config = this.getOrCreateVolatileConfig();
        
        if (config.Active.includes(fieldName)) {
            config.Active = config.Active.filter(f => f !== fieldName);
        } else {
            config.Active.push(fieldName);
            // Auto-select this field
            if (!config.Fields.includes(fieldName)) {
                config.Fields.push(fieldName);
            }
        }
        
        this.updateVolatileConfig(config);
        this.updateFieldVisualState(fieldName);
    }

    /**
     * Expand lookup field - show modal for sub-field selection
     */
    expandLookup(fieldName) {
        // Find the lookup field info
        const lookupField = this.state.lookupFields.find(f => f.name === fieldName);
        if (!lookupField || !lookupField.referenceTo) return;
        
        // Show lookup modal
        this.showLookupModal(lookupField);
    }

    /**
     * Show lookup field selection modal
     */
    async showLookupModal(lookupField) {
        const modal = document.getElementById('lookup-modal');
        const title = document.getElementById('lookup-modal-title');
        const container = document.getElementById('lookup-fields-container');
        const searchInput = document.getElementById('lookup-field-search');
        
        if (!modal || !container) return;
        
        title.textContent = `Select ${lookupField.label} Field`;
        container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading fields...</p></div>';
        
        modal.classList.remove('hidden');
        
        try {
            // Load fields for the referenced object
            const referencedObject = lookupField.referenceTo[0]; // Take first referenced object
            const response = await fetch(`/api/data-comparison/ajax/fields/${referencedObject}?config=${encodeURIComponent(JSON.stringify({ selectedOrgs: window.objectController.state.selectedOrgs }))}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderLookupFields(container, lookupField, data.fields.filter(f => !f.isLookup));
            }
        } catch (error) {
            container.innerHTML = '<div class="error-state">Failed to load lookup fields</div>';
            console.error('Failed to load lookup fields:', error);
        }
    }

    /**
     * Render lookup fields in modal
     */
    renderLookupFields(container, lookupField, fields) {
        const html = fields.map(field => `
            <div class="lookup-field-item" data-field="${lookupField.name}.${field.name}">
                <input type="radio" name="lookup-field" class="lookup-field-radio" value="${field.name}">
                <div class="field-info">
                    <div class="field-name">${lookupField.name}.${field.name}</div>
                    <div class="field-label">${field.label}</div>
                    <div class="field-type">${field.type}</div>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = html;
        
        // Setup modal event handlers
        this.setupLookupModalHandlers(lookupField);
    }

    /**
     * Setup lookup modal event handlers
     */
    setupLookupModalHandlers(lookupField) {
        const modal = document.getElementById('lookup-modal');
        const closeBtn = document.getElementById('lookup-modal-close');
        const cancelBtn = document.getElementById('lookup-cancel');
        const confirmBtn = document.getElementById('lookup-confirm');
        const container = document.getElementById('lookup-fields-container');
        
        // Close handlers
        const closeModal = () => modal?.classList.add('hidden');
        closeBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);
        
        // Selection handler
        container?.addEventListener('click', (event) => {
            if (event.target.closest('.lookup-field-item')) {
                const item = event.target.closest('.lookup-field-item');
                const radio = item.querySelector('.lookup-field-radio');
                radio.checked = true;
                
                // Update confirm button state
                confirmBtn.disabled = false;
                
                // Update visual selection
                container.querySelectorAll('.lookup-field-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            }
        });
        
        // Confirm handler
        confirmBtn?.addEventListener('click', () => {
            const selectedRadio = container.querySelector('.lookup-field-radio:checked');
            if (selectedRadio) {
                const lookupFieldName = `${lookupField.name}.${selectedRadio.value}`;
                this.addLookupField(lookupFieldName);
            }
            closeModal();
        });
    }

    /**
     * Add lookup field to selection
     */
    addLookupField(lookupFieldName) {
        if (!this.state.currentObject) return;
        
        const config = this.getOrCreateVolatileConfig();
        
        if (!config.Fields.includes(lookupFieldName)) {
            config.Fields.push(lookupFieldName);
            this.updateVolatileConfig(config);
            
            // Add to current fields for display
            this.state.fields.push({
                name: lookupFieldName,
                label: lookupFieldName,
                type: 'Lookup',
                isLookup: true
            });
            
            this.renderFields();
        }
    }

    /**
     * Request data from controller
     */
    requestData(objectName) {
        if (!objectName) {
            document.dispatchEvent(new CustomEvent('p2DataRequestEvent', { detail: { blank: true } }));
        } else {
            this.setPanelState('loading');
            document.dispatchEvent(new CustomEvent('p2DataRequestEvent', { detail: { objectName } }));
        }
    }

    /**
     * Render fields list
     */
    renderFields() {
        if (!this.elements.fieldsList) return;
        
        const currentFields = this.getCurrentFields();
        const filteredFields = this.filterFields(currentFields);
        
        if (filteredFields.length === 0) {
            this.elements.fieldsList.innerHTML = '<div class="empty-state">No fields found</div>';
            return;
        }
        
        const html = filteredFields.map(field => this.createFieldHTML(field)).join('');
        this.elements.fieldsList.innerHTML = html;
        
        lucide.createIcons({ parent: this.elements.fieldsList });
    }

    /**
     * Get current fields based on mode
     */
    getCurrentFields() {
        return this.state.mode === 'fields' ? this.state.fields : this.state.lookupFields;
    }

    /**
     * Filter fields based on search term
     */
    filterFields(fields) {
        if (!this.state.searchTerm) return fields;
        
        return fields.filter(field => {
            return field.name.toLowerCase().includes(this.state.searchTerm) ||
                   (field.label && field.label.toLowerCase().includes(this.state.searchTerm)) ||
                   (field.type && field.type.toLowerCase().includes(this.state.searchTerm));
        });
    }

    /**
     * Create HTML for single field
     */
    createFieldHTML(field) {
        const config = this.getVolatileConfig();
        const isSelected = config.Fields.includes(field.name);
        const isStarred = config.foreignKey === field.name;
        const isActive = config.Active.includes(field.name);
        const isValidated = this.isFieldValidated(field.name);
        const isVolatile = this.isFieldVolatile(field.name);
        
        let cssClasses = ['field-item'];
        if (isSelected) cssClasses.push('selected');
        if (isValidated) cssClasses.push('validated');
        else if (isVolatile) cssClasses.push('volatile');
        
        return `
            <div class="${cssClasses.join(' ')}" data-field="${field.name}">
                <input type="checkbox" class="field-checkbox" ${isSelected ? 'checked' : ''}>
                <div class="field-info">
                    <div class="field-name">${field.name}</div>
                    <div class="field-label">${field.label || field.name}</div>
                </div>
                <div class="field-controls">
                    <button class="field-star ${isStarred ? 'active' : ''}" title="Foreign Key">
                        <i data-lucide="star"></i>
                    </button>
                    <button class="field-active ${isActive ? 'active' : ''}" title="Active Field">
                        ACT
                    </button>
                    ${field.isLookup ? '<button class="expand-lookup" title="Expand Lookup"><i data-lucide="chevron-right"></i></button>' : ''}
                </div>
                <div class="field-type">${field.type}</div>
            </div>
        `;
    }

    /**
     * Update visual state for a specific field
     */
    updateFieldVisualState(fieldName) {
        const fieldItem = this.elements.fieldsList.querySelector(`[data-field="${fieldName}"]`);
        if (!fieldItem) return;
        
        const config = this.getVolatileConfig();
        const checkbox = fieldItem.querySelector('.field-checkbox');
        const starBtn = fieldItem.querySelector('.field-star');
        const activeBtn = fieldItem.querySelector('.field-active');
        
        // Update checkbox
        checkbox.checked = config.Fields.includes(fieldName);
        
        // Update star
        starBtn.classList.toggle('active', config.foreignKey === fieldName);
        
        // Update active
        activeBtn.classList.toggle('active', config.Active.includes(fieldName));
        
        // Update field item classes
        fieldItem.classList.toggle('selected', config.Fields.includes(fieldName));
        fieldItem.classList.toggle('validated', this.isFieldValidated(fieldName));
        fieldItem.classList.toggle('volatile', this.isFieldVolatile(fieldName));
    }

    /**
     * Check if field is validated
     */
    isFieldValidated(fieldName) {
        return (this.state.validated?.Fields || []).includes(fieldName);
    }

    /**
     * Check if field has volatile changes
     */
    isFieldVolatile(fieldName) {
        const config = this.getVolatileConfig();
        const isInVolatile = config.Fields.includes(fieldName);
        const isInValidated = (this.state.validated?.Fields || []).includes(fieldName);
        return isInVolatile !== isInValidated;
    }

    /**
     * Get or create volatile config for current object
     */
    getOrCreateVolatileConfig() {
        if (!this.state.currentObject) return {};
        
        let config = this.getVolatileConfig();
        if (!config || Object.keys(config).length === 0) {
            config = {
                Fields: [],
                Active: [],
                foreignKey: null,
                ActiveCondition: "",
                LastModifiedBetween: [null, null],
                CreatedBetween: [null, null]
            };
        }
        
        return config;
    }

    /**
     * Get volatile config for current object
     */
    getVolatileConfig() {
        const config = this.state.volatile || {};
        return {
            Fields: config.Fields || [],
            Active: config.Active || [],
            foreignKey: config.foreignKey || null,
            ActiveCondition: config.ActiveCondition || "",
            LastModifiedBetween: config.LastModifiedBetween || [null, null],
            CreatedBetween: config.CreatedBetween || [null, null]
        };
    }

    /**
     * Update volatile config
     */
    updateVolatileConfig(config) {
        this.state.volatile = config;
        window.objectController?.updateConfig(this.state.currentObject, config);
    }

    /**
     * Set panel state
     */
    setPanelState(state) {
        this.elements.panel.setAttribute('data-panel2-state', state);
    }

    /**
     * Clear panel
     */
    clearPanel() {
        this.state.currentObject = null;
        this.state.fields = [];
        this.state.lookupFields = [];
        this.state.validated = {};
        this.state.volatile = {};
        this.state.searchTerm = '';
        
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        if (this.elements.fieldsList) this.elements.fieldsList.innerHTML = '';
        
        this.setPanelState('empty');
    }

    /**
     * Reset panel
     */
    reset() {
        this.clearPanel();
        this.switchMode('fields');
    }
}

// Initialize Panel 2
document.addEventListener('DOMContentLoaded', () => {
    window.panel2Fields = new Panel2Fields();
});