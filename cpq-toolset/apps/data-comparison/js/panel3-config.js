// /apps/data-comparison/js/panel3-config.js
class Panel3Config {
    constructor() {
        this.state = {
            currentObject: null,
            mode: 'active', // 'active' or 'date'
            validated: {},
            volatile: {}
        };
        
        this.elements = {
            panel: document.getElementById('panel3'),
            activeTab: document.getElementById('p3-active-tab'),
            dateTab: document.getElementById('p3-date-tab'),
            validateSaveBtn: document.getElementById('p3-validate-save'),
            activeConfig: document.getElementById('p3-active-config'),
            dateConfig: document.getElementById('p3-date-config')
        };
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Panel 3 Events
        document.addEventListener('p3DataRequestEvent', this.handleP3DataRequest.bind(this));
        document.addEventListener('p3MainEvent', this.handleP3MainEvent.bind(this));
        document.addEventListener('p3MainClean', this.handleP3MainClean.bind(this));
        
        // Settings Events
        this.elements.activeTab?.addEventListener('click', () => this.switchMode('active'));
        this.elements.dateTab?.addEventListener('click', () => this.switchMode('date'));
        this.elements.validateSaveBtn?.addEventListener('click', this.handleValidateAndSave.bind(this));
    }

    /**
     * Handle p3DataRequestEvent
     */
    handleP3DataRequest(event) {
        const { mode } = event.detail || {};
        
        console.log('Panel3: p3DataRequestEvent received', event.detail);
        
        document.dispatchEvent(new CustomEvent('p3DataRequestEvent', {
            detail: { mode: mode || this.state.mode }
        }));
    }

    /**
     * Handle p3MainEvent - receives config data
     */
    handleP3MainEvent(event) {
        const { mode, empty, objectName, validated, volatile } = event.detail || {};
        
        console.log('Panel3: p3MainEvent received', event.detail);
        
        if (empty) {
            this.clearPanel();
            return;
        }
        
        this.state.currentObject = objectName;
        this.state.validated = validated || {};
        this.state.volatile = volatile || {};
        this.state.mode = mode || this.state.mode;
        
        this.renderConfig();
    }

    /**
     * Handle p3MainClean - clear the panel
     */
    handleP3MainClean(event) {
        console.log('Panel3: p3MainClean received');
        this.clearPanel();
        this.switchMode('active');
    }

    /**
     * Switch between Active and Date Config modes
     */
    switchMode(newMode) {
        if (this.state.mode === newMode) return;
        
        this.state.mode = newMode;
        
        // Update tab visual state
        this.elements.activeTab?.classList.toggle('active', newMode === 'active');
        this.elements.dateTab?.classList.toggle('active', newMode === 'date');
        
        // Update panel mode attribute
        this.elements.panel.setAttribute('data-panel3-mode', newMode);
        
        // Request data for new mode
        this.requestData();
    }

    /**
     * Handle validate and save button
     */
    handleValidateAndSave() {
        document.dispatchEvent(new CustomEvent('validateAndSave', {
            detail: { config: this.state.volatile }
        }));
    }

    /**
     * Request data from controller
     */
    requestData() {
        document.dispatchEvent(new CustomEvent('p3DataRequestEvent', {
            detail: { mode: this.state.mode }
        }));
    }

    /**
     * Render configuration based on current mode
     */
    renderConfig() {
        if (this.state.mode === 'active') {
            this.renderActiveConfig();
        } else {
            this.renderDateConfig();
        }
    }

    /**
     * Render active fields configuration
     */
    renderActiveConfig() {
        if (!this.elements.activeConfig) return;
        
        const volatileActiveFields = this.state.volatile?.Active || [];
        const validatedActiveFields = this.state.validated?.Active || [];
        const volatileCondition = this.state.volatile?.ActiveCondition || '';
        const validatedCondition = this.state.validated?.ActiveCondition || '';
            
        const html = `
            <div class="config-section">
                <h5>Active Fields</h5>
                <div class="active-fields-list">
                    ${volatileActiveFields.length === 0 ? 
                        '<div class="empty-state">No active fields selected</div>' :
                        volatileActiveFields.map(field => this.createActiveFieldHTML(field)).join('')
                    }
                </div>
                
                <div class="active-condition-section">
                    <h5>Active Condition</h5>
                    <div class="condition-input-container">
                        <textarea 
                            id="active-condition-input" 
                            class="condition-input" 
                            placeholder="Enter active condition (e.g., Status = 'Active' AND IsDeleted = false)"
                            rows="3">${volatileCondition}</textarea>
                    </div>
                    ${validatedCondition !== volatileCondition ? 
                        `<div class="validated-preview">
                            <h6>Previously Validated:</h6>
                            <div class="validated-condition">${validatedCondition || 'None'}</div>
                        </div>` : ''
                    }
                </div>
            </div>
        `;
        
        this.elements.activeConfig.innerHTML = html;
        
        // Setup active condition input handler
        const conditionInput = document.getElementById('active-condition-input');
        conditionInput?.addEventListener('input', this.handleActiveConditionChange.bind(this));
        
        lucide.createIcons({ parent: this.elements.activeConfig });
    }

    /**
     * Create HTML for active field
     */
    createActiveFieldHTML(fieldName) {
        const isValidated = (this.state.validated?.Active || []).includes(fieldName);
        const cssClass = isValidated ? 'validated' : 'volatile';
        
        return `
            <div class="active-field-item ${cssClass}">
                <span class="field-name">${fieldName}</span>
                <span class="field-status">
                    ${isValidated ? 
                        '<i data-lucide="check-circle" title="Validated"></i>' : 
                        '<i data-lucide="clock" title="Pending Validation"></i>'
                    }
                </span>
            </div>
        `;
    }

