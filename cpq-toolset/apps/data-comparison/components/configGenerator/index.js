/**
 * Configuration Generator - Frontend Logic
 * Integrates with extension shell and orchestrates config creation flow
 */
class ConfigGenerator {
    constructor() {
        this.appName = 'Configuration Generator';
        this.appVersion = '1.0.0';
        this.currentState = 'org-selection'; // org-selection, config-creation
        this.isInExtensionShell = window.parent !== window;
        this.logger = null;
        this.themeReceived = false;

        // Data state
        this.organizations = [];
        this.selectedOrgs = [];
        this.configData = null;
        this.sfdxProgress = {
            current: 0,
            total: 0,
            commands: []
        };

        // Objects & Fields state
        this.commonObjects = [];
        this.selectedObject = null;
        this.objectFields = [];
        
        // Config management (v1 pattern) - always ensure they're initialized
        this.config = {
            validated: {}, // Config from file
            volatile: {}   // In-memory working copy
        };
        
        // Ensure configs are always initialized as objects (defensive programming like v1)
        this.initializeConfigs();
        
        this.searchFilters = {
            objects: '',
            fields: ''
        };
        
        // Reference navigation stack
        this.navigationStack = [];
        this.currentReferenceContext = null;

        // Elements
        this.elements = {
            // Steps
            stepOrgs: document.getElementById('step-orgs'),
            stepConfig: document.getElementById('step-config'),
            stepObjects: document.getElementById('step-objects'),
            stepFilters: document.getElementById('step-filters'),
            
            // States
            setupStates: document.getElementById('setup-states'),
            orgSelectionState: document.getElementById('org-selection-state'),
            configCreationState: document.getElementById('config-creation-state'),
            objectsFieldsState: document.getElementById('objects-fields-state'),
            
            // Org Selection
            orgsLoading: document.getElementById('orgs-loading'),
            orgsError: document.getElementById('orgs-error'),
            orgsContent: document.getElementById('orgs-content'),
            orgsErrorMessage: document.getElementById('orgs-error-message'),
            retryOrgsBtn: document.getElementById('retry-orgs-btn'),
            selectionCount: document.getElementById('selection-count'),
            selectAllOrgs: document.getElementById('select-all-orgs'),
            clearOrgs: document.getElementById('clear-orgs'),
            orgsList: document.getElementById('orgs-list'),
            validateOrgsBtn: document.getElementById('validate-orgs-btn'),
            proceedConfigBtn: document.getElementById('proceed-config-btn'),
            validationResults: document.getElementById('validation-results'),
            validationList: document.getElementById('validation-list'),
            
            // Config Creation
            configProgressTitle: document.getElementById('config-progress-title'),
            configProgressDetails: document.getElementById('config-progress-details'),
            configProgressFill: document.getElementById('config-progress-fill'),
            configProgressPercentage: document.getElementById('config-progress-percentage'),
            configProgressCommands: document.getElementById('config-progress-commands'),
            toggleSfdxLog: document.getElementById('toggle-sfdx-log'),
            sfdxLogContent: document.getElementById('sfdx-log-content'),
            configSuccess: document.getElementById('config-success'),
            configError: document.getElementById('config-error'),
            configErrorMessage: document.getElementById('config-error-message'),
            configFilename: document.getElementById('config-filename'),
            configOrgsCount: document.getElementById('config-orgs-count'),
            configCreatedTime: document.getElementById('config-created-time'),
            startObjectSelectionBtn: document.getElementById('start-object-selection-btn'),
            createAnotherConfigBtn: document.getElementById('create-another-config-btn'),
            retryConfigBtn: document.getElementById('retry-config-btn'),
            backToOrgsBtn: document.getElementById('back-to-orgs-btn'),

            // Objects & Fields Selection
            activeConfigFile: document.getElementById('active-config-file'),
            activeOrgsCount: document.getElementById('active-orgs-count'),
            objectsSearch: document.getElementById('objects-search'),
            objectsCount: document.getElementById('objects-count'),
            objectsLoadingState: document.getElementById('objects-loading'),
            objectsErrorState: document.getElementById('objects-error'),
            objectsErrorMessage2: document.getElementById('objects-error-message'),
            retryObjectsBtn: document.getElementById('retry-objects-btn'),
            objectsContentState: document.getElementById('objects-content'),
            objectsList2: document.getElementById('objects-list'),
            
            selectedObjectName: document.getElementById('selected-object-name'),
            selectAllFields: document.getElementById('select-all-fields'),
            clearAllFields: document.getElementById('clear-all-fields'),
            fieldsEmpty: document.getElementById('fields-empty'),
            fieldsLoading: document.getElementById('fields-loading'),
            fieldsContent: document.getElementById('fields-content'),
            fieldsSearch: document.getElementById('fields-search'),
            fieldsCount: document.getElementById('fields-count'),
            fieldsList: document.getElementById('fields-list'),
            foreignKeyInfo: document.getElementById('foreign-key-info'),

            configuredObjectsCount: document.getElementById('configured-objects-count'),
            totalFieldsCount: document.getElementById('total-fields-count'),
            foreignKeysCount: document.getElementById('foreign-keys-count'),
            configuredObjectsList: document.getElementById('configured-objects-list'),

            backToConfigBtn: document.getElementById('back-to-config-btn'),
            validateAndSaveBtn: document.getElementById('validate-and-save-btn'),
            proceedToFiltersBtn: document.getElementById('proceed-to-filters-btn')
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
        
        // Check for existing configuration first
        const existingConfig = this.checkForExistingConfig();
        
        if (existingConfig) {
            this.logger.info('🔄 Restoring existing configuration', existingConfig);
            await this.restoreExistingConfiguration(existingConfig);
        } else {
            this.logger.info('🆕 Starting fresh configuration');
            this.setInitialState();
            await this.loadOrganizations();
            this.loadFromSessionStorage();
        }
        
        this.logger.info('Configuration Generator initialized');
    }

    checkForExistingConfig() {
        // Check URL parameters for config
        const urlParams = new URLSearchParams(window.location.search);
        const configParam = urlParams.get('config');
        if (configParam) {
            return { filename: configParam, source: 'url' };
        }
        
        // Check session storage for active config
        const sessionConfig = sessionStorage.getItem('cpq-config-active');
        if (sessionConfig) {
            try {
                const parsed = JSON.parse(sessionConfig);
                if (parsed.filename && parsed.state) {
                    return { ...parsed, source: 'session' };
                }
            } catch (error) {
                this.logger.warn('Invalid session config data', error);
            }
        }
        
        return null;
    }

    async restoreExistingConfiguration(existingConfig) {
        try {
            // Load the configuration file
            await this.loadValidatedConfig(existingConfig.filename);
            
            // Restore session state
            this.loadFromSessionStorage();
            
            // Restore application state
            const targetState = existingConfig.state || 'objects-fields';
            this.configData = { configFilename: existingConfig.filename };
            
            if (existingConfig.selectedOrgs) {
                this.selectedOrgs = existingConfig.selectedOrgs;
            }
            
            // Update header with config info
            this.updateHeaderInfo();
            
            // Jump directly to objects-fields selection
            this.setState(targetState);
            
            if (targetState === 'objects-fields') {
                await this.startObjectsFieldsSelection();
            }
            
        } catch (error) {
            this.logger.error('Failed to restore configuration', error);
            // Fall back to fresh start
            this.setInitialState();
            await this.loadOrganizations();
            this.loadFromSessionStorage();
        }
    }

    saveActiveConfigToSession() {
        if (this.configData?.configFilename) {
            const activeConfig = {
                filename: this.configData.configFilename,
                state: this.currentState,
                selectedOrgs: this.selectedOrgs,
                timestamp: new Date().toISOString()
            };
            sessionStorage.setItem('cpq-config-active', JSON.stringify(activeConfig));
        }
    }

    updateHeaderInfo() {
        const headerInfo = document.getElementById('active-config-info');
        if (headerInfo) {
            if (this.configData?.configFilename) {
                const orgCount = this.selectedOrgs?.length || 0;
                headerInfo.textContent = `${this.configData.configFilename} (${orgCount} orgs)`;
            } else {
                headerInfo.textContent = 'No active configuration';
            }
        }
    }

    setupLogger() {
        // Browser-compatible logger that communicates with Extension Shell
        this.logger = {
            log: (level, message, data = null) => {
                const timestamp = new Date().toISOString();
                const formatted = `[${timestamp}] [${level.toUpperCase()}] [${this.appName}] ${message}`;
                
                // Console output with colors
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

                // Send to Extension Shell
                this.postMessageToExtension({
                    type: 'ADD_LOG',
                    data: {
                        app: this.appName,
                        level: level,
                        message: data ? `${message} ${JSON.stringify(data)}` : message,
                        location: 'configGenerator/index.js',
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

        // Listen for messages from Extension Shell
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

        // Request initial theme data
        this.requestThemeData();
    }

    requestThemeData() {
        this.postMessageToExtension({
            type: 'REQUEST_THEME'
        });
        this.logger.debug('Requested theme data from shell');
        
        // Fallback: if no theme received in 2 seconds, apply default
        setTimeout(() => {
            if (!this.themeReceived) {
                this.logger.warn('No theme data received from shell, applying default');
                this.updateTheme('light', {});
            }
        }, 2000);
    }

    updateTheme(theme, variables) {
        this.logger.info(`Applying theme: ${theme}`, variables);

        // Apply theme class to body
        document.body.setAttribute('data-theme', theme);
        
        // Apply theme variables if provided
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

        // Force repaint
        document.body.style.display = 'none';
        document.body.offsetHeight; // Trigger reflow
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
        this.setAppState('loading', 'Initializing configuration generator');
        this.setState('org-selection');
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

    bindEvents() {
        this.logger.debug('Binding event listeners');

        // Org Selection Events
        this.elements.retryOrgsBtn?.addEventListener('click', () => this.loadOrganizations());
        this.elements.selectAllOrgs?.addEventListener('click', () => this.selectAllOrganizations());
        this.elements.clearOrgs?.addEventListener('click', () => this.clearOrgSelection());
        this.elements.validateOrgsBtn?.addEventListener('click', () => this.validateOrganizations());
        this.elements.proceedConfigBtn?.addEventListener('click', () => this.proceedToConfigCreation());

        // Config Creation Events
        this.elements.toggleSfdxLog?.addEventListener('click', () => this.toggleSfdxLog());
        this.elements.startObjectSelectionBtn?.addEventListener('click', () => this.startObjectsFieldsSelection());
        this.elements.createAnotherConfigBtn?.addEventListener('click', () => this.resetGenerator());
        this.elements.retryConfigBtn?.addEventListener('click', () => this.retryConfigGeneration());
        this.elements.backToOrgsBtn?.addEventListener('click', () => this.backToOrgSelection());

        // Objects & Fields Events
        this.elements.objectsSearch?.addEventListener('input', (e) => this.handleObjectsSearch(e));
        this.elements.retryObjectsBtn?.addEventListener('click', () => this.loadCommonObjects());
        this.elements.objectsList2?.addEventListener('click', (e) => this.handleObjectClick(e));
        this.elements.fieldsSearch?.addEventListener('input', (e) => this.handleFieldsSearch(e));
        this.elements.selectAllFields?.addEventListener('click', () => this.selectAllFields());
        this.elements.clearAllFields?.addEventListener('click', () => this.clearAllFields());
        this.elements.fieldsList?.addEventListener('click', (e) => this.handleFieldClick(e));
        
        // Reference navigation events
        document.getElementById('back-to-parent-btn')?.addEventListener('click', () => this.navigateBack());
        this.elements.backToConfigBtn?.addEventListener('click', () => this.backToConfigCreation());
        this.elements.validateAndSaveBtn?.addEventListener('click', () => this.validateAndSaveConfig());
        this.elements.proceedToFiltersBtn?.addEventListener('click', () => this.proceedToFilters());

        // Org list delegation
        this.elements.orgsList?.addEventListener('click', (e) => this.handleOrgClick(e));
        this.elements.orgsList?.addEventListener('change', (e) => this.handleOrgChange(e));

        this.logger.debug('Event listeners bound');
    }

    // ========================================
    // STATE MANAGEMENT
    // ========================================

    setState(newState) {
        this.logger.info(`State transition: ${this.currentState} → ${newState}`);
        
        this.currentState = newState;
        
        // Save current state to session
        this.saveActiveConfigToSession();
        
        // Show/hide state panels
        this.elements.setupStates?.classList.toggle('hidden', newState === 'objects-fields');
        this.elements.orgSelectionState?.classList.toggle('hidden', newState !== 'org-selection');
        this.elements.configCreationState?.classList.toggle('hidden', newState !== 'config-creation');
        this.elements.objectsFieldsState?.classList.toggle('hidden', newState !== 'objects-fields');
        this.elements.stepFilters?.classList.toggle('completed', false);
        
        // Update state containers
        this.elements.orgSelectionState?.classList.toggle('active', newState === 'org-selection');
        this.elements.configCreationState?.classList.toggle('active', newState === 'config-creation');
        this.elements.objectsFieldsState?.classList.toggle('active', newState === 'objects-fields');
        
        // Update app state in shell
        if (newState === 'org-selection') {
            this.setAppState('idle', 'Org Selection');
        } else if (newState === 'config-creation') {
            this.setAppState('loading', 'Generate Configuration');
        } else if (newState === 'objects-fields') {
            this.setAppState('idle', 'Objects & Fields Selection');
        }
    }

    // ========================================
    // ORG SELECTION LOGIC
    // ========================================

    async loadOrganizations() {
        this.logger.info('🔄 Loading organizations from SFDX');
        
        this.showOrgLoading(true);
        this.setAppState('loading', 'Loading organizations');
        this.showLoader('Loading authenticated organizations...', 10);

        try {
            const response = await fetch('/data-comparison/api/data-comparison/orgs');
            const data = await response.json();
            
            this.updateLoader(70, 'Processing organization data...');
            
            if (data.success && data.orgs) {
                this.organizations = data.orgs;
                this.showOrgLoading(false);
                this.renderOrganizations();
                this.setAppState('idle', 'Org Selection');
                this.hideLoader();
                
                this.logger.info('Organizations loaded successfully', { 
                    count: this.organizations.length 
                });
            } else {
                throw new Error(data.error || 'Failed to load organizations');
            }
            
        } catch (error) {
            this.logger.error('Failed to load organizations', { error: error.message });
            this.showOrgError(error.message);
            this.setAppState('error', 'Failed to load organizations');
            this.hideLoader();
        }
    }

    showOrgLoading(loading) {
        this.elements.orgsLoading?.classList.toggle('hidden', !loading);
        this.elements.orgsContent?.classList.toggle('hidden', loading);
        this.elements.orgsError?.classList.toggle('hidden', true);
    }

    showOrgError(message) {
        this.elements.orgsError?.classList.toggle('hidden', false);
        this.elements.orgsLoading?.classList.toggle('hidden', true);
        this.elements.orgsContent?.classList.toggle('hidden', true);
        
        if (this.elements.orgsErrorMessage) {
            this.elements.orgsErrorMessage.textContent = message;
        }
    }

    renderOrganizations() {
        if (!this.elements.orgsList) return;
        
        this.logger.debug('Rendering organizations list', { count: this.organizations.length });
        
        const html = this.organizations.map((org, index) => `
            <div class="org-item" data-org-index="${index}">
                <div class="org-checkbox">
                    <input type="checkbox" id="org-${index}" data-org-index="${index}">
                </div>
                <div class="org-info">
                    <div class="org-name">${org.alias || org.username}</div>
                    <div class="org-details">
                        <span class="org-username">${org.username}</span>
                        <span class="org-status ${org.connectedStatus === 'Connected' ? 'connected' : 'disconnected'}">
                            ${org.connectedStatus}
                        </span>
                    </div>
                </div>
                <div class="org-actions">
                    <span class="org-type">${org.orgType || 'Production'}</span>
                </div>
            </div>
        `).join('');
        
        this.elements.orgsList.innerHTML = html;
        this.initializeLucideIcons();
        this.updateSelectionCount();
    }

    handleOrgClick(event) {
        const orgItem = event.target.closest('.org-item');
        if (!orgItem || event.target.type === 'checkbox') return;
        
        const checkbox = orgItem.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            this.handleOrgChange({ target: checkbox });
        }
    }

    handleOrgChange(event) {
        if (event.target.type !== 'checkbox') return;
        
        const orgIndex = parseInt(event.target.dataset.orgIndex);
        const isChecked = event.target.checked;
        const orgItem = event.target.closest('.org-item');
        
        orgItem?.classList.toggle('selected', isChecked);
        
        if (isChecked) {
            if (!this.selectedOrgs.some(org => org.username === this.organizations[orgIndex].username)) {
                this.selectedOrgs.push(this.organizations[orgIndex]);
            }
        } else {
            this.selectedOrgs = this.selectedOrgs.filter(
                org => org.username !== this.organizations[orgIndex].username
            );
        }
        
        this.updateSelectionCount();
        this.logger.debug('Org selection changed', { 
            selected: this.selectedOrgs.length,
            org: this.organizations[orgIndex].username,
            action: isChecked ? 'selected' : 'deselected'
        });
    }

    selectAllOrganizations() {
        this.logger.info('Selecting all organizations');
        
        const checkboxes = this.elements.orgsList?.querySelectorAll('input[type="checkbox"]');
        checkboxes?.forEach(checkbox => {
            checkbox.checked = true;
            const orgIndex = parseInt(checkbox.dataset.orgIndex);
            if (!this.selectedOrgs.some(org => org.username === this.organizations[orgIndex].username)) {
                this.selectedOrgs.push(this.organizations[orgIndex]);
            }
            checkbox.closest('.org-item')?.classList.add('selected');
        });
        
        this.updateSelectionCount();
    }

    clearOrgSelection() {
        this.logger.info('Clearing org selection');
        
        const checkboxes = this.elements.orgsList?.querySelectorAll('input[type="checkbox"]');
        checkboxes?.forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.org-item')?.classList.remove('selected');
        });
        
        this.selectedOrgs = [];
        this.updateSelectionCount();
        this.hideValidationResults();
    }

    updateSelectionCount() {
        const count = this.selectedOrgs.length;
        const hasMinimum = count >= 2;
        
        if (this.elements.selectionCount) {
            const text = count === 0 
                ? '0 organizations selected'
                : count === 1
                ? '1 organization selected'
                : `${count} organizations selected`;
            
            this.elements.selectionCount.textContent = text;
        }
        
        // Update button states
        if (this.elements.validateOrgsBtn) {
            this.elements.validateOrgsBtn.disabled = !hasMinimum;
        }
        if (this.elements.proceedConfigBtn) {
            this.elements.proceedConfigBtn.disabled = !hasMinimum;
        }
        
        this.logger.debug('Selection count updated', { count, hasMinimum });
    }

    async validateOrganizations() {
        this.logger.info('🔍 Validating selected organizations', { count: this.selectedOrgs.length });
        
        this.setAppState('loading', 'Validating organizations');
        this.showLoader('Validating org connections...', 0);
        
        try {
            const response = await fetch('/data-comparison/api/data-comparison/orgs/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgs: this.selectedOrgs })
            });
            
            this.updateLoader(70, 'Processing validation results...');
            
            const data = await response.json();
            
            if (data.success) {
                this.showValidationResults(data.validationResults);
                this.setAppState('success', `${data.validCount} orgs validated`);
                this.hideLoader();
                
                this.logger.info('Org validation completed', { 
                    valid: data.validCount,
                    invalid: data.invalidCount
                });
            } else {
                throw new Error(data.error || 'Validation failed');
            }
            
        } catch (error) {
            this.logger.error('Org validation failed', { error: error.message });
            this.setAppState('error', 'Validation failed');
            this.hideLoader();
        }
    }

    showValidationResults(results) {
        if (!this.elements.validationResults || !this.elements.validationList) return;
        
        const html = results.map(result => `
            <div class="validation-item ${result.isValid ? 'valid' : 'invalid'}">
                <i data-lucide="${result.isValid ? 'check-circle' : 'x-circle'}" class="validation-icon"></i>
                <span class="validation-org">${result.org}</span>
                <span class="validation-message">${result.message}</span>
            </div>
        `).join('');
        
        this.elements.validationList.innerHTML = html;
        this.elements.validationResults.classList.remove('hidden');
        this.initializeLucideIcons();
    }

    hideValidationResults() {
        this.elements.validationResults?.classList.add('hidden');
    }

    async proceedToConfigCreation() {
        this.logger.info('🚀 Proceeding to configuration creation');
        
        this.setState('config-creation');
        
        // Start config generation
        await this.generateConfiguration();
    }

    // ========================================
    // CONFIG CREATION LOGIC
    // ========================================

    async generateConfiguration() {
        this.logger.info('⚙️ Generating configuration', { orgs: this.selectedOrgs.length });
        
        this.setAppState('loading', 'Generate Configuration');
        this.showConfigProgress('Initializing configuration generation...', 0, 0, 1);
        
        try {
            // Simulate SFDX progress
            this.updateSfdxProgress(1, 3, 'Starting configuration generator...');
            
            const response = await fetch('/data-comparison/api/data-comparison/config/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedOrgs: this.selectedOrgs })
            });
            
            this.updateSfdxProgress(2, 3, 'Processing organization data...');
            
            const data = await response.json();
            
            if (data.success) {
                this.updateSfdxProgress(3, 3, 'Configuration file created successfully');
                this.configData = data;
                
                // Load validated config from generated file (v1 pattern)
                await this.loadValidatedConfig(data.configFilename);
                
                this.showConfigSuccess(data);
                this.setAppState('success', 'Configuration generated');
                
                this.logger.info('Configuration generated successfully', { 
                    filename: data.configFilename,
                    orgs: this.selectedOrgs.length
                });
            } else {
                throw new Error(data.error || 'Configuration generation failed');
            }
            
        } catch (error) {
            this.logger.error('Config generation failed', { error: error.message });
            this.showConfigError(error.message);
            this.setAppState('error', 'Configuration generation failed');
        }
    }

    updateSfdxProgress(current, total, message) {
        this.sfdxProgress.current = current;
        this.sfdxProgress.total = total;
        
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        this.showConfigProgress(message, percentage, current, total);
        this.addSfdxLogEntry(message);
        
        // Update shell loader
        this.updateLoader(percentage, message);
        
        this.logger.debug('SFDX progress updated', { current, total, percentage, message });
    }

    showConfigProgress(title, percentage, current, total) {
        if (this.elements.configProgressTitle) {
            this.elements.configProgressTitle.textContent = title;
        }
        if (this.elements.configProgressDetails) {
            this.elements.configProgressDetails.textContent = 'Executing SFDX commands and processing data';
        }
        if (this.elements.configProgressFill) {
            this.elements.configProgressFill.style.width = `${percentage}%`;
        }
        if (this.elements.configProgressPercentage) {
            this.elements.configProgressPercentage.textContent = `${percentage}%`;
        }
        if (this.elements.configProgressCommands) {
            this.elements.configProgressCommands.textContent = `${current} / ${total} commands`;
        }
    }

    addSfdxLogEntry(message) {
        if (!this.elements.sfdxLogContent) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry info';
        logEntry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-message">${message}</span>
        `;
        
        this.elements.sfdxLogContent.appendChild(logEntry);
        
        // Auto-scroll to bottom
        this.elements.sfdxLogContent.scrollTop = this.elements.sfdxLogContent.scrollHeight;
    }

    toggleSfdxLog() {
        const isHidden = this.elements.sfdxLogContent?.classList.contains('hidden');
        
        this.elements.sfdxLogContent?.classList.toggle('hidden');
        
        const toggleButton = this.elements.toggleSfdxLog;
        if (toggleButton) {
            const icon = toggleButton.querySelector('i');
            const text = toggleButton.querySelector('span') || toggleButton;
            
            if (isHidden) {
                icon?.setAttribute('data-lucide', 'chevron-up');
                if (text.textContent) text.textContent = 'Hide Details';
            } else {
                icon?.setAttribute('data-lucide', 'chevron-down');
                if (text.textContent) text.textContent = 'Show Details';
            }
            
            this.initializeLucideIcons();
        }
    }

    showConfigSuccess(data) {
        this.elements.configSuccess?.classList.remove('hidden');
        this.elements.configError?.classList.add('hidden');
        
        if (this.elements.configFilename) {
            this.elements.configFilename.textContent = data.configFilename;
        }
        if (this.elements.configOrgsCount) {
            this.elements.configOrgsCount.textContent = this.selectedOrgs.length.toString();
        }
        if (this.elements.configCreatedTime) {
            this.elements.configCreatedTime.textContent = data.summary?.created 
                ? new Date(data.summary.created).toLocaleString()
                : new Date().toLocaleString();
        }
        
        this.hideLoader();
        
        // Automatically proceed to Objects & Fields selection after brief success display
        this.logger.info('🎯 Auto-proceeding to Objects & Fields selection');
        setTimeout(async () => {
            await this.startObjectsFieldsSelection();
        }, 1500); // 1.5 second delay to show success message
    }

    showConfigError(message) {
        this.elements.configError?.classList.remove('hidden');
        this.elements.configSuccess?.classList.add('hidden');
        
        if (this.elements.configErrorMessage) {
            this.elements.configErrorMessage.textContent = message;
        }
        
        this.hideLoader();
    }

    async startObjectsFieldsSelection() {
        try {
            this.logger.info('🎯 Starting objects & fields selection phase');
            
            if (!this.configData?.configFilename) {
                this.logger.error('No config data available for object selection');
                this.setAppState('error', 'Configuration data missing');
                return;
            }

            if (!this.selectedOrgs || this.selectedOrgs.length < 2) {
                this.logger.error('Insufficient organizations selected');
                this.setAppState('error', 'Need at least 2 organizations');
                return;
            }

            // Transition to objects-fields state
            this.setState('objects-fields');
            
            // Update config info
            if (this.elements.activeConfigFile) {
                this.elements.activeConfigFile.textContent = `Config file: ${this.configData.configFilename}`;
            }
            if (this.elements.activeOrgsCount) {
                this.elements.activeOrgsCount.textContent = `${this.selectedOrgs.length} organizations`;
            }

            // Load common objects
            await this.loadCommonObjects();
            
        } catch (error) {
            this.logger.error('Failed to start objects & fields selection', { error: error.message });
            this.setAppState('error', 'Failed to load objects & fields');
            
            // Show error in UI
            this.showObjectsError(`Failed to initialize: ${error.message}`);
        }
    }

    // ========================================
    // OBJECTS & FIELDS SELECTION LOGIC
    // ========================================

    async loadCommonObjects() {
        this.logger.info('🔄 Loading common objects across organizations');
        
        this.showObjectsLoading(true);
        this.setAppState('loading', 'Loading common objects');
        this.showLoader('Fetching common objects across organizations...', 10);

        try {
            const response = await fetch('/data-comparison/api/objects/common', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username),
                    configFilename: this.configData.configFilename
                })
            });
            
            this.updateLoader(70, 'Processing objects...');
            
            const data = await response.json();
            
            if (data.success && data.objects) {
                this.commonObjects = data.objects;
                this.renderObjects();
                this.setAppState('idle', 'Objects loaded');
                this.hideLoader();
                
                this.logger.info('Common objects loaded successfully', { 
                    count: this.commonObjects.length 
                });
            } else {
                throw new Error(data.error || 'Failed to load common objects');
            }
            
        } catch (error) {
            this.logger.error('Failed to load common objects', { error: error.message });
            this.showObjectsError(error.message);
            this.setAppState('error', 'Failed to load objects');
            this.hideLoader();
        }
    }

    showObjectsLoading(loading) {
        this.elements.objectsLoadingState?.classList.toggle('hidden', !loading);
        this.elements.objectsContentState?.classList.toggle('hidden', loading);
        this.elements.objectsErrorState?.classList.toggle('hidden', true);
    }

    showObjectsError(message) {
        this.elements.objectsErrorState?.classList.toggle('hidden', false);
        this.elements.objectsLoadingState?.classList.toggle('hidden', true);
        this.elements.objectsContentState?.classList.toggle('hidden', true);
        
        if (this.elements.objectsErrorMessage2) {
            this.elements.objectsErrorMessage2.textContent = message;
        }
    }

    renderObjects() {
        if (!this.elements.objectsList2) return;
        
        this.logger.debug('Rendering objects list', { count: this.commonObjects.length });
        
        // Update objects count
        if (this.elements.objectsCount) {
            this.elements.objectsCount.textContent = `${this.commonObjects.length} common objects`;
        }
        
        // Filter objects based on search
        const filteredObjects = this.getFilteredObjects();
        
        const html = filteredObjects.map(object => {
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
        
        this.elements.objectsList2.innerHTML = html;
        this.initializeLucideIcons();
        this.showObjectsLoading(false);
    }

    getFilteredObjects() {
        if (!this.searchFilters.objects) return this.commonObjects;
        
        const searchTerm = this.searchFilters.objects.toLowerCase();
        return this.commonObjects.filter(obj => 
            obj.name.toLowerCase().includes(searchTerm) ||
            (obj.label && obj.label.toLowerCase().includes(searchTerm))
        );
    }

    getObjectStatus(objectName) {
        if (this.config.volatile[objectName]?.validated) {
            return { class: 'validated', icon: 'check-circle', text: 'Validated' };
        } else if (this.config.volatile[objectName]) {
            return { class: 'volatile', icon: 'clock', text: 'Configured' };
        }
        return { class: 'pending', icon: 'circle', text: 'Not configured' };
    }

    handleObjectsSearch(event) {
        this.searchFilters.objects = event.target.value;
        this.renderObjects();
    }

    async handleObjectClick(event) {
        const objectItem = event.target.closest('.object-item');
        if (!objectItem) return;
        
        const objectName = objectItem.dataset.objectName;
        if (!objectName) return;
        
        this.logger.info('📂 Object selected', { object: objectName });
        
        // Update UI selection
        this.elements.objectsList2?.querySelectorAll('.object-item').forEach(item => {
            item.classList.remove('selected');
        });
        objectItem.classList.add('selected');
        
        // Load fields for this object
        this.selectedObject = objectName;
        await this.loadObjectFields(objectName);
    }

    async loadObjectFields(objectName) {
        this.logger.info('📋 Loading fields for object', { object: objectName });
        
        this.showFieldsLoading(true);
        this.setAppState('loading', `Loading ${objectName} fields`);
        this.showLoader(`Loading fields for ${objectName}...`, 30);

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
            
            if (data.success && data.fields) {
                this.objectFields = data.fields;
                this.renderFields();
                this.setAppState('idle', 'Fields loaded');
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
            this.showFieldsError(error.message);
            this.setAppState('error', 'Failed to load fields');
            this.hideLoader();
        }
    }

    showFieldsLoading(loading) {
        this.elements.fieldsLoading?.classList.toggle('hidden', !loading);
        this.elements.fieldsContent?.classList.toggle('hidden', loading);
        this.elements.fieldsEmpty?.classList.toggle('hidden', loading || this.selectedObject);
    }

    showFieldsError(message) {
        // Show error in fields area
        if (this.elements.fieldsContent) {
            this.elements.fieldsContent.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">
                        <i data-lucide="alert-circle"></i>
                    </div>
                    <p>${message}</p>
                </div>
            `;
            this.elements.fieldsContent.classList.remove('hidden');
        }
        this.elements.fieldsLoading?.classList.add('hidden');
        this.elements.fieldsEmpty?.classList.add('hidden');
    }

    renderFields() {
        if (!this.elements.fieldsList || !this.selectedObject) return;
        
        this.logger.debug('Rendering fields list', { 
            object: this.selectedObject,
            count: this.objectFields.length 
        });
        
        // Update selected object name
        if (this.elements.selectedObjectName) {
            this.elements.selectedObjectName.textContent = this.selectedObject;
        }
        
        // Update fields count
        const filteredFields = this.getFilteredFields();
        if (this.elements.fieldsCount) {
            this.elements.fieldsCount.textContent = `${filteredFields.length} fields`;
        }
        
        // Update configuration summary
        this.updateConfigSummary();
        
        // Get current volatile config for this object
        const currentConfig = this.getVolatileConfig();
        
        // Get lookup fields for this object
        const lookupFields = this.getLookupFields();
        
        // Render regular fields
        const fieldsHtml = filteredFields.map(field => {
            const isSelected = currentConfig.Fields.includes(field.name);
            const isForeignKey = currentConfig.foreignKey === field.name;
            const isValidated = this.isFieldValidated(field.name);
            const isVolatile = this.isFieldVolatile(field.name);
            const isReference = field.type === 'reference';
            const isExternalId = field.externalId === true;
            
            // Skip system reference fields (CreatedById, LastModifiedById, etc.)
            const isSystemReference = isReference && (
                field.name.includes('CreatedBy') || 
                field.name.includes('LastModifiedBy') || 
                field.name.includes('Owner') ||
                field.referenceTo?.includes('User')
            );
            
            if (isSystemReference) {
                return ''; // Skip system reference fields
            }
            
            if (isReference) {
                // Reference fields get checkbox, star button, arrow button, and expand button
                const referenceTo = field.referenceTo?.[0] || 'Unknown';
                
                // Add proper CSS classes for state indication
                let cssClasses = ['field-item', 'reference-field'];
                if (isSelected) cssClasses.push('selected');
                if (isValidated) cssClasses.push('validated');
                else if (isVolatile) cssClasses.push('volatile');
                
                return `
                    <div class="${cssClasses.join(' ')}" data-field-name="${field.name}" data-reference-to="${referenceTo}">
                        <div class="field-checkbox">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} data-field-name="${field.name}">
                        </div>
                        <div class="field-info">
                            <div class="field-name">${field.name}</div>
                            <div class="field-label">${field.label || field.name}</div>
                            <div class="field-type">→ ${referenceTo}</div>
                        </div>
                        <div class="field-actions">
                            <button class="star-btn ${isForeignKey ? 'active' : ''}" 
                                    data-field-name="${field.name}" 
                                    title="Set as Foreign Key">
                                <i data-lucide="star"></i>
                            </button>
                            <button class="expand-btn" 
                                    data-field-name="${field.name}"
                                    data-reference-to="${referenceTo}"
                                    title="Expand reference field in modal">
                                <i data-lucide="external-link"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else if (isExternalId) {
                // External ID fields get star only (no checkbox)
                return `
                    <div class="field-item external-id-field ${isForeignKey ? 'selected' : ''}" data-field-name="${field.name}">
                        <div class="field-info">
                            <div class="field-name">${field.name}</div>
                            <div class="field-label">${field.label || field.name}</div>
                            <div class="field-type">${field.type} (External ID)</div>
                        </div>
                        <div class="field-actions">
                            <button class="star-btn ${isForeignKey ? 'active' : ''}" 
                                    data-field-name="${field.name}" 
                                    title="Set as Foreign Key">
                                <i data-lucide="star"></i>
                            </button>
                        </div>
                    </div>
                `;
            } else {
                // Regular fields get checkbox and star, with expand button for references
                // Add proper CSS classes for state indication
                let cssClasses = ['field-item'];
                if (isSelected) cssClasses.push('selected');
                if (isValidated) cssClasses.push('validated');
                else if (isVolatile) cssClasses.push('volatile');
                if (isExternalId) cssClasses.push('external-id');
                
                return `
                    <div class="${cssClasses.join(' ')}" data-field-name="${field.name}">
                        <div class="field-checkbox">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} data-field-name="${field.name}">
                        </div>
                        <div class="field-info">
                            <div class="field-name">${field.name}</div>
                            <div class="field-label">${field.label || field.name}</div>
                            <div class="field-type">
                                ${isExternalId ? '<span class="type-badge external-id">External ID</span>' : ''}
                                <span class="type-text">${field.type}</span>
                            </div>
                        </div>
                        <div class="field-actions">
                            <button class="star-btn ${isForeignKey ? 'active' : ''}" 
                                    data-field-name="${field.name}" 
                                    title="Set as Foreign Key">
                                <i data-lucide="star"></i>
                            </button>
                            ${isReference ? `
                                <button class="expand-btn" 
                                        data-field-name="${field.name}"
                                        data-reference-to="${field.referenceTo?.[0] || 'Unknown'}"
                                        title="Expand reference field">
                                    <i data-lucide="external-link"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        }).filter(html => html !== '').join('');
        
        // Render lookup fields
        const lookupHtml = lookupFields.map(lookupField => {
            const isSelected = currentConfig.Fields.includes(lookupField.fullName);
            const isForeignKey = currentConfig.foreignKey === lookupField.fullName;
            
            return `
                <div class="field-item lookup-field ${isSelected ? 'selected' : ''}" data-field-name="${lookupField.fullName}">
                    <div class="field-checkbox">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} data-field-name="${lookupField.fullName}">
                    </div>
                    <div class="field-info">
                        <div class="field-name">${lookupField.fullName}</div>
                        <div class="field-label">${lookupField.displayName}</div>
                        <div class="field-type">
                            <span class="type-badge lookup">Lookup</span>
                            <span class="type-text">${lookupField.fieldType}</span>
                        </div>
                    </div>
                    <div class="field-actions">
                        <button class="star-btn ${isForeignKey ? 'active' : ''}" 
                                data-field-name="${lookupField.fullName}" 
                                title="Set as Foreign Key"
                                ${!isSelected ? 'disabled' : ''}>
                            <i data-lucide="star"></i>
                        </button>
                        <button class="remove-lookup-btn" 
                                data-field-name="${lookupField.fullName}"
                                title="Remove lookup field">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.fieldsList.innerHTML = fieldsHtml + lookupHtml;
        this.initializeLucideIcons();
        this.showFieldsLoading(false);
        
        // Update foreign key info
        this.updateForeignKeyInfo();
        
        // Enable/disable controls
        this.elements.selectAllFields.disabled = false;
        this.elements.clearAllFields.disabled = false;
        
        // Update summary
        this.updateConfigSummary();
    }

    getFilteredFields() {
        if (!this.searchFilters.fields) return this.objectFields;
        
        const searchTerm = this.searchFilters.fields.toLowerCase();
        return this.objectFields.filter(field => 
            field.name.toLowerCase().includes(searchTerm) ||
            (field.label && field.label.toLowerCase().includes(searchTerm)) ||
            (field.type && field.type.toLowerCase().includes(searchTerm))
        );
    }

    handleFieldsSearch(event) {
        this.searchFilters.fields = event.target.value;
        this.renderFields();
    }

    handleFieldClick(event) {
        const target = event.target;
        const fieldItem = target.closest('.field-item');
        if (!fieldItem) return;
        
        const fieldName = fieldItem.dataset.fieldName;
        if (!fieldName) return;
        
        // Handle expand button clicks for reference field modal (v1 style)
        if (target.closest('.expand-btn')) {
            event.stopPropagation();
            const referenceTo = target.closest('.expand-btn').dataset.referenceTo;
            this.expandReferenceField(fieldName, referenceTo);
            return;
        }
        
        // Handle remove lookup field button clicks
        if (target.closest('.remove-lookup-btn')) {
            event.stopPropagation();
            const lookupFieldName = target.closest('.remove-lookup-btn').dataset.lookupField;
            if (lookupFieldName) {
                this.removeLookupField(lookupFieldName);
            }
            return;
        }
        
        // Handle star button clicks for foreign key selection
        if (target.closest('.star-btn')) {
            event.stopPropagation(); // Prevent field selection
            this.toggleForeignKey(fieldName);
            return;
        }
        
        // Handle checkbox or anywhere else in the field item for selection
        if (target.type === 'checkbox' || target.closest('.field-checkbox') || fieldItem.contains(target)) {
            // Check if we're in reference navigation mode
            if (this.currentReferenceContext) {
                // In reference mode, use special selection logic
                if (target.type === 'checkbox' || target.closest('.field-checkbox')) {
                    this.toggleReferenceFieldSelection(fieldName);
                    return;
                }
            } else {
                // Regular field selection - now includes reference fields
                // Skip action buttons (they handle their own clicks)
                if (!target.closest('.field-actions')) {
                    const isCurrentlySelected = fieldItem.classList.contains('selected');
                    const newSelectedState = target.type === 'checkbox' ? target.checked : !isCurrentlySelected;
                    this.toggleFieldSelection(fieldName, newSelectedState);
                }
            }
        }
    }

    toggleFieldSelection(fieldName, selected) {
        if (!this.selectedObject) return;
        
        // Get or create volatile config following v1 pattern
        const objectConfig = this.getOrCreateVolatileConfig();
        
        // Toggle field selection
        const fieldIndex = objectConfig.Fields.indexOf(fieldName);
        if (selected && fieldIndex === -1) {
            objectConfig.Fields.push(fieldName);
        } else if (!selected && fieldIndex > -1) {
            objectConfig.Fields.splice(fieldIndex, 1);
            
            // Clear foreign key if this field was the foreign key
            if (objectConfig.foreignKey === fieldName) {
                objectConfig.foreignKey = null;
            }
        }
        
        this.logger.debug('Field selection toggled', {
            object: this.selectedObject,
            field: fieldName,
            selected: selected,
            totalFields: objectConfig.Fields.length
        });
        
        // Update volatile config and save
        this.updateVolatileConfig(objectConfig);
        this.renderFields();
        
        // Update config summary and button states
        this.updateConfigSummary();
    }

    toggleForeignKey(fieldName) {
        if (!this.selectedObject) return;
        
        // Handle reference field selection (when in reference navigation mode)
        if (this.currentReferenceContext) {
            this.selectReferenceField(fieldName);
            return;
        }
        
        // Handle regular field foreign key selection
        // Get or create volatile config using v1 pattern
        const objectConfig = this.getOrCreateVolatileConfig();
        
        // Toggle foreign key
        if (objectConfig.foreignKey === fieldName) {
            objectConfig.foreignKey = null;
        } else {
            objectConfig.foreignKey = fieldName;
            // Ensure field is selected (using v1 Fields array)
            if (!objectConfig.Fields.includes(fieldName)) {
                objectConfig.Fields.push(fieldName);
            }
        }
        
        this.logger.debug('Foreign key toggled', { 
            object: this.selectedObject,
            foreignKey: objectConfig.foreignKey
        });
        
        // Update volatile config and save
        this.updateVolatileConfig(objectConfig);
        
        // Re-render fields to update UI
        this.renderFields();
        
        // Force re-initialize Lucide icons for new elements
        this.initializeLucideIcons();
    }

    selectAllFields() {
        if (!this.selectedObject || !this.objectFields.length) return;
        
        this.logger.info('Selecting all fields', { object: this.selectedObject });
        
        // Initialize object config if not exists using getOrCreateVolatileConfig
        const objectConfig = this.getOrCreateVolatileConfig();
        
        // Select all fields
        objectConfig.Fields = this.objectFields.map(f => f.name);
        this.updateVolatileConfig(objectConfig);
        
        this.renderFields();
    }

    clearAllFields() {
        if (!this.selectedObject) return;
        
        this.logger.info('Clearing all fields', { object: this.selectedObject });
        
        // Clear all fields and foreign key
        const objectConfig = this.getOrCreateVolatileConfig();
        objectConfig.Fields = [];
        objectConfig.foreignKey = null;
        this.updateVolatileConfig(objectConfig);
        
        this.renderFields();
    }

    updateForeignKeyInfo() {
        if (!this.elements.foreignKeyInfo || !this.selectedObject) return;
        
        const config = this.config.volatile[this.selectedObject];
        const foreignKey = config?.foreignKey;
        
        if (foreignKey) {
            this.elements.foreignKeyInfo.innerHTML = `
                <div class="foreign-key-selected">
                    <i data-lucide="star"></i>
                    <span>${foreignKey}</span>
                </div>
            `;
        } else {
            this.elements.foreignKeyInfo.innerHTML = `
                <span class="no-foreign-key">No foreign key selected</span>
            `;
        }
        
        this.initializeLucideIcons();
    }

    updateConfigSummary() {
        const configuredObjects = Object.keys(this.config.volatile).filter(objName => 
            this.config.volatile[objName]?.Fields?.length > 0
        );
        
        const totalFields = configuredObjects.reduce((sum, objName) => 
            sum + (this.config.volatile[objName]?.Fields?.length || 0), 0
        );
        
        const foreignKeys = configuredObjects.filter(objName => 
            this.config.volatile[objName]?.foreignKey
        ).length;
        
        // Update counts
        if (this.elements.configuredObjectsCount) {
            this.elements.configuredObjectsCount.textContent = configuredObjects.length.toString();
        }
        if (this.elements.totalFieldsCount) {
            this.elements.totalFieldsCount.textContent = totalFields.toString();
        }
        if (this.elements.foreignKeysCount) {
            this.elements.foreignKeysCount.textContent = foreignKeys.toString();
        }
        
        // Update configured objects list
        if (this.elements.configuredObjectsList) {
            const html = configuredObjects.map(objName => {
                const config = this.config.volatile[objName];
                return `
                    <div class="configured-object">
                        <div class="object-info">
                            <div class="object-name">${objName}</div>
                            <div class="object-details">
                                ${config.Fields.length} fields
                                ${config.foreignKey ? ` • FK: ${config.foreignKey}` : ' • No FK'}
                            </div>
                        </div>
                        <div class="object-status">
                            <i data-lucide="${config.foreignKey ? 'check-circle' : 'alert-circle'}"></i>
                        </div>
                    </div>
                `;
            }).join('');
            
            this.elements.configuredObjectsList.innerHTML = html;
            this.initializeLucideIcons();
        }
        
        // Update action buttons using proper validation
        const hasValidConfig = this.isConfigurationValid();
        
        if (this.elements.validateAndSaveBtn) {
            this.elements.validateAndSaveBtn.disabled = !hasValidConfig;
        }
        if (this.elements.proceedToFiltersBtn) {
            this.elements.proceedToFiltersBtn.disabled = !hasValidConfig;
        }
    }

    async validateAndSaveConfig() {
        this.logger.info('🔍 Starting validation and save process');
        
        this.setAppState('loading', 'Validating configuration');
        this.showLoader('Running validations...', 0);
        
        try {
            const validationResults = [];
            let validCount = 0;
            
            const configuredObjects = Object.keys(this.config.volatile).filter(objName => 
                this.config.volatile[objName]?.Fields?.length > 0
            );
            
            // Run validation for each configured object
            for (const objectName of configuredObjects) {
                this.updateLoader(
                    (validCount / configuredObjects.length) * 80,
                    `Validating ${objectName}...`
                );
                
                const config = this.config.volatile[objectName];
                
                const response = await fetch('/data-comparison/api/validation/object', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        objectName,
                        config: {
                            fields: config.Fields,
                            foreignKey: config.foreignKey
                        },
                        orgs: this.selectedOrgs.map(org => org.username)
                    })
                });
                
                const result = await response.json();
                validationResults.push({ objectName, ...result });
                
                if (result.success && result.validation.isValid) {
                    validCount++;
                }
            }
            
            // Save configuration if all validations passed
            this.updateLoader(90, 'Saving configuration...');
            
            const allValid = validationResults.every(r => r.success && r.validation.isValid);
            
            if (allValid) {
                const response = await fetch('/data-comparison/api/config/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: this.configData.configFilename,
                        objects: this.config.volatile,
                        action: 'add-objects'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.hideLoader();
                    this.setAppState('success', 'Configuration validated and saved');
                    
                    // Mark all objects as validated in volatile config
                    configuredObjects.forEach(objectName => {
                        this.config.volatile[objectName].validated = true;
                    });
                    
                    this.updateConfigSummary();
                    this.renderObjects(); // Update object status indicators
                    
                    this.logger.info('Configuration validated and saved successfully', {
                        objects: configuredObjects.length,
                        validCount
                    });
                } else {
                    throw new Error(result.error || 'Failed to save configuration');
                }
            } else {
                throw new Error('Some validations failed');
            }
            
        } catch (error) {
            this.logger.error('Validation and save failed', { error: error.message });
            this.setAppState('error', 'Validation failed');
            this.hideLoader();
        }
    }

