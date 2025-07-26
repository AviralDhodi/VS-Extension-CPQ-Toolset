/**
 * Object Selection - Frontend Logic
 * Handles object and field selection with foreign key assignment and validation
 */
class ObjectSelection {
    constructor() {
        this.appName = 'Object Selection';
        this.appVersion = '1.0.0';
        this.currentState = 'loading'; // loading, objects-loaded, field-selection
        this.isInExtensionShell = window.parent !== window;
        this.logger = null;
        this.themeReceived = false;

        // Data state
        this.configData = null;
        this.selectedOrgs = [];
        this.commonObjects = [];
        this.selectedObject = null;
        this.objectFields = [];
        this.volatileConfig = {}; // Session storage - work in progress
        this.validatedConfig = {}; // File storage - validated and saved

        // Elements
        this.elements = {
            // Header
            configName: document.getElementById('config-name'),
            orgCount: document.getElementById('org-count'),
            
            // Objects panel
            objectSearch: document.getElementById('object-search'),
            objectsLoading: document.getElementById('objects-loading'),
            objectsError: document.getElementById('objects-error'),
            objectsErrorMessage: document.getElementById('objects-error-message'),
            retryObjectsBtn: document.getElementById('retry-objects-btn'),
            objectsContent: document.getElementById('objects-content'),
            objectsList: document.getElementById('objects-list'),
            
            // Fields panel
            fieldsEmpty: document.getElementById('fields-empty'),
            fieldsLoading: document.getElementById('fields-loading'),
            fieldsContent: document.getElementById('fields-content'),
            selectedObject: document.getElementById('selected-object'),
            fieldCount: document.getElementById('field-count'),
            fieldsList: document.getElementById('fields-list'),
            selectAllFields: document.getElementById('select-all-fields'),
            clearFields: document.getElementById('clear-fields'),
            
            // Config panel
            configStatus: document.getElementById('config-status'),
            configEmpty: document.getElementById('config-empty'),
            configContent: document.getElementById('config-content'),
            objectCount: document.getElementById('object-count'),
            configuredObjects: document.getElementById('configured-objects'),
            validateConfigBtn: document.getElementById('validate-config-btn'),
            
            // Action bar
            backToConfigBtn: document.getElementById('back-to-config-btn'),
            proceedFiltersBtn: document.getElementById('proceed-filters-btn'),
            
            // Modal
            validationModal: document.getElementById('validation-modal'),
            closeValidationModal: document.getElementById('close-validation-modal'),
            validationResults: document.getElementById('validation-results'),
            fixValidationBtn: document.getElementById('fix-validation-btn'),
            saveAnywayBtn: document.getElementById('save-anyway-btn')
        };

        this.init();
    }

    async init() {
        console.log(`🚀 ${this.appName} initializing...`);
        console.log(`📡 In extension shell: ${this.isInExtensionShell}`);
        
        this.setupLogger();
        this.initializeLucideIcons();
        this.setupExtensionCommunication();
        this.bindEvents();
        this.notifyExtensionLoaded();
        this.setInitialState();
        
        // Load configuration and start
        await this.loadConfiguration();
        
        this.logger.info('Object Selection initialized');
    }

