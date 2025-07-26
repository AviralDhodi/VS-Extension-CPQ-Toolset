/**
 * Filter Configuration - Frontend Logic
 * Handles date filters and active conditions per org per object
 */
class FilterConfiguration {
    constructor() {
        this.appName = 'Filter Configuration';
        this.appVersion = '1.0.0';
        this.currentState = 'loading'; // loading, org-selection, object-selection, filter-config
        this.isInExtensionShell = window.parent !== window;
        this.logger = null;
        this.themeReceived = false;

        // Data state
        this.configData = null;
        this.selectedOrgs = [];
        this.validatedConfig = {};
        this.selectedOrg = null;
        this.selectedObject = null;
        this.objectFields = [];
        this.filterConfigurations = {}; // Per org per object filters

        // Elements
        this.elements = {
            // Header
            configName: document.getElementById('config-name'),
            orgCount: document.getElementById('org-count'),
            objectCount: document.getElementById('object-count'),
            
            // Organization selector
            currentOrg: document.getElementById('current-org'),
            orgSelect: document.getElementById('org-select'),
            
            // Object search
            objectSearchSection: document.getElementById('object-search-section'),
            objectSearch: document.getElementById('object-search'),
            objectsGrid: document.getElementById('objects-grid'),
            
            // Filter form
            filterForm: document.getElementById('filter-form'),
            selectedOrg: document.getElementById('selected-org'),
            selectedObject: document.getElementById('selected-object'),
            
            // Active conditions
            enableActiveFilter: document.getElementById('enable-active-filter'),
            activeConfig: document.getElementById('active-config'),
            activeFieldsList: document.getElementById('active-fields-list'),
            activeCondition: document.getElementById('active-condition'),
            
            // Date filters
            enableDateFilter: document.getElementById('enable-date-filter'),
            dateConfig: document.getElementById('date-config'),
            enableCreatedFilter: document.getElementById('enable-created-filter'),
            createdDateRange: document.getElementById('created-date-range'),
            createdStart: document.getElementById('created-start'),
            createdEnd: document.getElementById('created-end'),
            enableModifiedFilter: document.getElementById('enable-modified-filter'),
            modifiedDateRange: document.getElementById('modified-date-range'),
            modifiedStart: document.getElementById('modified-start'),
            modifiedEnd: document.getElementById('modified-end'),
            
            // Actions
            previewFilterBtn: document.getElementById('preview-filter-btn'),
            saveFilterBtn: document.getElementById('save-filter-btn'),
            
            // Summary
            filterSummary: document.getElementById('filter-summary'),
            configuredCount: document.getElementById('configured-count'),
            totalCount: document.getElementById('total-count'),
            summaryGrid: document.getElementById('summary-grid'),
            
            // Action bar
            backToObjectsBtn: document.getElementById('back-to-objects-btn'),
            finishConfigBtn: document.getElementById('finish-config-btn'),
            
            // Modal
            previewModal: document.getElementById('preview-modal'),
            closePreviewModal: document.getElementById('close-preview-modal'),
            queryPreview: document.getElementById('query-preview'),
            filterDetails: document.getElementById('filter-details'),
            copyQueryBtn: document.getElementById('copy-query-btn'),
            applyPreviewBtn: document.getElementById('apply-preview-btn')
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
        
        this.logger.info('Filter Configuration initialized');
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
                        location: 'filterConfiguration/index.js',
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
        this.setAppState('loading', 'Loading filter configuration');
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
        
        this.updateUIForState(newState);
    }

    updateUIForState(state) {
        switch (state) {
            case 'loading':
                // Keep all sections hidden while loading
                break;
            case 'org-selection':
                this.updateSummary();
                break;
            case 'object-selection':
                this.elements.objectSearchSection.style.display = 'block';
                this.renderObjects();
                break;
            case 'filter-config':
                this.elements.filterForm.style.display = 'block';
                break;
        }
    }

    // ========================================
    // CONFIGURATION LOADING
    // ========================================

    async loadConfiguration() {
        this.logger.info('🔄 Loading filter configuration from URL params');
        
        this.showLoader('Loading configuration...', 10);
        
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const configParam = urlParams.get('config');
            
            if (!configParam) {
                throw new Error('No configuration parameter found in URL');
            }
            
            const configData = JSON.parse(decodeURIComponent(configParam));
            this.configData = configData;
            this.selectedOrgs = configData.selectedOrgs || [];
            this.validatedConfig = configData.validatedConfig || {};
            
            this.updateLoader(50, 'Loading existing filters...');
            
            // Load existing filter configurations
            await this.loadExistingFilters();
            
            this.updateLoader(80, 'Setting up interface...');
            
            // Update header info
            this.updateHeaderInfo();
            
            // Populate organization dropdown
            this.populateOrgDropdown();
            
            this.updateLoader(100, 'Ready');
            this.hideLoader();
            
            this.setState('org-selection');
            this.setAppState('idle', 'Filter configuration ready');
            
        } catch (error) {
            this.logger.error('Failed to load configuration', { error: error.message });
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
        
        if (this.elements.objectCount && this.validatedConfig) {
            const objectCount = Object.keys(this.validatedConfig).length;
            this.elements.objectCount.textContent = `${objectCount} objects`;
        }
    }

    async loadExistingFilters() {
        this.logger.info('📋 Loading existing filter configurations');
        
        try {
            const response = await fetch('/data-comparison/api/config/filters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.configData.filename
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.filters) {
                this.filterConfigurations = data.filters;
                this.logger.info('Existing filters loaded', { 
                    count: Object.keys(this.filterConfigurations).length 
                });
            }
            
        } catch (error) {
            this.logger.warn('Failed to load existing filters, starting fresh', { error: error.message });
            this.filterConfigurations = {};
        }
    }

    populateOrgDropdown() {
        if (!this.elements.orgSelect || !this.selectedOrgs) return;
        
        const html = this.selectedOrgs.map(org => `
            <option value="${org.username}">${org.alias || org.username}</option>
        `).join('');
        
        this.elements.orgSelect.innerHTML = `
            <option value="">Choose an organization...</option>
            ${html}
        `;
    }

    // ========================================
    // ORGANIZATION SELECTION
    // ========================================

    handleOrgSelection(orgUsername) {
        this.logger.info('🏢 Organization selected', { org: orgUsername });
        
        this.selectedOrg = this.selectedOrgs.find(org => org.username === orgUsername);
        
        if (this.selectedOrg) {
            // Update UI
            if (this.elements.currentOrg) {
                this.elements.currentOrg.textContent = this.selectedOrg.alias || this.selectedOrg.username;
            }
            
            this.setState('object-selection');
        }
    }

    // ========================================
    // OBJECT SELECTION
    // ========================================

    renderObjects() {
        if (!this.elements.objectsGrid || !this.validatedConfig) return;
        
        this.logger.debug('Rendering objects for filter configuration');
        
        const html = Object.keys(this.validatedConfig).map(objectName => {
            const isConfigured = this.isObjectConfigured(objectName);
            
            return `
                <div class="object-card ${isConfigured ? 'configured' : ''}" data-object-name="${objectName}">
                    <div class="object-icon">
                        <i data-lucide="database"></i>
                    </div>
                    <div class="object-name">${objectName}</div>
                    <div class="object-label">${this.getObjectLabel(objectName)}</div>
                    <div class="filter-status ${isConfigured ? 'configured' : 'pending'}">
                        ${isConfigured ? 'Configured' : 'Pending'}
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.objectsGrid.innerHTML = html;
        this.initializeLucideIcons();
    }

    isObjectConfigured(objectName) {
        const orgKey = this.selectedOrg?.username;
        return !!(this.filterConfigurations[orgKey] && this.filterConfigurations[orgKey][objectName]);
    }

    getObjectLabel(objectName) {
        // Generate a friendly label from object name
        return objectName.replace(/([A-Z])/g, ' $1').replace(/^_+|_+$/g, '').trim();
    }

    async handleObjectSelection(objectName) {
        this.logger.info('📂 Object selected for filter configuration', { 
            org: this.selectedOrg?.username, 
            object: objectName 
        });
        
        this.selectedObject = objectName;
        
        // Update UI selection
        this.elements.objectsGrid?.querySelectorAll('.object-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const objectCard = this.elements.objectsGrid?.querySelector(`[data-object-name="${objectName}"]`);
        objectCard?.classList.add('selected');
        
        // Load fields and setup form
        await this.loadObjectFields(objectName);
        this.setupFilterForm();
        
        this.setState('filter-config');
    }

    async loadObjectFields(objectName) {
        this.logger.info('🔍 Loading fields for filter configuration', { object: objectName });
        
        this.setAppState('loading', `Loading fields for ${objectName}`);
        this.showLoader(`Loading fields for ${objectName}...`, 0);
        
        try {
            const response = await fetch(`/data-comparison/api/objects/${encodeURIComponent(objectName)}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    orgs: [this.selectedOrg.username],
                    includeTypes: true
                })
            });
            