    backToConfigCreation() {
        this.logger.info('⬅️ Returning to config creation');
        this.setState('config-creation');
    }

    proceedToFilters() {
        this.logger.info('➡️ Proceeding to filter configuration');
        
        // Navigate to filter configuration with data
        const filterParams = encodeURIComponent(JSON.stringify({
            filename: this.configData.configFilename,
            selectedOrgs: this.selectedOrgs,
            validatedConfig: this.config.volatile
        }));
        
        const url = `/data-comparison/filter-configuration?config=${filterParams}`;
        
        if (this.isInExtensionShell && window.parent) {
            window.parent.location.href = url;
        } else {
            window.location.href = url;
        }
    }

    resetGenerator() {
        this.logger.info('🔄 Resetting configuration generator');
        
        this.selectedOrgs = [];
        this.configData = null;
        this.sfdxProgress = { current: 0, total: 0, commands: [] };
        this.commonObjects = [];
        this.selectedObject = null;
        this.objectFields = [];
        this.config.volatile = {};
        this.searchFilters = { objects: '', fields: '' };
        
        this.hideValidationResults();
        this.elements.configSuccess?.classList.add('hidden');
        this.elements.configError?.classList.add('hidden');
        this.elements.sfdxLogContent && (this.elements.sfdxLogContent.innerHTML = '');
        
        this.setState('org-selection');
        this.clearOrgSelection();
        this.setAppState('idle', 'Org Selection');
    }