    setupLogger() {
        this.logger = {
            log: (level, message, data = null) => {
                const timestamp = new Date().toISOString();
                const formatted = `[${timestamp}] [${level.toUpperCase()}] [${this.appName}] ${message}`;
                
                const colors = {
                    error: 'color: #ef4444; font-weight: bold;',
                    warn: 'color: #f59e0b; font-weight: bold;',
                    info: 'color: #3b82f6; font-weight: bold;',
                    debug: 'color: #8b5cf6; font-weight: bold;',
                    trace: 'color: #64748b; font-weight: bold;'
                };

                console.log(`%c${formatted}`, colors[level] || '');
                
                if (data) {
                    console.log('Data:', data);
                }

                this.postMessageToExtension({
                    type: 'ADD_LOG',
                    data: {
                        app: this.appName,
                        level: level,
                        message: data ? `${message} ${JSON.stringify(data)}` : message,
                        location: 'objectSelection/index.js',
                        timestamp: timestamp
                    }
                });
            },
            error: (message, data) => this.logger.log('error', message, data),
            warn: (message, data) => this.logger.log('warn', message, data),
            info: (message, data) => this.logger.log('info', message, data),
            debug: (message, data) => this.logger.log('debug', message, data),
            trace: (message, data) => this.logger.log('trace', message, data)
        };
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
            this.logger.debug('Lucide icons initialized');
        } else {
            this.logger.warn('Lucide icons not available');
        }
    }

    setupExtensionCommunication() {
        if (!this.isInExtensionShell) {
            this.logger.warn('Not running in Extension Shell - standalone mode');
            return;
        }

        this.logger.info('Extension Shell communication established');

        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) {
                return;
            }

            const { type, theme, variables } = event.data;

            switch (type) {
                case 'THEME_CHANGED':
                    this.logger.info(`Theme changed to: ${theme}`);
                    this.updateTheme(theme, variables);
                    break;
                    
                case 'THEME_DATA':
                    this.logger.info(`Received theme data: ${theme}`, variables);
                    this.updateTheme(theme, variables);
                    this.themeReceived = true;
                    break;
                    
                default:
                    this.logger.trace('Received unknown message type', { type });
            }
        });

        this.requestThemeData();
    }

    requestThemeData() {
        this.postMessageToExtension({
            type: 'REQUEST_THEME'
        });
        this.logger.debug('Requested theme data from shell');
        
        setTimeout(() => {
            if (!this.themeReceived) {
                this.logger.warn('No theme data received from shell, applying default');
                this.updateTheme('light', {});
            }
        }, 2000);
    }

    updateTheme(theme, variables) {
        this.logger.info(`Applying theme: ${theme}`, variables);

        document.body.setAttribute('data-theme', theme);
        
        if (variables) {
            const root = document.documentElement;
            let appliedCount = 0;
            
            Object.entries(variables).forEach(([key, value]) => {
                if (value && value.trim()) {
                    root.style.setProperty(`--app-${key}`, value.trim());
                    appliedCount++;
                }
            });
            
            this.logger.debug(`Applied ${appliedCount} theme variables`);
        }

        document.body.style.display = 'none';
        document.body.offsetHeight;
        document.body.style.display = '';
        
        this.logger.info(`Theme ${theme} applied successfully`);
    }

    postMessageToExtension(message) {
        if (this.isInExtensionShell && window.parent) {
            window.parent.postMessage(message, '*');
        }
    }

    notifyExtensionLoaded() {
        this.postMessageToExtension({
            type: 'APP_LOADED',
            data: { 
                appName: this.appName,
                version: this.appVersion
            }
        });
        this.logger.info('Notified Extension Shell of app load');
    }

    setInitialState() {
        this.setAppState('loading', 'Loading configuration');
        this.setState('loading');
        this.logger.debug('Initial state set');
    }

    setAppState(state, message = '') {
        this.postMessageToExtension({
            type: 'APP_STATE_CHANGED',
            data: { state, message: message || this.capitalizeFirst(state) }
        });
        this.logger.debug('App state changed', { state, message });
    }

    showLoader(text, progress = 0) {
        this.postMessageToExtension({
            type: 'SHOW_LOADER',
            data: { text, progress }
        });
    }

    updateLoader(progress, text = null) {
        this.postMessageToExtension({
            type: 'UPDATE_LOADER',
            data: { progress, text }
        });
    }

    hideLoader() {
        this.postMessageToExtension({
            type: 'HIDE_LOADER'
        });
    }

    setState(newState) {
        this.logger.info(`State transition: ${this.currentState} → ${newState}`);
        this.currentState = newState;
        
        // Update UI based on state
        this.updateUIForState(newState);
    }

    updateUIForState(state) {
        switch (state) {
            case 'loading':
                this.showObjectsLoading(true);
                break;
            case 'objects-loaded':
                this.showObjectsLoading(false);
                this.updateConfigPanel();
                break;
            case 'field-selection':
                this.updateFieldsPanel();
                this.updateConfigPanel();
                break;
        }
    }

    // ========================================
    // CONFIGURATION LOADING
    // ========================================

    async loadConfiguration() {
        this.logger.info('🔄 Loading configuration from URL params');
        
        this.showLoader('Loading configuration...', 10);
        
        try {
            // Get config from URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            const configParam = urlParams.get('config');
            
            if (!configParam) {
                throw new Error('No configuration parameter found in URL');
            }
            
            const configData = JSON.parse(decodeURIComponent(configParam));
            this.configData = configData;
            this.selectedOrgs = configData.selectedOrgs || [];
            
            this.updateLoader(30, 'Configuration loaded');
            
            // Update header info
            this.updateHeaderInfo();
            
            // Load common objects
            await this.loadCommonObjects();
            
            this.hideLoader();
            this.setAppState('idle', 'Object selection ready');
            
        } catch (error) {
            this.logger.error('Failed to load configuration', { error: error.message });
            this.showObjectsError(error.message);
            this.setAppState('error', 'Failed to load configuration');
            this.hideLoader();
        }
    }

    updateHeaderInfo() {
        if (this.elements.configName && this.configData) {
            this.elements.configName.textContent = this.configData.filename || 'Configuration';
        }
        
        if (this.elements.orgCount && this.selectedOrgs) {
            this.elements.orgCount.textContent = `${this.selectedOrgs.length} orgs`;
        }
    }

    async loadCommonObjects() {
        this.logger.info('🔍 Loading common objects across selected orgs');
        
        this.showObjectsLoading(true);
        this.updateLoader(50, 'Loading common objects...');
        
        try {
            const response = await fetch('/data-comparison/api/objects/common', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username),
                    configFilename: this.configData.filename
                })
            });
            
            this.updateLoader(80, 'Processing objects...');
            
            const data = await response.json();
            
            if (data.success) {
                this.commonObjects = data.objects;
                this.renderObjects();
                this.setState('objects-loaded');
                
                this.logger.info('Common objects loaded successfully', { 
                    count: this.commonObjects.length 
                });
            } else {
                throw new Error(data.error || 'Failed to load common objects');
            }
            
        } catch (error) {
            this.logger.error('Failed to load common objects', { error: error.message });
            this.showObjectsError(error.message);
        }
    }

    // ========================================
    // OBJECTS PANEL
    // ========================================

    showObjectsLoading(loading) {
        this.elements.objectsLoading?.classList.toggle('hidden', !loading);
        this.elements.objectsContent?.classList.toggle('hidden', loading);
        this.elements.objectsError?.classList.toggle('hidden', true);
    }

    showObjectsError(message) {
        this.elements.objectsError?.classList.toggle('hidden', false);
        this.elements.objectsLoading?.classList.toggle('hidden', true);
        this.elements.objectsContent?.classList.toggle('hidden', true);
        
        if (this.elements.objectsErrorMessage) {
            this.elements.objectsErrorMessage.textContent = message;
        }
    }

    renderObjects() {
        if (!this.elements.objectsList) return;
        
        this.logger.debug('Rendering objects list', { count: this.commonObjects.length });
        
        const html = this.commonObjects.map(object => {
            const status = this.getObjectStatus(object.name);
            return `
                <div class="object-item ${status.class}" data-object-name="${object.name}">
                    <div class="object-icon">
                        <i data-lucide="database"></i>
                    </div>
                    <div class="object-info">
                        <div class="object-name">${object.name}</div>
                        <div class="object-details">${object.label || object.name}</div>
                    </div>
                    <div class="object-status ${status.class}">
                        <i data-lucide="${status.icon}"></i>
                        <span>${status.text}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.objectsList.innerHTML = html;
        this.initializeLucideIcons();
        this.showObjectsLoading(false);
    }

    getObjectStatus(objectName) {
        if (this.validatedConfig[objectName]) {
            return { class: 'validated', icon: 'check-circle', text: 'Validated' };
        } else if (this.volatileConfig[objectName]) {
            return { class: 'volatile', icon: 'clock', text: 'Pending' };
        }
        return { class: 'pending', icon: 'circle', text: 'Not configured' };
    }

    async handleObjectClick(objectName) {
        this.logger.info('📂 Object selected', { object: objectName });
        
        // Update UI selection
        this.elements.objectsList?.querySelectorAll('.object-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const objectItem = this.elements.objectsList?.querySelector(`[data-object-name="${objectName}"]`);
        objectItem?.classList.add('selected');
        
        // Load fields for this object
        this.selectedObject = objectName;
        await this.loadObjectFields(objectName);
    }

    async loadObjectFields(objectName) {
        this.logger.info('🔍 Loading fields for object', { object: objectName });
        
        this.showFieldsLoading(true);
        this.setAppState('loading', `Loading fields for ${objectName}`);
        this.showLoader(`Loading fields for ${objectName}...`, 0);
        
        try {
            const response = await fetch(`/data-comparison/api/objects/${encodeURIComponent(objectName)}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username)
                })
            });
            
            this.updateLoader(70, 'Processing fields...');
            
            const data = await response.json();
            
            if (data.success) {
                this.objectFields = data.fields;
                this.renderFields();
                this.setState('field-selection');
                this.setAppState('idle', 'Field selection');
                this.hideLoader();
                
                this.logger.info('Object fields loaded successfully', { 
                    object: objectName,
                    count: this.objectFields.length 
                });
            } else {
                throw new Error(data.error || 'Failed to load object fields');
            }
            
        } catch (error) {
            this.logger.error('Failed to load object fields', { error: error.message });
            this.setAppState('error', 'Failed to load fields');
            this.hideLoader();
        }
    }

    // ========================================
    // FIELDS PANEL
    // ========================================

    showFieldsLoading(loading) {
        this.elements.fieldsLoading?.classList.toggle('hidden', !loading);
        this.elements.fieldsContent?.classList.toggle('hidden', loading);
        this.elements.fieldsEmpty?.classList.toggle('hidden', loading);
    }

    renderFields() {
        if (!this.elements.fieldsList || !this.selectedObject) return;
        
        this.logger.debug('Rendering fields list', { 
            object: this.selectedObject,
            count: this.objectFields.length 
        });
        
        // Update toolbar
        if (this.elements.selectedObject) {
            this.elements.selectedObject.textContent = this.selectedObject;
        }
        if (this.elements.fieldCount) {
            this.elements.fieldCount.textContent = `${this.objectFields.length} fields`;
        }
        
        // Get current config for this object
        const currentConfig = this.volatileConfig[this.selectedObject] || {
            fields: [],
            foreignKey: null
        };
        
        // Render fields
        const html = this.objectFields.map(field => {
            const isSelected = currentConfig.fields.includes(field.name);
            const isForeignKey = currentConfig.foreignKey === field.name;
            
            return `
                <div class="field-item" data-field-name="${field.name}">
                    <div class="field-checkbox">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} 
                               data-field-name="${field.name}">
                    </div>
                    <div class="field-info-item">
                        <div class="field-name">${field.name}</div>
                        <div class="field-type">${field.type || 'String'}</div>
                    </div>
                    <div class="field-actions">
                        <button class="star-btn ${isForeignKey ? 'active' : ''}" 
                                data-field-name="${field.name}" 
                                title="Mark as foreign key">
                            <i data-lucide="star"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.fieldsList.innerHTML = html;
        this.initializeLucideIcons();
        this.showFieldsLoading(false);
        
        // Enable controls
        this.elements.selectAllFields.disabled = false;
        this.elements.clearFields.disabled = false;
        
        this.updateConfigPanel();
    }

    handleFieldSelectionChange(fieldName, isSelected) {
        if (!this.selectedObject) return;
        
        // Initialize object config if not exists
        if (!this.volatileConfig[this.selectedObject]) {
            this.volatileConfig[this.selectedObject] = {
                fields: [],
                foreignKey: null
            };
        }
        
        const objectConfig = this.volatileConfig[this.selectedObject];
        
        if (isSelected) {
            if (!objectConfig.fields.includes(fieldName)) {
                objectConfig.fields.push(fieldName);
            }
        } else {
            objectConfig.fields = objectConfig.fields.filter(f => f !== fieldName);
            // If this was the foreign key, remove it
            if (objectConfig.foreignKey === fieldName) {
                objectConfig.foreignKey = null;
            }
        }
        
        this.logger.debug('Field selection changed', {
            object: this.selectedObject,
            field: fieldName,
            selected: isSelected,
            totalFields: objectConfig.fields.length
        });
        
        // Update UI
        this.updateStarButtons();
        this.updateConfigPanel();
        this.saveToSessionStorage();
    }

    handleForeignKeySelection(fieldName) {
        if (!this.selectedObject) return;
        
        // Initialize object config if not exists
        if (!this.volatileConfig[this.selectedObject]) {
            this.volatileConfig[this.selectedObject] = {
                fields: [],
                foreignKey: null
            };
        }
        
        const objectConfig = this.volatileConfig[this.selectedObject];
        
        // Toggle foreign key
        if (objectConfig.foreignKey === fieldName) {
            objectConfig.foreignKey = null;
        } else {
            objectConfig.foreignKey = fieldName;
            // Ensure field is selected
            if (!objectConfig.fields.includes(fieldName)) {
                objectConfig.fields.push(fieldName);
                // Update checkbox
                const checkbox = this.elements.fieldsList?.querySelector(`input[data-field-name="${fieldName}"]`);
                if (checkbox) checkbox.checked = true;
            }
        }
        
        this.logger.debug('Foreign key changed', {
            object: this.selectedObject,
            foreignKey: objectConfig.foreignKey
        });
        
        // Update UI
        this.updateStarButtons();
        this.updateConfigPanel();
        this.saveToSessionStorage();
    }

    updateStarButtons() {
        if (!this.selectedObject || !this.elements.fieldsList) return;
        
        const currentConfig = this.volatileConfig[this.selectedObject];
        const foreignKey = currentConfig?.foreignKey;
        
        this.elements.fieldsList.querySelectorAll('.star-btn').forEach(btn => {
            const fieldName = btn.dataset.fieldName;
            const isSelected = currentConfig?.fields.includes(fieldName);
            
            // Only enable star button if field is selected
            btn.disabled = !isSelected;
            btn.classList.toggle('active', fieldName === foreignKey);
        });
    }

    selectAllFields() {
        if (!this.selectedObject || !this.objectFields) return;
        
        this.logger.info('Selecting all fields', { object: this.selectedObject });
        
        // Initialize config
        if (!this.volatileConfig[this.selectedObject]) {
            this.volatileConfig[this.selectedObject] = {
                fields: [],
                foreignKey: null
            };
        }
        
        // Select all fields
        this.volatileConfig[this.selectedObject].fields = this.objectFields.map(f => f.name);
        
        // Update checkboxes
        this.elements.fieldsList?.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = true;
        });
        
        this.updateStarButtons();
        this.updateConfigPanel();
        this.saveToSessionStorage();
    }

    clearFields() {
        if (!this.selectedObject) return;
        
        this.logger.info('Clearing all fields', { object: this.selectedObject });
        
        // Clear config
        if (this.volatileConfig[this.selectedObject]) {
            this.volatileConfig[this.selectedObject] = {
                fields: [],
                foreignKey: null
            };
        }
        
        // Update checkboxes
        this.elements.fieldsList?.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        
        this.updateStarButtons();
        this.updateConfigPanel();
        this.saveToSessionStorage();
    }

    // ========================================
    // CONFIG PANEL
    // ========================================

    updateConfigPanel() {
        const configuredObjectCount = Object.keys(this.volatileConfig).length;
        const hasConfig = configuredObjectCount > 0;
        
        // Toggle panels
        this.elements.configEmpty?.classList.toggle('hidden', hasConfig);
        this.elements.configContent?.classList.toggle('hidden', !hasConfig);
        
        if (!hasConfig) return;
        
        // Update count
        if (this.elements.objectCount) {
            this.elements.objectCount.textContent = `${configuredObjectCount} objects`;
        }
        
        // Update status
        this.updateConfigStatus();
        
        // Render configured objects
        this.renderConfiguredObjects();
        
        // Update validation button
        this.updateValidationButton();
    }

    updateConfigStatus() {
        const isValid = this.isConfigurationValid();
        const statusElement = this.elements.configStatus;
        
        if (statusElement) {
            const indicator = statusElement.querySelector('.status-indicator');
            const text = statusElement.querySelector('.status-text');
            
            if (isValid) {
                indicator?.classList.remove('pending', 'volatile');
                indicator?.classList.add('validated');
                text.textContent = 'Ready to validate';
            } else {
                indicator?.classList.remove('pending', 'validated');
                indicator?.classList.add('volatile');
                text.textContent = 'Needs configuration';
            }
        }
    }

    renderConfiguredObjects() {
        if (!this.elements.configuredObjects) return;
        
        const html = Object.entries(this.volatileConfig).map(([objectName, config]) => {
            const fieldCount = config.fields.length;
            const hasForeignKey = !!config.foreignKey;
            
            return `
                <div class="config-object">
                    <div class="config-object-header">
                        <div class="config-object-name">${objectName}</div>
                        <div class="config-fk-indicator ${hasForeignKey ? '' : 'missing'}">
                            <i data-lucide="star"></i>
                            <span>${hasForeignKey ? config.foreignKey : 'No foreign key'}</span>
                        </div>
                    </div>
                    <div class="config-field-count">${fieldCount} fields selected</div>
                </div>
            `;
        }).join('');
        
        this.elements.configuredObjects.innerHTML = html;
        this.initializeLucideIcons();
    }

    isConfigurationValid() {
        // Check if all configured objects have:
        // 1. At least one field selected
        // 2. A foreign key selected
        return Object.values(this.volatileConfig).every(config => 
            config.fields.length > 0 && config.foreignKey
        );
    }

    updateValidationButton() {
        const isValid = this.isConfigurationValid();
        const hasConfig = Object.keys(this.volatileConfig).length > 0;
        
        if (this.elements.validateConfigBtn) {
            this.elements.validateConfigBtn.disabled = !hasConfig || !isValid;
        }
        
        if (this.elements.proceedFiltersBtn) {
            this.elements.proceedFiltersBtn.disabled = Object.keys(this.validatedConfig).length === 0;
        }
    }

    // ========================================
    // VALIDATION
    // ========================================

    async validateAndSave() {
        this.logger.info('🔍 Starting validation and save process');
        
        this.setAppState('loading', 'Validating configuration');
        this.showLoader('Running validations...', 0);
        
        try {
            const validationResults = [];
            let validCount = 0;
            
            // Run validation for each configured object
            for (const [objectName, config] of Object.entries(this.volatileConfig)) {
                this.updateLoader(
                    (validCount / Object.keys(this.volatileConfig).length) * 100,
                    `Validating ${objectName}...`
                );
                
                const isValid = await this.validateObjectConfiguration(objectName, config);
                
                if (isValid) {
                    validCount++;
                    // Move to validated config
                    this.validatedConfig[objectName] = { ...config };
                    
                    validationResults.push({
                        object: objectName,
                        isValid: true,
                        message: 'Configuration validated successfully'
                    });
                } else {
                    validationResults.push({
                        object: objectName,
                        isValid: false,
                        message: 'Validation failed - check foreign key and field selection'
                    });
                }
            }
            
            this.updateLoader(100, 'Saving configuration...');
            
            // Save to file if any validations passed
            if (validCount > 0) {
                await this.saveValidatedConfig();
            }
            
            this.hideLoader();
            
            if (validCount === Object.keys(this.volatileConfig).length) {
                this.setAppState('success', 'Configuration validated and saved');
                this.showValidationSuccess(validationResults);
            } else {
                this.setAppState('warning', 'Some validations failed');
                this.showValidationResults(validationResults);
            }
            
        } catch (error) {
            this.logger.error('Validation failed', { error: error.message });
            this.setAppState('error', 'Validation failed');
            this.hideLoader();
        }
    }

    async validateObjectConfiguration(objectName, config) {
        this.logger.debug('Validating object configuration', { object: objectName });
        
        try {
            const response = await fetch('/data-comparison/api/validation/object', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    objectName,
                    config,
                    orgs: this.selectedOrgs.map(org => org.username)
                })
            });
            
            const result = await response.json();
            return result.success && result.isValid;
            
        } catch (error) {
            this.logger.warn('Validation API call failed, using client-side validation', { error: error.message });
            
            // Fallback client-side validation
            return config.fields.length > 0 && 
                   config.foreignKey && 
                   config.fields.includes(config.foreignKey);
        }
    }

    async saveValidatedConfig() {
        this.logger.info('💾 Saving validated configuration to file');
        
        try {
            const response = await fetch('/data-comparison/api/config/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.configData.filename,
                    objects: this.validatedConfig,
                    action: 'add-objects'
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.logger.info('Configuration saved successfully');
                // Clear validated objects from volatile config
                Object.keys(this.validatedConfig).forEach(objectName => {
                    delete this.volatileConfig[objectName];
                });
                this.saveToSessionStorage();
            } else {
                throw new Error(result.error || 'Failed to save configuration');
            }
            
        } catch (error) {
            this.logger.error('Failed to save configuration', { error: error.message });
            throw error;
        }
    }

    showValidationResults(results) {
        if (!this.elements.validationResults) return;
        
        const html = results.map(result => `
            <div class="validation-result ${result.isValid ? 'valid' : 'invalid'}">
                <div class="validation-icon">
                    <i data-lucide="${result.isValid ? 'check-circle' : 'x-circle'}"></i>
                </div>
                <div class="validation-content">
                    <div class="validation-object">${result.object}</div>
                    <div class="validation-message">${result.message}</div>
                </div>
            </div>
        `).join('');
        
        this.elements.validationResults.innerHTML = html;
        this.initializeLucideIcons();
        this.showValidationModal();
    }

    showValidationSuccess(results) {
        this.logger.info('✅ All validations passed');
        
        // Update UI to reflect validated state
        this.updateConfigPanel();
        this.renderObjects(); // Update object status indicators
        
        // Enable proceed button
        this.updateValidationButton();
        
        // Show success feedback
        this.showTemporaryFeedback('Configuration validated and saved successfully!', 'success');
    }

    showValidationModal() {
        this.elements.validationModal?.classList.remove('hidden');
    }

    hideValidationModal() {
        this.elements.validationModal?.classList.add('hidden');
    }

    showTemporaryFeedback(message, type = 'info') {
        // Create temporary feedback element
        const feedback = document.createElement('div');
        feedback.className = `feedback-message ${type}`;
        feedback.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(feedback);
        
        // Add styles
        Object.assign(feedback.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: type === 'success' ? 'var(--app-success)' : 'var(--app-accent)',
            color: 'white',
            padding: '1rem 1.5rem',
            borderRadius: 'var(--app-border-radius)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            zIndex: '2000',
            animation: 'slideIn 0.3s ease'
        });
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        
        setTimeout(() => {
            feedback.remove();
        }, 3000);
    }

    // ========================================
    // SESSION STORAGE
    // ========================================

    saveToSessionStorage() {
        try {
            sessionStorage.setItem('cpq-object-selection-volatile', JSON.stringify(this.volatileConfig));
            this.logger.debug('Volatile config saved to session storage');
        } catch (error) {
            this.logger.warn('Failed to save to session storage', { error: error.message });
        }
    }

    loadFromSessionStorage() {
        try {
            const stored = sessionStorage.getItem('cpq-object-selection-volatile');
            if (stored) {
                this.volatileConfig = JSON.parse(stored);
                this.logger.debug('Volatile config loaded from session storage');
            }
        } catch (error) {
            this.logger.warn('Failed to load from session storage', { error: error.message });
        }
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    bindEvents() {
        this.logger.debug('Binding event listeners');

        // Object search
        this.elements.objectSearch?.addEventListener('input', (e) => {
            this.filterObjects(e.target.value);
        });

        // Objects panel
        this.elements.retryObjectsBtn?.addEventListener('click', () => this.loadCommonObjects());
        
        this.elements.objectsList?.addEventListener('click', (e) => {
            const objectItem = e.target.closest('.object-item');
            if (objectItem) {
                const objectName = objectItem.dataset.objectName;
                this.handleObjectClick(objectName);
            }
        });

        // Fields panel
        this.elements.selectAllFields?.addEventListener('click', () => this.selectAllFields());
        this.elements.clearFields?.addEventListener('click', () => this.clearFields());
        
        this.elements.fieldsList?.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const fieldName = e.target.dataset.fieldName;
                const isSelected = e.target.checked;
                this.handleFieldSelectionChange(fieldName, isSelected);
            }
        });
        
        this.elements.fieldsList?.addEventListener('click', (e) => {
            if (e.target.closest('.star-btn')) {
                const button = e.target.closest('.star-btn');
                const fieldName = button.dataset.fieldName;
                this.handleForeignKeySelection(fieldName);
            }
        });

        // Config panel
        this.elements.validateConfigBtn?.addEventListener('click', () => this.validateAndSave());

        // Action bar
        this.elements.backToConfigBtn?.addEventListener('click', () => this.navigateToConfigGenerator());
        this.elements.proceedFiltersBtn?.addEventListener('click', () => this.navigateToFilters());

        // Modal
        this.elements.closeValidationModal?.addEventListener('click', () => this.hideValidationModal());
        this.elements.fixValidationBtn?.addEventListener('click', () => this.hideValidationModal());
        this.elements.saveAnywayBtn?.addEventListener('click', () => this.saveAnyway());
        
        // Modal overlay
        this.elements.validationModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.validationModal) {
                this.hideValidationModal();
            }
        });

        this.logger.debug('Event listeners bound');
    }

    filterObjects(searchTerm) {
        if (!this.elements.objectsList) return;
        
        const term = searchTerm.toLowerCase();
        const objectItems = this.elements.objectsList.querySelectorAll('.object-item');
        
        objectItems.forEach(item => {
            const objectName = item.querySelector('.object-name')?.textContent.toLowerCase() || '';
            const objectDetails = item.querySelector('.object-details')?.textContent.toLowerCase() || '';
            
            const matches = objectName.includes(term) || objectDetails.includes(term);
            item.style.display = matches ? '' : 'none';
        });
        
        this.logger.debug('Objects filtered', { searchTerm, term });
    }

    navigateToConfigGenerator() {
        this.logger.info('🔙 Navigating back to configuration generator');
        
        if (this.isInExtensionShell && window.parent) {
            window.parent.location.href = '/data-comparison/config-generator';
        } else {
            window.location.href = '/data-comparison/config-generator';
        }
    }

    navigateToFilters() {
        this.logger.info('➡️ Navigating to filter configuration');
        
        // Pass configuration data to filters page
        const filterParams = encodeURIComponent(JSON.stringify({
            filename: this.configData.filename,
            selectedOrgs: this.selectedOrgs,
            validatedConfig: this.validatedConfig
        }));
        
        const url = `/data-comparison/filter-configuration?config=${filterParams}`;
        
        if (this.isInExtensionShell && window.parent) {
            window.parent.location.href = url;
        } else {
            window.location.href = url;
        }
    }

    async saveAnyway() {
        this.logger.warn('⚠️ Saving configuration despite validation warnings');
        
        try {
            // Move all volatile config to validated
            Object.assign(this.validatedConfig, this.volatileConfig);
            await this.saveValidatedConfig();
            
            this.hideValidationModal();
            this.showTemporaryFeedback('Configuration saved with warnings', 'warning');
            this.updateValidationButton();
            
        } catch (error) {
            this.logger.error('Failed to save anyway', { error: error.message });
        }
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Public API
    getAppInfo() {
        return {
            name: this.appName,
            version: this.appVersion,
            state: this.currentState,
            isConnected: this.isInExtensionShell,
            themeReceived: this.themeReceived,
            configData: this.configData,
            volatileConfig: this.volatileConfig,
            validatedConfig: this.validatedConfig
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing Object Selection...');
    window.objectSelection = new ObjectSelection();
});

// Global API
window.ObjectSelection = {
    getAppInfo: () => window.objectSelection?.getAppInfo(),
    setTheme: (theme, variables) => window.objectSelection?.updateTheme(theme, variables)
};