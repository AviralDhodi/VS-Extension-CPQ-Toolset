/**
 * Org Selection Component - Data Comparison App
 * Updated Flow: Org Selection → Config Generation → Object & Date Filters (per object per org)
 * Handles Salesforce org selection and direct config generation
 */

class OrgSelection {
    constructor() {
        this.appName = 'Org Selection';
        this.appVersion = '1.0.0';
        this.currentState = 'loading'; // loading, error, org-selection, config-generation, success
        this.isInExtensionShell = window.parent !== window;
        this.logger = null;
        this.themeReceived = false;

        // Data state
        this.organizations = [];
        this.selectedOrgs = [];
        this.configData = null;
        this.generatedFilename = null;

        // Elements
        this.elements = {
            // Steps (updated with new flow)
            stepOrgs: document.getElementById('step-orgs'),
            stepConfig: document.getElementById('step-config'),
            stepObjects: document.getElementById('step-objects'),
            
            // States
            loadingState: document.getElementById('loading-state'),
            errorState: document.getElementById('error-state'),
            orgSelectionState: document.getElementById('org-selection-state'),
            configGenerationState: document.getElementById('config-generation-state'),
            successState: document.getElementById('success-state'),
            
            // Org Selection
            errorMessage: document.getElementById('error-message'),
            retryBtn: document.getElementById('retry-btn'),
            backBtn: document.getElementById('back-btn'),
            selectionCount: document.getElementById('selection-count'),
            selectAllBtn: document.getElementById('select-all-btn'),
            clearSelectionBtn: document.getElementById('clear-selection-btn'),
            orgsList: document.getElementById('orgs-list'),
            generateConfigBtn: document.getElementById('generate-config-btn'), // Updated button
            
            // Config Generation
            generationProgressFill: document.getElementById('generation-progress-fill'),
            generationProgressText: document.getElementById('generation-progress-text'),
            generationOrgCount: document.getElementById('generation-org-count'),
            generationFilename: document.getElementById('generation-filename'),
            
            // Success
            successFilename: document.getElementById('success-filename'),
            successOrgCount: document.getElementById('success-org-count'),
            successCreatedTime: document.getElementById('success-created-time'),
            proceedToObjectsBtn: document.getElementById('proceed-to-objects-btn'), // Updated button
            createAnotherBtn: document.getElementById('create-another-btn'),
            
            // Toast
            toastContainer: document.getElementById('toast-container')
        };

        this.init();
    }