    /**
     * Render date filters configuration
     */
    renderDateConfig() {
        if (!this.elements.dateConfig) return;
        
        const volatileLastModified = this.state.volatile.LastModifiedBetween || [null, null];
        const validatedLastModified = this.state.validated.LastModifiedBetween || [null, null];
        const volatileCreated = this.state.volatile.CreatedBetween || [null, null];
        const validatedCreated = this.state.validated.CreatedBetween || [null, null];
        
        const html = `
            <div class="config-section">
                <div class="date-filter-section">
                    <h5>Last Modified Between</h5>
                    ${this.createDateFilterHTML('LastModified', volatileLastModified, validatedLastModified)}
                </div>
                
                <div class="date-filter-section">
                    <h5>Created Between</h5>
                    ${this.createDateFilterHTML('Created', volatileCreated, validatedCreated)}
                </div>
            </div>
        `;
        
        this.elements.dateConfig.innerHTML = html;
        
        // Setup date input handlers
        this.setupDateInputHandlers();
        
        lucide.createIcons({ parent: this.elements.dateConfig });
    }

    /**
     * Create HTML for date filter
     */
    createDateFilterHTML(filterType, volatile, validated) {
        const [volatileStart, volatileEnd] = volatile;
        const [validatedStart, validatedEnd] = validated;
        const hasValidated = validatedStart || validatedEnd;
        const hasChanges = JSON.stringify(volatile) !== JSON.stringify(validated);
        
        return `
            <div class="date-filter-inputs">
                <div class="date-input-group">
                    <label>From:</label>
                    <input 
                        type="date" 
                        class="date-input" 
                        data-filter="${filterType}" 
                        data-position="0"
                        value="${volatileStart || ''}"
                    >
                </div>
                <div class="date-input-group">
                    <label>To:</label>
                    <input 
                        type="date" 
                        class="date-input" 
                        data-filter="${filterType}" 
                        data-position="1"
                        value="${volatileEnd || ''}"
                    >
                </div>
            </div>
            
            ${hasValidated && hasChanges ? `
                <div class="validated-preview">
                    <h6>Previously Validated:</h6>
                    <div class="validated-dates">
                        <span>${validatedStart || 'Not set'}</span> - <span>${validatedEnd || 'Not set'}</span>
                    </div>
                </div>
            ` : ''}
        `;
    }

    /**
     * Setup date input event handlers
     */
    setupDateInputHandlers() {
        const dateInputs = this.elements.dateConfig.querySelectorAll('.date-input');
        
        dateInputs.forEach(input => {
            input.addEventListener('change', this.handleDateChange.bind(this));
        });
    }

    /**
     * Handle active condition input change
     */
    handleActiveConditionChange(event) {
        if (!this.state.currentObject) return;
        
        const newCondition = event.target.value;
        const config = { ...this.state.volatile };
        config.ActiveCondition = newCondition;
        
        // Update config but don't re-render
        this.state.volatile = config;
        window.objectController?.updateConfig(this.state.currentObject, config);
        // Remove this.renderConfig() call
    }

    /**
     * Handle date input change
     */
    handleDateChange(event) {
        if (!this.state.currentObject) return;
        
        const filterType = event.target.dataset.filter;
        const position = parseInt(event.target.dataset.position);
        const newValue = event.target.value || null;
        
        const config = { ...this.state.volatile };
        
        if (filterType === 'LastModified') {
            if (!config.LastModifiedBetween) config.LastModifiedBetween = [null, null];
            config.LastModifiedBetween[position] = newValue;
        } else if (filterType === 'Created') {
            if (!config.CreatedBetween) config.CreatedBetween = [null, null];
            config.CreatedBetween[position] = newValue;
        }
        
        this.updateVolatileConfig(config);
    }

    /**
     * Update volatile config
     */
    updateVolatileConfig(config) {
        this.state.volatile = config;
        window.objectController?.updateConfig(this.state.currentObject, config);
        
        // Re-render to show updated state
        this.renderConfig();
    }

    /**
     * Clear panel
     */
    clearPanel() {
        this.state.currentObject = null;
        this.state.validated = {};
        this.state.volatile = {};
        
        if (this.elements.activeConfig) {
            this.elements.activeConfig.innerHTML = '<div class="empty-state">Select an object to configure</div>';
        }
        
        if (this.elements.dateConfig) {
            this.elements.dateConfig.innerHTML = '<div class="empty-state">Select an object to configure</div>';
        }
    }

    /**
     * Reset panel
     */
    reset() {
        this.clearPanel();
        this.switchMode('active');
    }

    /**
     * Get configuration summary for validation
     */
    getConfigSummary() {
        if (!this.state.currentObject || !this.state.volatile) {
            return null;
        }
        
        const config = this.state.volatile;
        return {
            object: this.state.currentObject,
            fieldsCount: config.Fields?.length || 0,
            activeFieldsCount: config.Active?.length || 0,
            hasForeignKey: !!config.foreignKey,
            hasActiveCondition: !!config.ActiveCondition,
            hasDateFilters: !!(config.LastModifiedBetween?.[0] || config.LastModifiedBetween?.[1] || 
                              config.CreatedBetween?.[0] || config.CreatedBetween?.[1])
        };
    }
}

// Initialize Panel 3
document.addEventListener('DOMContentLoaded', () => {
    window.panel3Config = new Panel3Config();
});