            this.updateLoader(70, 'Processing fields...');
            
            const data = await response.json();
            
            if (data.success) {
                this.objectFields = data.fields;
                this.hideLoader();
                this.setAppState('idle', 'Filter configuration');
                
                this.logger.info('Object fields loaded for filters', { 
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
    // FILTER FORM SETUP
    // ========================================

    setupFilterForm() {
        // Update form header
        if (this.elements.selectedOrg && this.selectedOrg) {
            this.elements.selectedOrg.textContent = this.selectedOrg.alias || this.selectedOrg.username;
        }
        
        if (this.elements.selectedObject) {
            this.elements.selectedObject.textContent = this.selectedObject;
        }
        
        // Load existing configuration for this org+object
        this.loadExistingFilterConfig();
        
        // Setup active fields
        this.setupActiveFields();
        
        // Setup date filters with defaults
        this.setupDateFilters();
    }

    loadExistingFilterConfig() {
        const orgKey = this.selectedOrg?.username;
        const existingConfig = this.filterConfigurations[orgKey]?.[this.selectedObject];
        
        if (existingConfig) {
            this.logger.debug('Loading existing filter config', { 
                org: orgKey, 
                object: this.selectedObject,
                config: existingConfig
            });
            
            // Active filters
            if (existingConfig.active) {
                this.elements.enableActiveFilter.checked = true;
                this.toggleActiveConfig(true);
                this.elements.activeCondition.value = existingConfig.active.condition || '';
                
                // Select active fields
                existingConfig.active.fields?.forEach(fieldName => {
                    const checkbox = this.elements.activeFieldsList?.querySelector(`input[value="${fieldName}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            // Date filters
            if (existingConfig.dateFilters) {
                this.elements.enableDateFilter.checked = true;
                this.toggleDateConfig(true);
                
                // Created date
                if (existingConfig.dateFilters.created) {
                    this.elements.enableCreatedFilter.checked = true;
                    this.toggleDateRange('created', true);
                    this.elements.createdStart.value = existingConfig.dateFilters.created.start || '';
                    this.elements.createdEnd.value = existingConfig.dateFilters.created.end || '';
                }
                
                // Modified date
                if (existingConfig.dateFilters.modified) {
                    this.elements.enableModifiedFilter.checked = true;
                    this.toggleDateRange('modified', true);
                    this.elements.modifiedStart.value = existingConfig.dateFilters.modified.start || '';
                    this.elements.modifiedEnd.value = existingConfig.dateFilters.modified.end || '';
                }
            }
        }
    }

    setupActiveFields() {
        if (!this.elements.activeFieldsList || !this.objectFields) return;
        
        // Filter for boolean fields that could be active fields
        const activeFields = this.objectFields.filter(field => 
            field.type === 'boolean' || 
            field.name.toLowerCase().includes('active') ||
            field.name.toLowerCase().includes('enabled')
        );
        
        const html = activeFields.map(field => `
            <div class="field-option">
                <input type="checkbox" class="field-checkbox" value="${field.name}" id="active-field-${field.name}">
                <label for="active-field-${field.name}" class="field-name">${field.name}</label>
            </div>
        `).join('');
        
        this.elements.activeFieldsList.innerHTML = html;
        
        this.logger.debug('Active fields setup completed', { count: activeFields.length });
    }

    setupDateFilters() {
        // Set default date range (last 30 days)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const formatDate = (date) => date.toISOString().split('T')[0];
        
        // Set default values
        this.elements.createdStart.value = formatDate(thirtyDaysAgo);
        this.elements.createdEnd.value = formatDate(today);
        this.elements.modifiedStart.value = formatDate(thirtyDaysAgo);
        this.elements.modifiedEnd.value = formatDate(today);
    }

    // ========================================
    // FILTER CONFIGURATION
    // ========================================

    toggleActiveConfig(enabled) {
        this.elements.activeConfig?.classList.toggle('enabled', enabled);
    }

    toggleDateConfig(enabled) {
        this.elements.dateConfig?.classList.toggle('enabled', enabled);
    }

    toggleDateRange(type, enabled) {
        const rangeElement = type === 'created' ? 
            this.elements.createdDateRange : 
            this.elements.modifiedDateRange;
        
        rangeElement?.classList.toggle('enabled', enabled);
    }

    // ========================================
    // FILTER PREVIEW
    // ========================================

    async previewFilter() {
        this.logger.info('👁️ Generating filter preview');
        
        const filterConfig = this.buildCurrentFilterConfig();
        
        try {
            const query = this.generateSOQLQuery(filterConfig);
            const details = this.generateFilterDetails(filterConfig);
            
            this.showFilterPreview(query, details);
            
        } catch (error) {
            this.logger.error('Failed to generate filter preview', { error: error.message });
        }
    }

    buildCurrentFilterConfig() {
        const config = {};
        
        // Active filters
        if (this.elements.enableActiveFilter.checked) {
            const selectedFields = Array.from(
                this.elements.activeFieldsList?.querySelectorAll('input:checked') || []
            ).map(input => input.value);
            
            config.active = {
                fields: selectedFields,
                condition: this.elements.activeCondition.value.trim()
            };
        }
        
        // Date filters
        if (this.elements.enableDateFilter.checked) {
            config.dateFilters = {};
            
            if (this.elements.enableCreatedFilter.checked) {
                config.dateFilters.created = {
                    start: this.elements.createdStart.value,
                    end: this.elements.createdEnd.value
                };
            }
            
            if (this.elements.enableModifiedFilter.checked) {
                config.dateFilters.modified = {
                    start: this.elements.modifiedStart.value,
                    end: this.elements.modifiedEnd.value
                };
            }
        }
        
        return config;
    }

    generateSOQLQuery(filterConfig) {
        const baseFields = this.validatedConfig[this.selectedObject]?.fields || [];
        const fields = baseFields.join(', ');
        
        let query = `SELECT ${fields} FROM ${this.selectedObject}`;
        const whereConditions = [];
        
        // Add active condition
        if (filterConfig.active?.condition) {
            whereConditions.push(`(${filterConfig.active.condition})`);
        }
        
        // Add date conditions
        if (filterConfig.dateFilters?.created) {
            const { start, end } = filterConfig.dateFilters.created;
            if (start) whereConditions.push(`CreatedDate >= ${start}T00:00:00Z`);
            if (end) whereConditions.push(`CreatedDate <= ${end}T23:59:59Z`);
        }
        
        if (filterConfig.dateFilters?.modified) {
            const { start, end } = filterConfig.dateFilters.modified;
            if (start) whereConditions.push(`LastModifiedDate >= ${start}T00:00:00Z`);
            if (end) whereConditions.push(`LastModifiedDate <= ${end}T23:59:59Z`);
        }
        
        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`;
        }
        
        return query;
    }

    generateFilterDetails(filterConfig) {
        const details = [];
        
        if (filterConfig.active) {
            details.push({
                label: 'Active Fields',
                value: filterConfig.active.fields.join(', ') || 'None'
            });
            details.push({
                label: 'Active Condition',
                value: filterConfig.active.condition || 'None'
            });
        }
        
        if (filterConfig.dateFilters?.created) {
            const { start, end } = filterConfig.dateFilters.created;
            details.push({
                label: 'Created Date Range',
                value: `${start || 'No start'} to ${end || 'No end'}`
            });
        }
        
        if (filterConfig.dateFilters?.modified) {
            const { start, end } = filterConfig.dateFilters.modified;
            details.push({
                label: 'Modified Date Range',
                value: `${start || 'No start'} to ${end || 'No end'}`
            });
        }
        
        return details;
    }

    showFilterPreview(query, details) {
        // Update modal content
        if (this.elements.queryPreview) {
            this.elements.queryPreview.textContent = query;
        }
        
        if (this.elements.filterDetails) {
            const html = details.map(detail => `
                <div class="detail-item">
                    <span class="detail-item-label">${detail.label}</span>
                    <span class="detail-item-value">${detail.value}</span>
                </div>
            `).join('');
            
            this.elements.filterDetails.innerHTML = html;
        }
        
        // Show modal
        this.elements.previewModal?.classList.remove('hidden');
    }

    hideFilterPreview() {
        this.elements.previewModal?.classList.add('hidden');
    }

    copyQueryToClipboard() {
        const query = this.elements.queryPreview?.textContent;
        
        if (query && navigator.clipboard) {
            navigator.clipboard.writeText(query).then(() => {
                this.showTemporaryFeedback('Query copied to clipboard!', 'success');
            }).catch(error => {
                this.logger.warn('Failed to copy to clipboard', { error: error.message });
            });
        }
    }

    // ========================================
    // SAVE FILTERS
    // ========================================

    async saveFilters() {
        this.logger.info('💾 Saving filter configuration');
        
        if (!this.selectedOrg || !this.selectedObject) {
            this.logger.warn('Cannot save: no org or object selected');
            return;
        }
        
        this.setAppState('loading', 'Saving filters');
        this.showLoader('Saving filter configuration...', 0);
        
        try {
            const filterConfig = this.buildCurrentFilterConfig();
            
            // Update internal state
            const orgKey = this.selectedOrg.username;
            if (!this.filterConfigurations[orgKey]) {
                this.filterConfigurations[orgKey] = {};
            }
            this.filterConfigurations[orgKey][this.selectedObject] = filterConfig;
            
            this.updateLoader(50, 'Updating configuration file...');
            
            // Save to configuration file
            const response = await fetch('/data-comparison/api/config/filters/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.configData.filename,
                    orgKey: orgKey,
                    objectName: this.selectedObject,
                    filters: filterConfig
                })
            });
            
            this.updateLoader(100, 'Filters saved');
            
            const result = await response.json();
            
            if (result.success) {
                this.hideLoader();
                this.setAppState('success', 'Filters saved');
                this.showTemporaryFeedback('Filter configuration saved successfully!', 'success');
                
                // Update UI
                this.renderObjects(); // Refresh object status
                this.updateSummary();
                
                this.logger.info('Filter configuration saved successfully');
            } else {
                throw new Error(result.error || 'Failed to save filter configuration');
            }
            
        } catch (error) {
            this.logger.error('Failed to save filter configuration', { error: error.message });
            this.setAppState('error', 'Failed to save filters');
            this.hideLoader();
        }
    }

    // ========================================
    // SUMMARY
    // ========================================

    updateSummary() {
        const totalCombinations = this.selectedOrgs.length * Object.keys(this.validatedConfig).length;
        let configuredCount = 0;
        
        // Count configured org+object combinations
        Object.values(this.filterConfigurations).forEach(orgFilters => {
            configuredCount += Object.keys(orgFilters).length;
        });
        
        // Update stats
        if (this.elements.configuredCount) {
            this.elements.configuredCount.textContent = configuredCount.toString();
        }
        if (this.elements.totalCount) {
            this.elements.totalCount.textContent = totalCombinations.toString();
        }
        
        // Update finish button
        if (this.elements.finishConfigBtn) {
            this.elements.finishConfigBtn.disabled = configuredCount === 0;
        }
        
        // Render summary grid
        this.renderSummaryGrid();
    }

    renderSummaryGrid() {
        if (!this.elements.summaryGrid) return;
        
        const summaryItems = [];
        
        // Generate summary for each configured org+object
        Object.entries(this.filterConfigurations).forEach(([orgKey, orgFilters]) => {
            const org = this.selectedOrgs.find(o => o.username === orgKey);
            
            Object.entries(orgFilters).forEach(([objectName, filters]) => {
                summaryItems.push({
                    org: org?.alias || orgKey,
                    object: objectName,
                    filters: filters
                });
            });
        });
        
        const html = summaryItems.map(item => `
            <div class="summary-item">
                <div class="summary-item-header">
                    <span class="summary-org">${item.org}</span>
                    <span class="summary-object">${item.object}</span>
                </div>
                <div class="summary-details">
                    ${this.renderSummaryDetails(item.filters)}
                </div>
            </div>
        `).join('');
        
        this.elements.summaryGrid.innerHTML = html;
    }

    renderSummaryDetails(filters) {
        const details = [];
        
        if (filters.active) {
            details.push(`
                <div class="detail-row">
                    <span class="detail-label">Active Fields:</span>
                    <span class="detail-value">${filters.active.fields.length || 0}</span>
                </div>
            `);
        }
        
        if (filters.dateFilters) {
            const dateCount = Object.keys(filters.dateFilters).length;
            details.push(`
                <div class="detail-row">
                    <span class="detail-label">Date Filters:</span>
                    <span class="detail-value">${dateCount}</span>
                </div>
            `);
        }
        
        return details.join('');
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================

    bindEvents() {
        this.logger.debug('Binding event listeners');

        // Organization selection
        this.elements.orgSelect?.addEventListener('change', (e) => {
            const orgUsername = e.target.value;
            if (orgUsername) {
                this.handleOrgSelection(orgUsername);
            }
        });

        // Object search
        this.elements.objectSearch?.addEventListener('input', (e) => {
            this.filterObjects(e.target.value);
        });

        // Object selection
        this.elements.objectsGrid?.addEventListener('click', (e) => {
            const objectCard = e.target.closest('.object-card');
            if (objectCard) {
                const objectName = objectCard.dataset.objectName;
                this.handleObjectSelection(objectName);
            }
        });

        // Filter toggles
        this.elements.enableActiveFilter?.addEventListener('change', (e) => {
            this.toggleActiveConfig(e.target.checked);
        });

        this.elements.enableDateFilter?.addEventListener('change', (e) => {
            this.toggleDateConfig(e.target.checked);
        });

        this.elements.enableCreatedFilter?.addEventListener('change', (e) => {
            this.toggleDateRange('created', e.target.checked);
        });

        this.elements.enableModifiedFilter?.addEventListener('change', (e) => {
            this.toggleDateRange('modified', e.target.checked);
        });

        // Filter actions
        this.elements.previewFilterBtn?.addEventListener('click', () => this.previewFilter());
        this.elements.saveFilterBtn?.addEventListener('click', () => this.saveFilters());

        // Modal
        this.elements.closePreviewModal?.addEventListener('click', () => this.hideFilterPreview());
        this.elements.copyQueryBtn?.addEventListener('click', () => this.copyQueryToClipboard());
        this.elements.applyPreviewBtn?.addEventListener('click', () => {
            this.hideFilterPreview();
            this.saveFilters();
        });

        // Modal overlay
        this.elements.previewModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.previewModal) {
                this.hideFilterPreview();
            }
        });

        // Action bar
        this.elements.backToObjectsBtn?.addEventListener('click', () => this.navigateToObjects());
        this.elements.finishConfigBtn?.addEventListener('click', () => this.finishConfiguration());

        this.logger.debug('Event listeners bound');
    }

    filterObjects(searchTerm) {
        if (!this.elements.objectsGrid) return;
        
        const term = searchTerm.toLowerCase();
        const objectCards = this.elements.objectsGrid.querySelectorAll('.object-card');
        
        objectCards.forEach(card => {
            const objectName = card.querySelector('.object-name')?.textContent.toLowerCase() || '';
            const objectLabel = card.querySelector('.object-label')?.textContent.toLowerCase() || '';
            
            const matches = objectName.includes(term) || objectLabel.includes(term);
            card.style.display = matches ? '' : 'none';
        });
        
        this.logger.debug('Objects filtered', { searchTerm, term });
    }

    navigateToObjects() {
        this.logger.info('🔙 Navigating back to object selection');
        
        const objectParams = encodeURIComponent(JSON.stringify({
            filename: this.configData.filename,
            selectedOrgs: this.selectedOrgs
        }));
        
        const url = `/data-comparison/object-selection?config=${objectParams}`;
        
        if (this.isInExtensionShell && window.parent) {
            window.parent.location.href = url;
        } else {
            window.location.href = url;
        }
    }

    async finishConfiguration() {
        this.logger.info('✅ Finishing configuration setup');
        
        this.setAppState('loading', 'Finalizing configuration');
        this.showLoader('Finalizing configuration...', 0);
        
        try {
            // Mark configuration as complete
            const response = await fetch('/data-comparison/api/config/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.configData.filename,
                    status: 'complete'
                })
            });
            
            this.updateLoader(100, 'Configuration complete');
            
            const result = await response.json();
            
            if (result.success) {
                this.hideLoader();
                this.setAppState('success', 'Configuration complete');
                this.showTemporaryFeedback('Configuration setup completed successfully!', 'success');
                
                // Navigate to comparison or results
                setTimeout(() => {
                    if (this.isInExtensionShell && window.parent) {
                        window.parent.location.href = '/data-comparison/';
                    } else {
                        window.location.href = '/data-comparison/';
                    }
                }, 2000);
                
                this.logger.info('Configuration setup completed');
            } else {
                throw new Error(result.error || 'Failed to finalize configuration');
            }
            
        } catch (error) {
            this.logger.error('Failed to finalize configuration', { error: error.message });
            this.setAppState('error', 'Failed to finalize configuration');
            this.hideLoader();
        }
    }

    showTemporaryFeedback(message, type = 'info') {
        const feedback = document.createElement('div');
        feedback.className = `feedback-message ${type}`;
        feedback.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(feedback);
        
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
            selectedOrg: this.selectedOrg,
            selectedObject: this.selectedObject,
            filterConfigurations: this.filterConfigurations
        };
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM loaded, initializing Filter Configuration...');
    window.filterConfiguration = new FilterConfiguration();
});

// Global API
window.FilterConfiguration = {
    getAppInfo: () => window.filterConfiguration?.getAppInfo(),
    setTheme: (theme, variables) => window.filterConfiguration?.updateTheme(theme, variables)
};