    async init() {
        console.log(` ${this.appName} initializing...`);
        console.log(` In extension shell: ${this.isInExtensionShell}`);
        
        this.setupLogger();
        this.initializeLucideIcons();
        this.setupExtensionCommunication();
        this.bindEvents();
        this.notifyExtensionLoaded();
        this.setInitialState();
        
        // Start org loading
        await this.loadOrganizations();
        
        this.logger.info('Org Selection component initialized');
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
                        location: 'orgSelection/index.js',
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
        this.setAppState('loading', 'Loading organizations');
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

    // ========================================
    // STATE MANAGEMENT (Updated for new flow)
    // ========================================

    setState(newState) {
        this.logger.info(`State transition: ${this.currentState}  ${newState}`);
        
        this.currentState = newState;
        
        // Hide all state containers
        Object.values(this.elements).forEach(element => {
            if (element && element.classList && element.classList.contains('state-container')) {
                element.classList.add('hidden');
            }
        });
        
        // Show current state
        const stateMap = {
            'loading': this.elements.loadingState,
            'error': this.elements.errorState,
            'org-selection': this.elements.orgSelectionState,
            'config-generation': this.elements.configGenerationState,
            'success': this.elements.successState
        };
        
        const currentContainer = stateMap[newState];
        if (currentContainer) {
            currentContainer.classList.remove('hidden');
        }
        
        // Update step indicators
        this.updateStepIndicators();
    }

    updateStepIndicators() {
        const steps = [this.elements.stepOrgs, this.elements.stepConfig, this.elements.stepObjects];
        
        steps.forEach(step => {
            if (step) {
                step.classList.remove('active', 'completed');
            }
        });
        
        // Updated step flow: Orgs → Config → Objects/Dates
        switch (this.currentState) {
            case 'loading':
            case 'error':
            case 'org-selection':
                if (this.elements.stepOrgs) this.elements.stepOrgs.classList.add('active');
                break;
            case 'config-generation':
                if (this.elements.stepOrgs) this.elements.stepOrgs.classList.add('completed');
                if (this.elements.stepConfig) this.elements.stepConfig.classList.add('active');
                break;
            case 'success':
                if (this.elements.stepOrgs) this.elements.stepOrgs.classList.add('completed');
                if (this.elements.stepConfig) this.elements.stepConfig.classList.add('completed');
                if (this.elements.stepObjects) this.elements.stepObjects.classList.add('active');
                break;
        }
    }

    // ========================================
    // ORG LOADING LOGIC
    // ========================================

    async loadOrganizations() {
        this.logger.info(' Loading organizations from Salesforce CLI');
        
        this.setState('loading');
        this.setAppState('loading', 'Loading organizations');
        this.showLoader('Fetching authenticated organizations...', 10);

        try {
            this.updateLoader(25, 'Executing: sf org list --json');
            
            // Execute sf org list via API call (since browser can't use require)
            const response = await fetch('/data-comparison/api/orgs/list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            this.updateLoader(50, 'Processing org data...');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            this.updateLoader(75, 'Filtering active orgs...');
            
            if (result.success && result.orgs) {
                // Orgs are already filtered by the API
                this.organizations = result.orgs;
                
                this.updateLoader(100, 'Organizations loaded!');
                
                setTimeout(() => {
                    this.hideLoader();
                    this.setState('org-selection');
                    this.renderOrganizations();
                    this.setAppState('idle', 'Select organizations');
                    
                    this.logger.info('Organizations loaded successfully', { 
                        connected: this.organizations.length 
                    });
                }, 500);
            } else {
                throw new Error(result.error || 'No organizations found');
            }
            
        } catch (error) {
            this.logger.error('Failed to load organizations', { error: error.message });
            this.showOrgError(error.message);
            this.setAppState('error', 'Failed to load organizations');
            this.hideLoader();
        }
    }

    showOrgError(message) {
        this.setState('error');
        if (this.elements.errorMessage) {
            this.elements.errorMessage.textContent = message;
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

    // ========================================
    // ORG SELECTION LOGIC
    // ========================================

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
        
        // Update Generate Config button (renamed from Configure Filters)
        if (this.elements.generateConfigBtn) {
            this.elements.generateConfigBtn.disabled = !hasMinimum;
        }
        
        this.logger.debug('Selection count updated', { count, hasMinimum });
    }

    // ========================================
    // CONFIG GENERATION LOGIC (Updated - Direct from Org Selection)
    // ========================================

    async generateConfiguration() {
        if (this.selectedOrgs.length < 2) {
            this.showToast('Please select at least 2 organizations', 'error');
            return;
        }

        this.logger.info(' Generating configuration directly', { orgs: this.selectedOrgs.length });
        
        this.setState('config-generation');
        this.setAppState('loading', 'Generating configuration');
        this.showLoader('Creating configuration file...', 0);
        
        try {
            this.updateGenerationProgress(25, 'Collecting org data...');
            
            // Create config object with structure for future object/date filters
            const orgIds = this.selectedOrgs.map(org => org.orgId || org.username.split('@')[0]).sort().join('_');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const configFilename = `config_${orgIds}_${timestamp}.json`;
            
            this.updateGenerationProgress(50, 'Building configuration...');
            
            // Create config with empty object/date filters structure (to be configured later)
            const config = {
                version: '1.0.0',
                createdAt: new Date().toISOString(),
                orgs: this.selectedOrgs.map(org => ({
                    ...org,
                    // These will be populated in the next step (Object & Date Filters)
                    objects: {}, // Will contain selected objects per org
                    dateFilters: {} // Will contain date filters per object per org
                })),
                // Global object configuration (to be set in next step)
                objects: {}, // Will be populated in object selection phase
                metadata: {
                    totalOrgs: this.selectedOrgs.length,
                    orgNames: this.selectedOrgs.map(org => org.username),
                    workflow: 'org-selection-completed' // Track workflow progress
                }
            };
            
            this.updateGenerationProgress(75, 'Saving configuration file...');
            
            // Send to backend to save config
            const response = await fetch('/data-comparison/api/config/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: configFilename,
                    config: config
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.updateGenerationProgress(100, 'Configuration generated!');
                
                this.configData = {
                    filename: configFilename,
                    config: config,
                    path: result.path
                };
                
                setTimeout(() => {
                    this.hideLoader();
                    this.showConfigSuccess();
                    this.setAppState('success', 'Configuration generated');
                    
                    this.logger.info('Configuration generated successfully', { 
                        filename: configFilename,
                        orgs: this.selectedOrgs.length,
                        nextStep: 'objects-and-date-filters'
                    });
                }, 800);
            } else {
                throw new Error(result.error || 'Failed to save configuration');
            }
            
        } catch (error) {
            this.logger.error('Config generation failed', { error: error.message });
            this.showToast(`Configuration generation failed: ${error.message}`, 'error');
            this.setState('org-selection');
            this.setAppState('error', 'Generation failed');
            this.hideLoader();
        }
    }

    updateGenerationProgress(percentage, statusText) {
        if (this.elements.generationProgressFill) {
            this.elements.generationProgressFill.style.width = `${percentage}%`;
        }
        if (this.elements.generationProgressText) {
            this.elements.generationProgressText.textContent = `${percentage}%`;
        }
        if (this.elements.generationOrgCount) {
            this.elements.generationOrgCount.textContent = this.selectedOrgs.length.toString();
        }
        if (statusText && this.elements.generationFilename) {
            this.elements.generationFilename.textContent = statusText;
        }
        
        // Update shell loader
        this.updateLoader(percentage, statusText);
    }

    showConfigSuccess() {
        this.setState('success');
        
        if (this.configData) {
            if (this.elements.successFilename) {
                this.elements.successFilename.textContent = this.configData.filename;
            }
            if (this.elements.successOrgCount) {
                this.elements.successOrgCount.textContent = this.selectedOrgs.length.toString();
            }
            if (this.elements.successCreatedTime) {
                this.elements.successCreatedTime.textContent = new Date().toLocaleString();
            }
        }
    }

    // ========================================
    // NAVIGATION LOGIC (Updated for new flow)
    // ========================================

    proceedToObjectsAndDateFilters() {
        this.logger.info(' Proceeding to objects and date filters configuration');
        
        if (this.configData?.filename) {
            // Navigate to combined object/date filter selection with config
            const configParam = encodeURIComponent(JSON.stringify({
                filename: this.configData.filename,
                selectedOrgs: this.selectedOrgs,
                workflow: 'from-org-selection'
            }));
            
            // Navigate to the new combined objects-config page
            if (this.isInExtensionShell && window.parent) {
                window.parent.location.href = `/data-comparison/objects-config?config=${configParam}`;
            } else {
                window.location.href = `/data-comparison/objects-config?config=${configParam}`;
            }
        } else {
            this.logger.error('No config data available for object/date configuration');
            this.showToast('Configuration data missing. Please try again.', 'error');
        }
    }

    backToWelcome() {
        this.logger.info(' Returning to welcome page');
        
        if (this.isInExtensionShell && window.parent) {
            window.parent.location.href = '/data-comparison/';
        } else {
            window.location.href = '/data-comparison/';
        }
    }

    createAnotherConfig() {
        this.logger.info(' Creating another configuration');
        
        // Reset state for new configuration
        this.selectedOrgs = [];
        this.configData = null;
        this.setState('org-selection');
        this.setAppState('idle', 'Select organizations');
        this.renderOrganizations();
    }

    // ========================================
    // EVENT HANDLERS (Updated)
    // ========================================

    bindEvents() {
        this.logger.debug('Binding event listeners');

        // Error state events
        this.elements.retryBtn?.addEventListener('click', () => this.loadOrganizations());
        this.elements.backBtn?.addEventListener('click', () => this.backToWelcome());

        // Org selection events
        this.elements.selectAllBtn?.addEventListener('click', () => this.selectAllOrganizations());
        this.elements.clearSelectionBtn?.addEventListener('click', () => this.clearOrgSelection());
        this.elements.generateConfigBtn?.addEventListener('click', () => this.generateConfiguration()); // Updated

        // Success events (updated for new flow)
        this.elements.proceedToObjectsBtn?.addEventListener('click', () => this.proceedToObjectsAndDateFilters());
        this.elements.createAnotherBtn?.addEventListener('click', () => this.createAnotherConfig());

        // Org list delegation
        this.elements.orgsList?.addEventListener('click', (e) => this.handleOrgClick(e));
        this.elements.orgsList?.addEventListener('change', (e) => this.handleOrgChange(e));

        this.logger.debug('Event listeners bound for updated flow');
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    showToast(message, type = 'info') {
        const toastContainer = this.elements.toastContainer;
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        this.initializeLucideIcons();
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
        
        this.logger.debug('Toast shown', { message, type });
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
            configData: this.configData,
            workflow: 'org-selection-to-config-generation-to-objects-dates'
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log(' DOM loaded, initializing Org Selection...');
    window.orgSelection = new OrgSelection();
});

// Global API
window.OrgSelection = {
    getAppInfo: () => window.orgSelection?.getAppInfo(),
    setTheme: (theme, variables) => window.orgSelection?.updateTheme(theme, variables)
};