    retryConfigGeneration() {
        this.logger.info('🔄 Retrying configuration generation');
        
        this.elements.configError?.classList.add('hidden');
        this.generateConfiguration();
    }

    backToOrgSelection() {
        this.logger.info('⬅️ Returning to org selection');
        
        this.setState('org-selection');
        this.setAppState('idle', 'Org Selection');
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Reference field navigation methods
    async navigateToReferenceObject(fieldName, referenceTo) {
        this.logger.info(`🔗 Navigating to reference object: ${fieldName} -> ${referenceTo}`);
        
        try {
            // Add current context to navigation stack
            const currentContext = {
                objectName: this.selectedObject,
                fields: [...this.objectFields],
                searchFilter: this.searchFilters.fields,
                selection: { ...this.config.volatile[this.selectedObject] }
            };
            
            this.navigationStack.push(currentContext);
            this.currentReferenceContext = {
                parentField: fieldName,
                parentObject: this.selectedObject,
                referenceTo: referenceTo
            };
            
            // Update UI to show navigation state
            this.showBackButton(true);
            this.setObjectSectionTitle(`${referenceTo} Fields`);
            this.updateNavigationBreadcrumb();
            
            // Start slide-out animation
            const fieldsContainer = document.getElementById('fields-container');
            if (fieldsContainer) {
                fieldsContainer.classList.add('sliding-out');
                
                // Wait for slide-out animation
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Load fields for referenced object
            await this.loadReferenceObjectFields(referenceTo);
            
            // Slide in the new content
            if (fieldsContainer) {
                fieldsContainer.classList.remove('sliding-out');
                fieldsContainer.classList.add('sliding-in');
                
                // Clean up animation class
                setTimeout(() => {
                    fieldsContainer.classList.remove('sliding-in');
                }, 300);
            }
            
        } catch (error) {
            this.logger.error('❌ Error navigating to reference object:', error);
            this.showOrgError('Failed to load referenced object fields');
        }
    }

    async loadReferenceObjectFields(objectName) {
        this.logger.info(`📋 Loading fields for reference object: ${objectName}`);
        
        this.showFieldsLoading(true);
        this.selectedObject = objectName;
        this.searchFilters.fields = ''; // Reset search
        
        try {
            const response = await fetch(`/data-comparison/api/objects/${objectName}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: [this.selectedOrgs[0]?.username || this.selectedOrgs[0]]
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch fields: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.success) {
                this.objectFields = data.fields || [];
                this.logger.info(`✅ Loaded ${this.objectFields.length} fields for ${objectName}`);
                
                // Show all fields for reference navigation (user can select any as foreign key)
                this.renderFields();
            } else {
                throw new Error(data.error || 'Failed to load fields');
            }
            
        } catch (error) {
            this.logger.error(`❌ Error loading fields for ${objectName}:`, error);
            this.showOrgError(`Failed to load fields for ${objectName}`);
        } finally {
            this.showFieldsLoading(false);
        }
    }

    renderReferenceFields() {
        const fieldsContainer = document.getElementById('fields-container');
        if (!fieldsContainer) return;
        
        // Show ALL fields from referenced object for selection
        const allFields = this.objectFields.filter(field => !field.deprecatedAndHidden);
        
        if (allFields.length === 0) {
            fieldsContainer.innerHTML = `
                <div class="no-fields">
                    <div class="no-fields-icon">📭</div>
                    <div class="no-fields-title">No Fields Found</div>
                    <div class="no-fields-message">
                        The object "${this.selectedObject}" doesn't have any accessible fields.
                    </div>
                </div>
            `;
            return;
        }
        
        const fieldsHtml = allFields.map(field => {
            const isSelected = this.isReferenceFieldSelected(field.name);
            const isExternalId = field.externalId === true;
            
            return `
                <div class="field-item reference-lookup-field ${isSelected ? 'selected' : ''} ${isExternalId ? 'external-id' : ''}" 
                     data-field-name="${field.name}">
                    <div class="field-checkbox">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} data-field-name="${field.name}">
                    </div>
                    <div class="field-info">
                        <div class="field-name">${field.name}</div>
                        <div class="field-label">${field.label || field.name}</div>
                        <div class="field-type">
                            ${isExternalId ? '<span class="type-badge external-id">External ID</span>' : ''}
                            <span class="type-text">${field.type}</span>
                        </div>
                    </div>
                    <div class="field-actions">
                        <button class="star-btn ${isSelected ? 'active' : ''}" 
                                title="Set as Foreign Key for this lookup"
                                data-field-name="${field.name}">
                            <i data-lucide="star"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        fieldsContainer.innerHTML = fieldsHtml;
        
        // Update field count
        const fieldsCount = document.getElementById('fields-count');
        if (fieldsCount) {
            fieldsCount.textContent = allFields.length;
        }
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    isReferenceFieldSelected(fieldName) {
        if (!this.currentReferenceContext) return false;
        
        const { parentField, parentObject } = this.currentReferenceContext;
        const lookupFieldName = `${parentField}.${fieldName}`;
        
        const parentConfig = this.config.volatile[parentObject];
        if (!parentConfig || !parentConfig.fields) return false;
        
        return parentConfig.fields.includes(lookupFieldName);
    }

    showBackButton(show) {
        const backButton = document.getElementById('back-to-parent-btn');
        if (backButton) {
            backButton.style.display = show ? 'flex' : 'none';
        }
    }

    setObjectSectionTitle(title) {
        const titleElement = document.getElementById('selected-object-name');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
    
    toggleReferenceFieldSelection(fieldName) {
        if (!this.currentReferenceContext) return;
        
        const { parentField, parentObject } = this.currentReferenceContext;
        const lookupFieldName = `${parentField}.${fieldName}`;
        
        // Initialize parent object config using proper v1 pattern
        if (!this.config.volatile[parentObject]) {
            this.config.volatile[parentObject] = {
                Fields: [],
                Active: [],
                foreignKey: null,
                ActiveCondition: "",
                LastModifiedBetween: [null, null],
                CreatedBetween: [null, null]
            };
        }
        
        const objectConfig = this.config.volatile[parentObject];
        
        // Toggle field selection (using proper Fields array)
        const fieldIndex = objectConfig.Fields.indexOf(lookupFieldName);
        if (fieldIndex > -1) {
            objectConfig.Fields.splice(fieldIndex, 1);
        } else {
            objectConfig.Fields.push(lookupFieldName);
        }
        
        this.logger.debug('Reference field selection toggled', {
            parentObject,
            lookupField: lookupFieldName,
            selected: fieldIndex === -1
        });
        
        // Update session storage
        this.saveToSessionStorage();
        
        // Re-render to update checkboxes
        this.renderReferenceFields();
    }

    updateNavigationBreadcrumb() {
        if (!this.currentReferenceContext) return;
        
        const { parentField, parentObject, referenceTo } = this.currentReferenceContext;
        
        // Add breadcrumb below the title
        const titleElement = document.getElementById('selected-object-name');
        if (titleElement && titleElement.parentNode) {
            let breadcrumb = titleElement.parentNode.querySelector('.navigation-breadcrumb');
            if (!breadcrumb) {
                breadcrumb = document.createElement('div');
                breadcrumb.className = 'navigation-breadcrumb';
                titleElement.parentNode.appendChild(breadcrumb);
            }
            
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item">${parentObject}</span>
                <span class="breadcrumb-separator">→</span>
                <span class="breadcrumb-item">${parentField}</span>
                <span class="breadcrumb-separator">→</span>
                <span class="breadcrumb-item current">${referenceTo}</span>
            `;
        }
    }

    clearNavigationBreadcrumb() {
        const breadcrumb = document.querySelector('.navigation-breadcrumb');
        if (breadcrumb) {
            breadcrumb.remove();
        }
    }

    navigateBack() {
        this.logger.info('⬅️ Navigating back to parent object');
        
        if (this.navigationStack.length === 0) {
            this.logger.warn('No navigation stack to go back to');
            return;
        }
        
        try {
            // Get previous context
            const previousContext = this.navigationStack.pop();
            
            // Start slide-out animation
            const fieldsContainer = document.getElementById('fields-container');
            if (fieldsContainer) {
                fieldsContainer.classList.add('sliding-out');
            }
            
            // Wait for animation then restore context
            setTimeout(() => {
                // Restore previous state
                this.selectedObject = previousContext.objectName;
                this.objectFields = previousContext.fields;
                this.searchFilters.fields = previousContext.searchFilter;
                
                // Restore volatile config if it existed
                if (previousContext.selection) {
                    this.config.volatile[this.selectedObject] = previousContext.selection;
                }
                
                // Update UI
                this.setObjectSectionTitle(`${this.selectedObject} Fields`);
                this.showBackButton(false);
                this.clearNavigationBreadcrumb();
                this.renderFields(); // Use normal field rendering
                
                // Clear reference context
                this.currentReferenceContext = null;
                
                // Slide in
                if (fieldsContainer) {
                    fieldsContainer.classList.remove('sliding-out');
                    fieldsContainer.classList.add('sliding-in');
                    
                    setTimeout(() => {
                        fieldsContainer.classList.remove('sliding-in');
                    }, 300);
                }
                
            }, 300);
            
        } catch (error) {
            this.logger.error('❌ Error navigating back:', error);
        }
    }

    // Handle reference field selection (creates lookup relationship)
    selectReferenceField(fieldName) {
        if (!this.currentReferenceContext) return;
        
        const { parentField, parentObject } = this.currentReferenceContext;
        
        // Initialize parent object config using proper v1 pattern
        if (!this.config.volatile[parentObject]) {
            this.config.volatile[parentObject] = {
                Fields: [],
                Active: [],
                foreignKey: null,
                ActiveCondition: "",
                LastModifiedBetween: [null, null],
                CreatedBetween: [null, null]
            };
        }
        
        // Create the lookup field name (e.g., "SBQQ__Rule__c.Name")
        const lookupFieldName = `${parentField}.${fieldName}`;
        
        // Add the lookup field to the field list if not already there (using proper Fields array)
        if (!this.config.volatile[parentObject].Fields.includes(lookupFieldName)) {
            this.config.volatile[parentObject].Fields.push(lookupFieldName);
        }
        
        this.logger.info(`🔗 Lookup field added: ${parentObject} -> ${lookupFieldName}`);
        
        // Update session storage
        this.saveToSessionStorage();
        
        // Navigate back automatically
        this.navigateBack();
    }

    // Modal-based reference field expansion (v1 pattern)
    async expandReferenceField(parentField, referenceTo) {
        this.logger.info(`🔗 Expanding reference field: ${parentField} -> ${referenceTo}`);
        
        try {
            // Load fields from referenced object
            const response = await fetch(`/data-comparison/api/objects/${referenceTo}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: this.selectedOrgs.map(org => org.username || org)
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch fields: ${response.status}`);
            }
            
            const data = await response.json();
            if (data.success) {
                this.showReferenceFieldModal({
                    parentObject: this.selectedObject,
                    parentField: parentField,
                    referenceTo: referenceTo,
                    fields: data.fields
                });
            } else {
                throw new Error(data.error || 'Failed to load reference fields');
            }
            
        } catch (error) {
            this.logger.error('❌ Error loading reference fields:', error);
            this.showOrgError(`Failed to load fields for ${referenceTo}`);
        }
    }

    showReferenceFieldModal({ parentObject, parentField, referenceTo, fields }) {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.innerHTML = `
            <div class="modal-container reference-field-modal">
                <div class="modal-header">
                    <h3>Select ${parentField} Field</h3>
                    <button class="modal-close-btn" title="Close">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-content">
                    <div class="reference-info">
                        <div class="reference-path">
                            <span class="parent">${parentObject}</span>
                            <span class="separator">→</span>
                            <span class="field">${parentField}</span>
                            <span class="separator">→</span>
                            <span class="target">${referenceTo}</span>
                        </div>
                        <p class="reference-description">
                            Select a field from ${referenceTo} to include in your comparison.
                        </p>
                    </div>
                    <div class="modal-search">
                        <div class="search-box">
                            <i data-lucide="search" class="search-icon"></i>
                            <input type="text" class="modal-search-input" placeholder="Search fields..." />
                        </div>
                        <div class="search-stats">
                            <span class="field-count">${fields.length} fields</span>
                        </div>
                    </div>
                    <div class="reference-fields-container">
                        ${this.renderReferenceModalFields(fields, parentObject, parentField)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel-btn">Cancel</button>
                    <button class="btn btn-primary modal-confirm-btn" disabled>Add Selected Field</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modalOverlay);
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        // Store modal context
        this.currentModalContext = { parentObject, parentField, referenceTo, fields };
        
        // Set up event listeners
        this.setupModalEventListeners(modalOverlay);
    }

    renderReferenceModalFields(fields, parentObject, parentField) {
        if (!fields || fields.length === 0) {
            return `
                <div class="no-fields-modal">
                    <div class="no-fields-icon">📄</div>
                    <p>No accessible fields found in ${this.currentModalContext?.referenceTo || 'this object'}.</p>
                </div>
            `;
        }
        
        // Filter out system fields and show all remaining fields
        const availableFields = fields.filter(field => 
            !field.deprecatedAndHidden && 
            !field.name.includes('CreatedBy') && 
            !field.name.includes('LastModifiedBy')
        );
        
        return `
            <div class="reference-fields-list">
                ${availableFields.map(field => {
                    const isExternalId = field.externalId === true;
                    const currentSelection = this.getCurrentReferenceSelection(parentObject, parentField, field.name);
                    
                    return `
                        <div class="reference-field-item ${currentSelection ? 'selected' : ''}" 
                             data-field-name="${field.name}">
                            <div class="field-info">
                                <div class="field-name">${field.name}</div>
                                <div class="field-label">${field.label || field.name}</div>
                                <div class="field-type">
                                    ${isExternalId ? '<span class="type-badge external-id">External ID</span>' : ''}
                                    <span class="type-text">${field.type}</span>
                                </div>
                            </div>
                            <div class="field-indicator">
                                ${isExternalId ? '<i data-lucide="star" class="external-id-star"></i>' : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    getCurrentReferenceSelection(parentObject, parentField, fieldName) {
        const objectConfig = this.getVolatileConfig();
        const lookupFieldName = `${parentField}.${fieldName}`;
        return objectConfig.Fields.includes(lookupFieldName);
    }

    setupModalEventListeners(modalOverlay) {
        const confirmBtn = modalOverlay.querySelector('.modal-confirm-btn');
        const cancelBtn = modalOverlay.querySelector('.modal-cancel-btn');
        const closeBtn = modalOverlay.querySelector('.modal-close-btn');
        const fieldsContainer = modalOverlay.querySelector('.reference-fields-list');
        const searchInput = modalOverlay.querySelector('.modal-search-input');
        const fieldCount = modalOverlay.querySelector('.field-count');
        
        // Close modal handlers
        const closeModal = () => {
            modalOverlay.remove();
            this.currentModalContext = null;
        };
        
        cancelBtn?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
        
        // Search functionality
        const originalFields = this.currentModalContext.fields;
        let filteredFields = [...originalFields];
        
        const filterFields = (searchTerm) => {
            const term = searchTerm.toLowerCase();
            filteredFields = originalFields.filter(field => 
                field.name.toLowerCase().includes(term) ||
                (field.label && field.label.toLowerCase().includes(term))
            );
            
            // Update field count
            if (fieldCount) {
                fieldCount.textContent = `${filteredFields.length} fields`;
            }
            
            // Re-render filtered fields
            if (fieldsContainer) {
                fieldsContainer.innerHTML = this.renderFilteredReferenceFields(filteredFields);
                
                // Re-initialize Lucide icons
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                
                // Re-attach field selection listeners
                this.attachFieldSelectionListeners(fieldsContainer, confirmBtn);
            }
        };
        
        // Search input handler
        searchInput?.addEventListener('input', (e) => {
            filterFields(e.target.value);
        });
        
        // Initial field selection listeners
        this.attachFieldSelectionListeners(fieldsContainer, confirmBtn);
    }
    
    renderFilteredReferenceFields(fields) {
        if (!fields || fields.length === 0) {
            return `
                <div class="no-fields-modal">
                    <div class="no-fields-icon">📄</div>
                    <p>No fields match your search criteria.</p>
                </div>
            `;
        }
        
        // Filter out system fields and show all remaining fields
        const availableFields = fields.filter(field => 
            !field.deprecatedAndHidden && 
            !field.name.includes('CreatedBy') && 
            !field.name.includes('LastModifiedBy')
        );
        
        return availableFields.map(field => {
            const isExternalId = field.externalId === true;
            const currentSelection = this.getCurrentReferenceSelection(
                this.currentModalContext?.parentObject, 
                this.currentModalContext?.parentField, 
                field.name
            );
            
            return `
                <div class="reference-field-item ${currentSelection ? 'selected' : ''}" 
                     data-field-name="${field.name}">
                    <div class="field-info">
                        <div class="field-name">${field.name}</div>
                        <div class="field-label">${field.label || field.name}</div>
                        <div class="field-type">
                            ${isExternalId ? '<span class="type-badge external-id">External ID</span>' : ''}
                            <span class="type-text">${field.type}</span>
                        </div>
                    </div>
                    <div class="field-indicator">
                        ${isExternalId ? '<i data-lucide="star" class="external-id-star"></i>' : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    attachFieldSelectionListeners(fieldsContainer, confirmBtn) {
        // Field selection handler
        let selectedField = null;
        
        const handleFieldClick = (e) => {
            const fieldItem = e.target.closest('.reference-field-item');
            if (!fieldItem) return;
            
            // Clear previous selection
            fieldsContainer.querySelectorAll('.reference-field-item').forEach(item => {
                item.classList.remove('selected');
            });
            
            // Select clicked field
            fieldItem.classList.add('selected');
            selectedField = fieldItem.dataset.fieldName;
            
            // Enable confirm button
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = `Add ${selectedField}`;
            }
        };
        
        const handleConfirmClick = () => {
            if (selectedField && this.currentModalContext) {
                this.confirmReferenceFieldSelection(
                    this.currentModalContext.parentObject,
                    this.currentModalContext.parentField,
                    selectedField
                );
                // Close modal by removing it
                const modalOverlay = document.querySelector('.modal-overlay');
                if (modalOverlay) {
                    modalOverlay.remove();
                    this.currentModalContext = null;
                }
            }
        };
        
        // Remove existing listeners
        fieldsContainer.removeEventListener('click', handleFieldClick);
        confirmBtn?.removeEventListener('click', handleConfirmClick);
        
        // Add new listeners
        fieldsContainer.addEventListener('click', handleFieldClick);
        confirmBtn?.addEventListener('click', handleConfirmClick);
    }

    confirmReferenceFieldSelection(parentObject, parentField, selectedField) {
        const lookupFieldName = `${parentField}.${selectedField}`;
        
        this.logger.info(`🔗 Adding lookup field: ${parentObject} -> ${lookupFieldName}`);
        
        // Get or create volatile config
        const objectConfig = this.getOrCreateVolatileConfig();
        
        // Remove any existing lookup field for this reference (only one allowed per reference)
        objectConfig.Fields = objectConfig.Fields.filter(field => 
            !field.startsWith(`${parentField}.`)
        );
        
        // Add the new lookup field
        objectConfig.Fields.push(lookupFieldName);
        
        // Update volatile config and save
        this.updateVolatileConfig(objectConfig);
        
        // Re-render fields to show the new lookup field
        this.renderFields();
        
        // Update config summary and button states
        this.updateConfigSummary();
        
        this.logger.info(`✅ Lookup field added successfully: ${lookupFieldName}`);
    }

    getLookupFields() {
        const objectConfig = this.getVolatileConfig();
        
        return objectConfig.Fields
            .filter(field => field.includes('.'))
            .map(field => {
                const [parentField, selectedField] = field.split('.');
                const parentFieldInfo = this.objectFields.find(f => f.name === parentField);
                const referenceTo = parentFieldInfo?.referenceTo?.[0] || 'Unknown';
                
                return {
                    fullName: field,
                    parentField: parentField,
                    selectedField: selectedField,
                    referenceTo: referenceTo,
                    displayName: `${parentField} → ${selectedField}`,
                    fieldType: 'Lookup'
                };
            });
    }

    removeLookupField(lookupFieldName) {
        this.logger.info(`🗑️ Removing lookup field: ${lookupFieldName}`);
        
        const objectConfig = this.getOrCreateVolatileConfig();
        
        // Remove the lookup field
        objectConfig.Fields = objectConfig.Fields.filter(field => field !== lookupFieldName);
        
        // Clear foreign key if this was the foreign key
        if (objectConfig.foreignKey === lookupFieldName) {
            objectConfig.foreignKey = null;
        }
        
        // Update volatile config and save
        this.updateVolatileConfig(objectConfig);
        
        // Re-render fields
        this.renderFields();
        
        this.logger.info(`✅ Lookup field removed successfully: ${lookupFieldName}`);
    }

    // Config management methods (v1 pattern)
    getOrCreateVolatileConfig() {
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
        this.config.volatile[this.selectedObject] = objectConfig;
        this.saveToSessionStorage();
        this.logger.debug(`Volatile config updated for ${this.selectedObject}:`, objectConfig);
    }
    
    initializeConfigs() {
        // Defensive programming - ensure configs are always objects (v1 pattern)
        if (!this.config) {
            this.config = {};
        }
        if (!this.config.validated || typeof this.config.validated !== 'object') {
            this.config.validated = {};
        }
        if (!this.config.volatile || typeof this.config.volatile !== 'object') {
            this.config.volatile = {};
        }
        
        this.logger?.debug('Configs initialized defensively');
    }
    
    async loadValidatedConfig(configFilename) {
        try {
            this.logger.info(`📂 Loading validated config from file: ${configFilename}`);
            
            // Fetch the generated config file (v1 pattern)
            const response = await fetch(`/data-comparison/api/config/load`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: configFilename })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.config) {
                    // Set validated config from file
                    this.config.validated = data.config.objects || {};
                    
                    // Initialize volatile config from session storage or copy of validated
                    this.loadFromSessionStorage();
                    
                    // If no volatile config in session, copy from validated (v1 pattern)
                    if (Object.keys(this.config.volatile).length === 0) {
                        this.config.volatile = JSON.parse(JSON.stringify(this.config.validated));
                    }
                    
                    this.logger.info('✅ Validated config loaded successfully', {
                        validatedObjects: Object.keys(this.config.validated).length,
                        volatileObjects: Object.keys(this.config.volatile).length
                    });
                } else {
                    this.logger.warn('Config file exists but has no objects, initializing empty');
                    this.config.validated = {};
                    this.config.volatile = {};
                }
            } else {
                this.logger.warn('Config file not found, initializing empty configs');
                this.config.validated = {};
                this.config.volatile = {};
            }
        } catch (error) {
            this.logger.error('Failed to load validated config', error);
            // Initialize empty configs as fallback
            this.config.validated = {};
            this.config.volatile = {};
        }
    }
    
    saveToSessionStorage() {
        try {
            sessionStorage.setItem('cpq-config-generator-volatile', JSON.stringify(this.config.volatile));
            sessionStorage.setItem('cpq-config-generator-validated', JSON.stringify(this.config.validated));
            this.logger.debug('Configuration saved to session storage');
        } catch (error) {
            this.logger.warn('Failed to save to session storage', error);
        }
    }
    
    loadFromSessionStorage() {
        try {
            // Ensure configs are initialized before loading (defensive programming)
            this.initializeConfigs();
            
            const volatile = sessionStorage.getItem('cpq-config-generator-volatile');
            const validated = sessionStorage.getItem('cpq-config-generator-validated');
            
            if (volatile) {
                const parsedVolatile = JSON.parse(volatile);
                if (parsedVolatile && typeof parsedVolatile === 'object') {
                    this.config.volatile = parsedVolatile;
                }
            }
            
            if (validated) {
                const parsedValidated = JSON.parse(validated);
                if (parsedValidated && typeof parsedValidated === 'object') {
                    this.config.validated = parsedValidated;
                }
            }
            
            this.logger.debug('Configuration loaded from session storage');
        } catch (error) {
            this.logger.warn('Failed to load from session storage', error);
            // Ensure configs remain initialized even if loading fails
            this.initializeConfigs();
        }
    }
    
    isFieldValidated(fieldName) {
        const validatedConfig = this.config.validated[this.selectedObject];
        return validatedConfig && validatedConfig.Fields && validatedConfig.Fields.includes(fieldName);
    }
    
    isFieldVolatile(fieldName) {
        const volatileConfig = this.getVolatileConfig();
        const isInVolatile = volatileConfig.Fields.includes(fieldName);
        const isInValidated = this.isFieldValidated(fieldName);
        return isInVolatile !== isInValidated; // Different = volatile
    }
    
    updateConfigSummary() {
        const objectConfig = this.getVolatileConfig();
        const selectedFields = objectConfig.Fields.length;
        const foreignKey = objectConfig.foreignKey;
        
        // Update summary display
        const summaryElement = document.getElementById('config-summary');
        if (summaryElement) {
            summaryElement.innerHTML = `
                <div class="config-summary-item">
                    <span class="label">Selected Fields:</span>
                    <span class="value">${selectedFields}</span>
                </div>
                <div class="config-summary-item">
                    <span class="label">Foreign Key:</span>
                    <span class="value">${foreignKey || 'No FK selected'}</span>
                </div>
            `;
        }
    }
    
    isConfigurationValid() {
        // Only validate the CURRENT object, not all objects (v1 pattern - one object at a time)
        if (!this.selectedObject || !this.config.volatile[this.selectedObject]) {
            console.log('❌ No selected object or config');
            return false;
        }
        
        const config = this.config.volatile[this.selectedObject];
        console.log('🔍 Validating config:', config);
        
        // 1. Must have at least one field selected
        const hasFields = config.Fields && config.Fields.length > 0;
        console.log('📋 Has fields:', hasFields, config.Fields?.length);
        
        // 2. Must have a foreign key selected
        const hasForeignKey = !!config.foreignKey;
        console.log('🔑 Has foreign key:', hasForeignKey, config.foreignKey);
        
        // 3. Foreign key must be in selected fields
        const foreignKeyInFields = config.foreignKey && config.Fields.includes(config.foreignKey);
        console.log('✅ Foreign key in fields:', foreignKeyInFields);
        
        const isValid = hasFields && hasForeignKey && foreignKeyInFields;
        console.log('🎯 Overall valid:', isValid);
        
        return isValid;
    }

    // Public API for external use
    getAppInfo() {
        return {
            name: this.appName,
            version: this.appVersion,
            state: this.currentState,
            isConnected: this.isInExtensionShell,
            themeReceived: this.themeReceived,
            selectedOrgs: this.selectedOrgs.length,
            configData: this.configData
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing Configuration Generator...');
    window.configGenerator = new ConfigGenerator();
});

// Global API
window.ConfigGenerator = {
    getAppInfo: () => window.configGenerator?.getAppInfo(),
    setTheme: (theme, variables) => window.configGenerator?.updateTheme(theme, variables)
};