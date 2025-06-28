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

        // Elements
        this.elements = {
            // Steps
            stepOrgs: document.getElementById('step-orgs'),
            stepConfig: document.getElementById('step-config'),
            
            // States
            orgSelectionState: document.getElementById('org-selection-state'),
            configCreationState: document.getElementById('config-creation-state'),
            
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
            backToOrgsBtn: document.getElementById('back-to-orgs-btn')
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
        
        // Start with org loading
        await this.loadOrganizations();
        
        this.logger.info('Configuration Generator initialized');
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
        this.elements.startObjectSelectionBtn?.addEventListener('click', () => this.startObjectSelection());
        this.elements.createAnotherConfigBtn?.addEventListener('click', () => this.resetGenerator());
        this.elements.retryConfigBtn?.addEventListener('click', () => this.retryConfigGeneration());
        this.elements.backToOrgsBtn?.addEventListener('click', () => this.backToOrgSelection());

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
        
        // Update step indicators
        this.elements.stepOrgs?.classList.toggle('active', newState === 'org-selection');
        this.elements.stepOrgs?.classList.toggle('completed', newState === 'config-creation');
        this.elements.stepConfig?.classList.toggle('active', newState === 'config-creation');
        
        // Update state containers
        this.elements.orgSelectionState?.classList.toggle('active', newState === 'org-selection');
        this.elements.configCreationState?.classList.toggle('active', newState === 'config-creation');
        
        // Update app state in shell
        if (newState === 'org-selection') {
            this.setAppState('idle', 'Org Selection');
        } else if (newState === 'config-creation') {
            this.setAppState('loading', 'Generate Configuration');
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
            this.elements.configCreatedTime.textContent = new Date(data.summary.created).toLocaleString();
        }
        
        this.hideLoader();
    }

    showConfigError(message) {
        this.elements.configError?.classList.remove('hidden');
        this.elements.configSuccess?.classList.add('hidden');
        
        if (this.elements.configErrorMessage) {
            this.elements.configErrorMessage.textContent = message;
        }
        
        this.hideLoader();
    }

    startObjectSelection() {
        this.logger.info('🎯 Starting object selection phase');
        
        if (this.configData?.configFilename) {
            // Navigate to object selection state with config
            const configParam = encodeURIComponent(JSON.stringify({
                filename: this.configData.configFilename,
                selectedOrgs: this.selectedOrgs
            }));
            
            const url = `/data-comparison/object-selection?config=${configParam}`;
            
            if (this.isInExtensionShell && window.parent) {
                window.parent.location.href = url;
            } else {
                window.location.href = url;
            }
            
            this.logger.info('Navigating to object selection', { url });
        } else {
            this.logger.error('No config data available for object selection');
        }
    }

    resetGenerator() {
        this.logger.info('🔄 Resetting configuration generator');
        
        this.selectedOrgs = [];
        this.configData = null;
        this.sfdxProgress = { current: 0, total: 0, commands: [] };
        
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