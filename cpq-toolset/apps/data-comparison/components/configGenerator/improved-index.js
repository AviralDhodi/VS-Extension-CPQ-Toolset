/**
 * Improved Configuration Generator - Enhanced UX with V1 Panels
 * Combines V1's superior UX patterns with V2's modern architecture
 */
class ImprovedConfigGenerator {
    constructor() {
        console.log('ImprovedConfigGenerator: Initializing...');
        console.log('Document state:', document.readyState);
        console.log('Window location:', window.location.href);
        console.log('SLDS loaded:', !!document.querySelector('.slds-scope'));
        
        this.appName = 'Configuration Generator Enhanced';
        this.appVersion = '2.0.0';
        this.currentStep = 'orgs'; // orgs, objects, filters, finalize
        this.isInExtensionShell = window.parent !== window;
        this.themeReceived = false;
        
        // V2-style validated/volatile memory management
        this.config = {
            validated: this.loadValidatedConfig(), // Persistent config data from sessionStorage
            volatile: {}   // In-memory working copy
        };
        
        // Initialize config structure
        if (!this.config.validated.version) {
            this.config.validated = {
                version: '3.0.0',
                createdAt: new Date().toISOString(),
                orgs: [],
                objects: {},
                metadata: {
                    configGenerator: 'enhanced',
                    uiVersion: 'v3-slds-2.0'
                }
            };
        }
        
        // Data state
        this.organizations = [];
        this.selectedOrgs = [];
        this.commonObjects = [];
        this.selectedObject = null;
        this.objectFields = [];
        this.objectLookupFields = [];
        this.objectForeignKeys = [];
        this.configuredObjects = new Map(); // objectName -> { fields, lookups, foreignKey, orgConditions }
        
        // Panel states
        this.panels = {
            objects: { state: 'loading', searchTerm: '', sortMode: 'name', groupByPackage: false },
            fields: { 
                state: 'empty', 
                searchTerm: '', 
                mode: 'fields', 
                selectedFields: new Set(),
                selectedLookups: new Set(),
                selectedForeignKey: null,
                lookupFKs: new Map()  // Fixed: Initialize lookupFKs Map
            },
            config: { state: 'active' }
        };
        
        // Field loading states
        this.fieldLoadingStates = {
            hasAttemptedLoad: false,
            isLoading: false,
            lastError: null
        };
        
        // Object loading states  
        this.objectLoadingStates = {
            hasAttemptedLoad: false,
            isLoading: false,
            lastError: null
        };
        
        // Event listener flags to prevent duplicates
        this.eventListenersAdded = {
            fields: false,
            lookups: false
        };
        
        // Initialize elements and event listeners
        this.initializeElements();
        this.initializeEventListeners();
        this.initializeShellCommunication();
        
        // Start the flow
        this.loadOrganizations();
    }

    initializeElements() {
        console.log('ImprovedConfigGenerator: Initializing elements...');
        
        // Debug: Check for critical elements
        const criticalElements = ['orgs-page', 'orgs-loading', 'orgs-content', 'orgs-error'];
        criticalElements.forEach(id => {
            const el = document.getElementById(id);
            console.log(`Element #${id}:`, el ? 'Found' : 'NOT FOUND');
            if (el) {
                console.log(`  Classes: ${el.className}`);
                console.log(`  Display: ${window.getComputedStyle(el).display}`);
            }
        });
        
        this.elements = {
            // Workflow steps
            stepOrgs: document.getElementById('step-orgs'),
            stepObjects: document.getElementById('step-objects'),
            stepFilters: document.getElementById('step-filters'),
            stepFinalize: document.getElementById('step-finalize'),
            
            // Page containers
            orgsPage: document.getElementById('orgs-page'),
            objectsPage: document.getElementById('objects-page'),
            filtersPage: document.getElementById('filters-page'),
            finalizePage: document.getElementById('finalize-page'),
            
            // Orgs selection
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
            
            // Panels
            panel1: document.getElementById('panel1'),
            panel2: document.getElementById('panel2'),
            panel3: document.getElementById('panel3'),
            
            // Panel 1 - Objects
            p1Search: document.getElementById('p1-search'),
            p1SortPackage: document.getElementById('p1-sort-package'),
            p1SortDirection: document.getElementById('p1-sort-direction'),
            p1SortIcon: document.getElementById('p1-sort-icon'),
            p1ObjectsList: document.getElementById('p1-objects-list'),
            retryObjects: document.getElementById('retry-objects'),
            retryFields: document.getElementById('retry-fields'),
            
            // Panel 2 - Fields & Lookups
            p2Title: document.getElementById('p2-title'),
            p2FieldsTab: document.getElementById('p2-fields-tab'),
            p2LookupsTab: document.getElementById('p2-lookups-tab'),
            p2Search: document.getElementById('p2-search'),
            fieldsContent: document.getElementById('fields-content'),
            lookupsContent: document.getElementById('lookups-content'),
            selectAllFields: document.getElementById('select-all-fields'),
            clearAllFields: document.getElementById('clear-all-fields'),
            p2FieldsList: document.getElementById('p2-fields-list'),
            selectAllLookups: document.getElementById('select-all-lookups'),
            clearAllLookups: document.getElementById('clear-all-lookups'),
            p2LookupsList: document.getElementById('p2-lookups-list'),
            foreignKeyList: document.getElementById('foreign-key-list'),
            
            // Panel 3 - Config
            p3CurrentObject: document.getElementById('p3-current-object'),
            selectedFieldsCount: document.getElementById('selected-fields-count'),
            selectedLookupsCount: document.getElementById('selected-lookups-count'),
            foreignKeyStatus: document.getElementById('foreign-key-status'),
            foreignKeyInfo: document.getElementById('foreign-key-info'),
            selectedFkName: document.getElementById('selected-fk-name'),
            validateObjectBtn: document.getElementById('validate-object-btn'),
            configuredObjectsList: document.getElementById('configured-objects-list'),
            proceedFiltersBtn: document.getElementById('proceed-filters-btn'),
            
            // Active Conditions page
            conditionsObjectsList: document.getElementById('conditions-objects-list'),
            backToObjectsBtn: document.getElementById('back-to-objects-btn'),
            finalizeConfigBtn: document.getElementById('finalize-config-btn'),
            
            // Modals
            conditionsModal: document.getElementById('conditions-modal'),
            closeConditionsModal: document.getElementById('close-conditions-modal'),
            conditionObjectName: document.getElementById('condition-object-name'),
            orgConditionsContent: document.getElementById('org-conditions-content'),
            cancelConditions: document.getElementById('cancel-conditions'),
            saveConditions: document.getElementById('save-conditions'),
            
            fieldDetailsModal: document.getElementById('field-details-modal'),
            closeFieldDetailsModal: document.getElementById('close-field-details-modal'),
            fieldDetailsTitle: document.getElementById('field-details-title'),
            fieldDetailsContent: document.getElementById('field-details-content'),
            fieldDetailsClose: document.getElementById('field-details-close')
        };
        
        // Check if essential elements exist
        if (!this.elements.stepOrgs) {
            console.error('ImprovedConfigGenerator: Essential DOM elements not found! Check if HTML structure matches expected IDs.');
            console.log('Document body:', document.body.innerHTML.substring(0, 500));
        }
    }

    initializeEventListeners() {
        // Workflow step navigation
        document.querySelectorAll('.slds-path__item').forEach(step => {
            step.addEventListener('click', (e) => {
                e.preventDefault();
                // Allow navigation to completed or current steps
                if (step.classList.contains('slds-is-complete') || 
                    step.classList.contains('slds-is-current')) {
                    const stepName = step.dataset.step;
                    if (stepName) {
                        this.navigateToStep(stepName);
                    }
                }
            });
        });
        
        // Orgs selection events
        this.elements.retryOrgsBtn?.addEventListener('click', () => this.loadOrganizations());
        this.elements.selectAllOrgs?.addEventListener('click', () => this.selectAllOrganizations());
        this.elements.clearOrgs?.addEventListener('click', () => this.clearOrganizations());
        this.elements.validateOrgsBtn?.addEventListener('click', () => this.validateOrganizations());
        
        // Panel 1 events (V1-style)
        this.elements.p1Search?.addEventListener('input', (e) => {
            this.panels.objects.searchTerm = e.target.value.toLowerCase();
            this.renderObjects();
        });
        
        this.elements.p1SortPackage?.addEventListener('click', () => {
            this.panels.objects.groupByPackage = !this.panels.objects.groupByPackage;
            this.elements.p1SortPackage.classList.toggle('active', this.panels.objects.groupByPackage);
            this.renderObjects();
        });
        
        this.elements.p1SortDirection?.addEventListener('click', () => {
            this.panels.objects.sortDirection = this.panels.objects.sortDirection === 'asc' ? 'desc' : 'asc';
            const direction = this.panels.objects.sortDirection;
            this.elements.p1SortIcon.innerHTML = `<use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#${direction === 'asc' ? 'arrowup' : 'arrowdown'}"></use>`;
            this.renderObjects();
        });
        
        console.log('🎯 Setting up p1ObjectsList event listener...');
        console.log('📋 p1ObjectsList element:', this.elements.p1ObjectsList);
        
        this.elements.p1ObjectsList?.addEventListener('click', (e) => {
            console.log('🖱️ Object list clicked!', e.target);
            const objectItem = e.target.closest('.object-item');
            console.log('🔍 Found object item:', objectItem);
            if (!objectItem) {
                console.log('⚠️ No object-item found in click');
                return;
            }
            
            const objectName = objectItem.dataset.object;
            console.log('📦 Object name from dataset:', objectName);
            this.selectObject(objectName);
        });
        
        this.elements.retryObjects?.addEventListener('click', () => this.loadCommonObjects());
        this.elements.retryFields?.addEventListener('click', () => {
            if (this.selectedObject) this.loadObjectFields(this.selectedObject);
        });
        
        // Panel 2 events - Field/Lookup tabs
        this.elements.p2FieldsTab?.addEventListener('click', () => this.switchFieldsMode('fields'));
        this.elements.p2LookupsTab?.addEventListener('click', () => this.switchFieldsMode('lookups'));
        
        this.elements.p2Search?.addEventListener('input', (e) => {
            this.panels.fields.searchTerm = e.target.value.toLowerCase();
            this.renderCurrentFieldMode();
        });
        
        // Fields tab events
        this.elements.selectAllFields?.addEventListener('click', () => this.selectAllFields());
        this.elements.clearAllFields?.addEventListener('click', () => this.clearAllFields());
        
        // Lookups tab events
        this.elements.selectAllLookups?.addEventListener('click', () => this.selectAllLookups());
        this.elements.clearAllLookups?.addEventListener('click', () => this.clearAllLookups());
        
        // Panel retry buttons
        this.elements.retryObjects?.addEventListener('click', () => this.loadCommonObjects());
        this.elements.retryFields?.addEventListener('click', () => {
            if (this.selectedObject) {
                this.loadObjectFields(this.selectedObject);
            }
        });
        
        // Panel 3 events
        this.elements.validateObjectBtn?.addEventListener('click', () => this.validateCurrentObject());
        this.elements.proceedFiltersBtn?.addEventListener('click', () => this.navigateToStep('filters'));
        
        // Filters page events
        this.elements.backToObjectsBtn?.addEventListener('click', () => this.navigateToStep('objects'));
        this.elements.finalizeConfigBtn?.addEventListener('click', () => this.navigateToStep('finalize'));
        
        // Finalize page events (Issue #4, #5, #6 fixes)
        document.getElementById('save-config-btn')?.addEventListener('click', () => this.downloadConfiguration());
        document.getElementById('start-comparison-btn')?.addEventListener('click', () => this.startComparison());
        
        // Modal events
        this.elements.closeConditionsModal?.addEventListener('click', () => this.closeModal('conditionsModal'));
        this.elements.cancelConditions?.addEventListener('click', () => this.closeModal('conditionsModal'));
        this.elements.saveConditions?.addEventListener('click', () => this.saveObjectConditions());
        
        this.elements.closeFieldDetailsModal?.addEventListener('click', () => this.closeLookupFKModal());
        this.elements.fieldDetailsClose?.addEventListener('click', () => this.closeLookupFKModal());
        
        // Modal overlay click to close
        this.elements.fieldDetailsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.fieldDetailsModal) {
                this.closeLookupFKModal();
            }
        });
        
        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.elements.fieldDetailsModal?.classList.contains('slds-fade-in-open')) {
                    this.closeLookupFKModal();
                } else if (this.elements.conditionsModal?.classList.contains('slds-fade-in-open')) {
                    this.closeModal('conditionsModal');
                }
            }
        });
        
        // Add field and lookup event listeners
        this.addFieldEventListeners();
        this.addLookupEventListeners();
    }

    initializeShellCommunication() {
        if (!this.isInExtensionShell) {
            console.log('🔍 Not in extension shell - standalone mode');
            // Apply default light theme for standalone mode
            this.applyTheme('light', {});
            return;
        }
        
        console.log('📡 Setting up shell communication');
        
        // Notify shell of app load with detailed state
        this.postMessageToShell({
            type: 'APP_LOADED',
            data: { 
                appName: 'Data Comparison - Configuration Generator',
                version: this.appVersion 
            }
        });
        
        // Set initial state
        this.postMessageToShell({
            type: 'APP_STATE_CHANGED',
            data: { 
                state: 'loading', 
                message: 'Initializing configuration generator...' 
            }
        });
        
        // Log initialization
        this.logToShell('info', 'Configuration generator initialized');
        
        // Listen for theme updates from shell
        window.addEventListener('message', (event) => {
            // Accept messages from parent frame
            if (event.source !== window.parent) {
                return;
            }

            const { type, theme, variables } = event.data;
            console.log(`📨 Received message: ${type}`, { theme, variables });

            switch (type) {
                case 'THEME_CHANGED':
                    console.log(`🎨 Theme changed to: ${theme}`);
                    this.applyTheme(theme, variables);
                    break;
                    
                case 'THEME_DATA':
                    console.log(`🎨 Received theme data: ${theme}`, variables);
                    this.applyTheme(theme, variables);
                    this.themeReceived = true;
                    break;
                    
                case 'STATE_UPDATE':
                    this.handleShellStateUpdate(event.data.state);
                    break;
                    
                default:
                    console.log('❓ Unknown message type:', type);
            }
        });
        
        // Request initial theme
        this.postMessageToShell({ type: 'REQUEST_THEME' });
        
        // Fallback: if no theme received in 2 seconds, apply default
        setTimeout(() => {
            if (!this.themeReceived) {
                console.warn('⚠️ No theme data received from shell, applying default');
                this.applyTheme('light', {});
            }
        }, 2000);
    }
    
    postMessageToShell(message) {
        if (this.isInExtensionShell && window.parent) {
            window.parent.postMessage(message, '*');
        }
    }
    
    logToShell(level, message) {
        this.postMessageToShell({
            type: 'ADD_LOG',
            data: { 
                app: 'Config Generator', 
                level: level, 
                message: message 
            }
        });
    }
    
    updateShellState(state, message) {
        this.postMessageToShell({
            type: 'APP_STATE_CHANGED',
            data: { state, message }
        });
    }
    
    showShellLoader(text, progress = 0) {
        this.postMessageToShell({
            type: 'SHOW_LOADER',
            data: { text, progress }
        });
    }
    
    updateShellLoader(progress, text) {
        this.postMessageToShell({
            type: 'UPDATE_LOADER',
            data: { progress, text }
        });
    }
    
    hideShellLoader() {
        this.postMessageToShell({
            type: 'HIDE_LOADER'
        });
    }

    applyTheme(theme, variables = {}) {
        console.log(`🎨 Applying theme: ${theme}`, variables);
        
        // Apply theme class to both html and body
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        
        // Apply theme variables if provided
        if (variables && Object.keys(variables).length > 0) {
            const root = document.documentElement;
            let appliedCount = 0;
            
            Object.entries(variables).forEach(([key, value]) => {
                if (value && value.trim()) {
                    root.style.setProperty(`--app-${key}`, value.trim());
                    appliedCount++;
                }
            });
            
            console.log(`🎨 Applied ${appliedCount} theme variables`);
        }
        
        // Force repaint
        document.body.style.display = 'none';
        document.body.offsetHeight; // Trigger reflow
        document.body.style.display = '';
        
        console.log(`🎨 Theme ${theme} applied successfully`);
        this.themeReceived = true;
    }

    handleShellStateUpdate(state) {
        // Handle any shell state updates if needed
        console.log('Shell state update:', state);
    }

    // ===== WORKFLOW NAVIGATION =====

    navigateToStep(step) {
        if (this.currentStep === step) return;
        
        // Update shell with step navigation
        const stepNames = {
            orgs: 'Organization Selection',
            objects: 'Objects & Fields Configuration', 
            filters: 'Date Filters Configuration',
            finalize: 'Configuration Finalization'
        };
        
        this.postMessageToShell({
            type: 'APP_STATE_CHANGED',
            data: { state: 'idle', message: stepNames[step] || step }
        });
        
        // Hide all pages using SLDS classes
        document.querySelectorAll('.page-container').forEach(page => {
            page.classList.add('slds-hide');
            page.classList.remove('slds-show');
        });
        
        // Update step indicators in the path
        document.querySelectorAll('.slds-path__item').forEach(stepEl => {
            stepEl.classList.remove('slds-is-current', 'slds-is-active');
            if (stepEl.classList.contains('slds-is-complete')) {
                // Keep completed steps as complete
            } else {
                stepEl.classList.add('slds-is-incomplete');
            }
        });
        
        // Show target page and activate step
        this.currentStep = step;
        const targetPage = this.elements[`${step}Page`];
        if (targetPage) {
            targetPage.classList.remove('slds-hide');
            targetPage.classList.add('slds-show');
        }
        
        const targetStep = this.elements[`step${step.charAt(0).toUpperCase() + step.slice(1)}`];
        if (targetStep) {
            targetStep.classList.remove('slds-is-incomplete');
            targetStep.classList.add('slds-is-current', 'slds-is-active');
        }
        
        // Handle step-specific logic
        if (step === 'objects') {
            this.loadCommonObjects();
        } else if (step === 'filters') {
            this.renderFiltersPage();
        } else if (step === 'finalize') {
            this.renderFinalizePage();
        }
    }

    // ===== ORGANIZATIONS SELECTION =====

    async loadOrganizations() {
        this.showOrgsState('loading');
        this.postMessageToShell({
            type: 'SHOW_LOADER',
            data: { text: 'Loading authenticated organizations...', progress: 10 }
        });
        this.postMessageToShell({
            type: 'APP_STATE_CHANGED',
            data: { state: 'loading', message: 'Loading organizations' }
        });
        
        try {
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 30, text: 'Connecting to Salesforce...' }
            });
            
            const response = await fetch('/data-comparison/api/data-comparison/orgs');
            
            if (!response.ok) {
                throw new Error(`Failed to fetch organizations: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 70, text: 'Processing organization data...' }
            });
            
            if (data.orgs) {
                this.organizations = data.orgs;
                this.renderOrganizations();
                this.showOrgsState('content');
                
                this.postMessageToShell({
                    type: 'UPDATE_LOADER',
                    data: { progress: 100, text: 'Organizations loaded successfully!' }
                });
                
                setTimeout(() => {
                    this.postMessageToShell({ type: 'HIDE_LOADER' });
                    this.postMessageToShell({
                        type: 'APP_STATE_CHANGED',
                        data: { state: 'idle', message: `${data.orgs.length} organizations available` }
                    });
                }, 500);
            } else {
                throw new Error(data.error || 'Failed to load organizations');
            }
        } catch (error) {
            console.error('Failed to load organizations:', error);
            this.elements.orgsErrorMessage.textContent = error.message;
            this.showOrgsState('error');
            
            this.postMessageToShell({ type: 'HIDE_LOADER' });
            this.postMessageToShell({
                type: 'APP_STATE_CHANGED',
                data: { state: 'error', message: 'Failed to load organizations' }
            });
        }
    }

    showOrgsState(state) {
        console.log(`showOrgsState: Setting state to '${state}'`);
        
        const states = {
            loading: this.elements.orgsLoading,
            error: this.elements.orgsError,
            content: this.elements.orgsContent
        };
        
        Object.entries(states).forEach(([stateName, element]) => {
            if (element) {
                const shouldHide = stateName !== state;
                console.log(`  ${stateName} element: ${shouldHide ? 'hiding' : 'showing'}`);
                element.classList.toggle('slds-hide', shouldHide);
                
                // Debug computed style
                const display = window.getComputedStyle(element).display;
                console.log(`  ${stateName} computed display: ${display}`);
            } else {
                console.log(`  ${stateName} element: NOT FOUND`);
            }
        });
    }

    renderOrganizations() {
        if (!this.elements.orgsList) return;
        
        const html = this.organizations.map(org => `
            <div class="slds-col slds-size_1-of-1 slds-medium-size_1-of-2 slds-large-size_1-of-3">
                <article class="slds-card org-card" data-org="${org.alias}">
                    <div class="slds-card__header slds-grid">
                        <header class="slds-media slds-media_center slds-has-flexi-truncate">
                            <div class="slds-media__figure">
                                <div class="slds-checkbox">
                                    <input type="checkbox" name="orgs" id="org-${org.alias}" class="org-checkbox" value="${org.alias}" />
                                    <label class="slds-checkbox__label" for="org-${org.alias}">
                                        <span class="slds-checkbox_faux"></span>
                                        <span class="slds-assistive-text">Select ${org.alias}</span>
                                    </label>
                                </div>
                            </div>
                            <div class="slds-media__body">
                                <h2 class="slds-card__header-title">
                                    <span class="slds-text-heading_small">${org.alias}</span>
                                </h2>
                            </div>
                        </header>
                    </div>
                    <div class="slds-card__body slds-card__body_inner">
                        <dl class="slds-list_horizontal slds-wrap">
                            <dt class="slds-item_label slds-text-color_weak slds-truncate">Username:</dt>
                            <dd class="slds-item_detail slds-truncate">${org.username || 'N/A'}</dd>
                            ${org.instanceUrl ? `
                            <dt class="slds-item_label slds-text-color_weak slds-truncate">Instance:</dt>
                            <dd class="slds-item_detail slds-truncate">${new URL(org.instanceUrl).hostname}</dd>
                            ` : ''}
                            <dt class="slds-item_label slds-text-color_weak slds-truncate">Status:</dt>
                            <dd class="slds-item_detail slds-truncate">${org.status || 'Active'}</dd>
                        </dl>
                    </div>
                </article>
            </div>
        `).join('');
        
        this.elements.orgsList.innerHTML = html;
        
        // Add checkbox listeners
        this.elements.orgsList.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                this.updateOrgSelection();
            }
        });
        
        // Add card click listeners
        this.elements.orgsList.addEventListener('click', (e) => {
            const card = e.target.closest('.org-card');
            if (card && e.target.type !== 'checkbox') {
                const checkbox = card.querySelector('.org-checkbox');
                checkbox.checked = !checkbox.checked;
                this.updateOrgSelection();
            }
        });
    }

    updateOrgSelection() {
        const checkboxes = this.elements.orgsList.querySelectorAll('.org-checkbox:checked');
        this.selectedOrgs = Array.from(checkboxes).map(cb => cb.value);
        
        console.log('updateOrgSelection:');
        console.log('  Checkboxes found:', checkboxes.length);
        console.log('  Selected orgs:', this.selectedOrgs);
        
        // Update visual state
        this.elements.orgsList.querySelectorAll('.org-card').forEach(card => {
            const checkbox = card.querySelector('.org-checkbox');
            card.classList.toggle('selected', checkbox.checked);
        });
        
        // Update selection count
        const count = this.selectedOrgs.length;
        this.elements.selectionCount.textContent = `${count} selected`;
        
        // Enable/disable validate button
        this.elements.validateOrgsBtn.disabled = count < 2;
    }

    selectAllOrganizations() {
        this.elements.orgsList.querySelectorAll('.org-checkbox').forEach(cb => {
            cb.checked = true;
        });
        this.updateOrgSelection();
    }

    clearOrganizations() {
        this.elements.orgsList.querySelectorAll('.org-checkbox').forEach(cb => {
            cb.checked = false;
        });
        this.updateOrgSelection();
    }
    
    debugSelection() {
        console.log('=== Debug Selection ===');
        console.log('Organizations loaded:', this.organizations);
        console.log('Selected orgs array:', this.selectedOrgs);
        console.log('Selected orgs count:', this.selectedOrgs.length);
        
        const checkboxes = this.elements.orgsList.querySelectorAll('.org-checkbox');
        console.log('All checkboxes:', checkboxes.length);
        
        const checkedBoxes = this.elements.orgsList.querySelectorAll('.org-checkbox:checked');
        console.log('Checked checkboxes:', checkedBoxes.length);
        
        checkedBoxes.forEach((cb, index) => {
            console.log(`  Checkbox ${index}: value='${cb.value}', id='${cb.id}'`);
        });
        
        console.log('Validate button disabled:', this.elements.validateOrgsBtn.disabled);
        console.log('=== End Debug ===');
    }
    
    // ===== CONFIG MANAGEMENT =====
    loadValidatedConfig() {
        try {
            const saved = sessionStorage.getItem('cpq_validated_config');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Failed to load validated config:', error);
            return {};
        }
    }
    
    saveValidatedConfig() {
        try {
            sessionStorage.setItem('cpq_validated_config', JSON.stringify(this.config.validated));
            console.log('Validated config saved to sessionStorage');
        } catch (error) {
            console.error('Failed to save validated config:', error);
        }
    }
    
    updateVolatileConfig(objectName, updates) {
        if (!this.config.volatile[objectName]) {
            this.config.volatile[objectName] = {};
        }
        Object.assign(this.config.volatile[objectName], updates);
        console.log(`Updated volatile config for ${objectName}:`, this.config.volatile[objectName]);
    }
    
    commitVolatileToValidated(objectName) {
        if (this.config.volatile[objectName]) {
            if (!this.config.validated.objects) {
                this.config.validated.objects = {};
            }
            this.config.validated.objects[objectName] = { ...this.config.volatile[objectName] };
            delete this.config.volatile[objectName];
            this.saveValidatedConfig();
            console.log(`Committed ${objectName} from volatile to validated config`);
        }
    }

    async validateOrganizations() {
        console.log('validateOrganizations called');
        console.log('Selected orgs:', this.selectedOrgs);
        console.log('Selected orgs count:', this.selectedOrgs.length);
        
        if (this.selectedOrgs.length < 2) {
            console.error('Not enough orgs selected');
            return;
        }
        
        try {
            this.elements.validateOrgsBtn.disabled = true;
            this.elements.validateOrgsBtn.innerHTML = `
                <div class="slds-spinner slds-spinner_inline slds-spinner_xx-small slds-m-right_x-small" style="display: inline-block; vertical-align: middle;">
                    <div class="slds-spinner__dot-a"></div>
                    <div class="slds-spinner__dot-b"></div>
                </div>
                Validating...`;
            
            this.postMessageToShell({
                type: 'SHOW_LOADER',
                data: { text: 'Validating organization connections...', progress: 15 }
            });
            this.postMessageToShell({
                type: 'APP_STATE_CHANGED',
                data: { state: 'loading', message: 'Validating organizations' }
            });
            
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 40, text: 'Testing Salesforce connectivity...' }
            });
            
            const response = await fetch('/data-comparison/api/data-comparison/orgs/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selectedOrgs: this.selectedOrgs })
            });
            
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 70, text: 'Verifying organization access...' }
            });
            
            const data = await response.json();
            console.log('Validation response:', data);
            
            if (data.valid || data.success) {
                this.postMessageToShell({
                    type: 'UPDATE_LOADER',
                    data: { progress: 100, text: 'Organizations validated successfully!' }
                });
                
                // Store validated orgs and save config
                this.config.validated.orgs = this.selectedOrgs;
                this.config.validated.metadata.totalOrgs = this.selectedOrgs.length;
                this.saveValidatedConfig();
                
                this.markStepCompleted('orgs');
                
                // Load common objects for the selected orgs
                setTimeout(() => {
                    this.postMessageToShell({ type: 'HIDE_LOADER' });
                    this.postMessageToShell({
                        type: 'APP_STATE_CHANGED',
                        data: { state: 'idle', message: 'Ready for object selection' }
                    });
                    this.navigateToStep('objects');
                    // Start loading common objects
                    this.loadCommonObjects();
                }, 500);
            } else {
                throw new Error(data.error || 'Validation failed');
            }
        } catch (error) {
            console.error('Org validation failed:', error);
            
            this.postMessageToShell({ type: 'HIDE_LOADER' });
            this.postMessageToShell({
                type: 'APP_STATE_CHANGED',
                data: { state: 'error', message: 'Organization validation failed' }
            });
            
            alert(`Validation failed: ${error.message}`);
        } finally {
            this.elements.validateOrgsBtn.disabled = false;
            this.elements.validateOrgsBtn.innerHTML = `
                <svg class="slds-button__icon slds-button__icon_left" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#check"></use>
                </svg>
                Validate & Continue`;
        }
    }

    markStepCompleted(step) {
        const stepElement = this.elements[`step${step.charAt(0).toUpperCase() + step.slice(1)}`];
        if (stepElement) {
            stepElement.classList.remove('slds-is-active', 'slds-is-current', 'slds-is-incomplete');
            stepElement.classList.add('slds-is-complete');
        }
    }

    // ===== OBJECTS & FIELDS (V1-STYLE PANELS) =====

    async loadCommonObjects() {
        console.log('📚 loadCommonObjects called');
        console.log('📋 Validated orgs:', this.config.validated.orgs);
        
        if (!this.config.validated.orgs || this.config.validated.orgs.length === 0) {
            console.log('❌ No validated orgs - cannot load common objects');
            return;
        }
        
        // Prevent duplicate requests
        if (this.objectLoadingStates.isLoading) {
            console.log('⚠️ Already loading objects, skipping duplicate request');
            return;
        }
        
        // Set loading state and prevent premature error display
        this.objectLoadingStates.hasAttemptedLoad = true;
        this.objectLoadingStates.isLoading = true;
        this.objectLoadingStates.lastError = null;
        
        this.setPanelState('objects', 'loading');
        this.postMessageToShell({
            type: 'SHOW_LOADER',
            data: { text: 'Discovering common objects across organizations...', progress: 20 }
        });
        this.postMessageToShell({
            type: 'APP_STATE_CHANGED',
            data: { state: 'loading', message: 'Analyzing objects across orgs' }
        });
        
        try {
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 40, text: 'Querying Salesforce objects (this may take 30-60 seconds)...' }
            });
            
            // Add timeout for long-running queries
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
            
            const response = await fetch('/data-comparison/api/objects/common', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgs: this.config.validated.orgs }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 70, text: 'Processing object metadata...' }
            });
            
            const data = await response.json();
            
            if (data.commonObjects) {
                this.commonObjects = data.commonObjects;
                console.log('✅ Loaded common objects:', this.commonObjects.length);
                this.objectLoadingStates.isLoading = false;
                // Clear search term to ensure all objects are visible
                this.panels.objects.searchTerm = '';
                if (this.elements.p1Search) {
                    this.elements.p1Search.value = '';
                }
                this.setPanelState('objects', 'loaded');
                this.renderObjects();
                
                this.postMessageToShell({
                    type: 'UPDATE_LOADER',
                    data: { progress: 100, text: `Found ${data.commonObjects.length} common objects` }
                });
                
                setTimeout(() => {
                    this.postMessageToShell({ type: 'HIDE_LOADER' });
                    this.postMessageToShell({
                        type: 'APP_STATE_CHANGED',
                        data: { state: 'idle', message: `${data.commonObjects.length} objects available` }
                    });
                }, 500);
            } else {
                throw new Error(data.error || 'Failed to load objects');
            }
        } catch (error) {
            console.error('Failed to load objects:', error);
            this.objectLoadingStates.isLoading = false;
            this.objectLoadingStates.lastError = error.message;
            
            // Only show error state if we actually attempted and failed
            if (this.objectLoadingStates.hasAttemptedLoad) {
                this.setPanelState('objects', 'error');
            }
            
            this.postMessageToShell({ type: 'HIDE_LOADER' });
            this.postMessageToShell({
                type: 'APP_STATE_CHANGED',
                data: { state: 'error', message: 'Failed to load objects' }
            });
        }
    }

    setPanelState(panel, state) {
        this.panels[panel].state = state;
        
        // Get the panel element
        const panelNum = panel === 'objects' ? '1' : panel === 'fields' ? '2' : '3';
        const panelElement = this.elements[`panel${panelNum}`];
        
        if (panelElement) {
            // Find the panel-content div inside the panel
            const panelContent = panelElement.querySelector('.panel-content');
            if (panelContent) {
                panelContent.setAttribute('data-state', state);
                console.log(`Set panel ${panel} state to: ${state}`);
            } else {
                console.error(`Could not find .panel-content in panel${panelNum}`);
            }
        }
    }

    renderObjects() {
        console.log('🎨 renderObjects called');
        console.log('📋 p1ObjectsList element:', this.elements.p1ObjectsList);
        console.log('🔄 panels.objects.state:', this.panels.objects.state);
        console.log('📦 commonObjects:', this.commonObjects);
        
        if (!this.elements.p1ObjectsList) {
            console.log('❌ p1ObjectsList element not found!');
            return;
        }
        
        if (this.panels.objects.state !== 'loaded') {
            console.log('⚠️ Panel state is not loaded, current state:', this.panels.objects.state);
            return;
        }
        
        if (!this.commonObjects || this.commonObjects.length === 0) {
            console.log('❌ No common objects to render');
            this.elements.p1ObjectsList.innerHTML = '<p class="slds-text-body_small slds-text-color_weak slds-p-around_medium">No common objects found</p>';
            return;
        }
        
        let filteredObjects = this.filterObjects();
        let sortedObjects = this.sortObjects(filteredObjects);
        
        console.log('📊 Objects to render:', sortedObjects.length);
        console.log('🔍 First few objects:', sortedObjects.slice(0, 5));
        
        if (this.panels.objects.groupByPackage) {
            this.renderGroupedObjects(sortedObjects);
        } else {
            this.renderFlatObjects(sortedObjects);
        }
        
        this.updateObjectSelection();
        // Icons are now rendered inline with SLDS
        
        console.log('✅ renderObjects completed - objects rendered and icons created');
        console.log('📝 Final HTML length:', this.elements.p1ObjectsList.innerHTML.length);
    }

    filterObjects() {
        console.log('🔍 Filtering objects with search term:', this.panels.objects.searchTerm);
        if (!this.panels.objects.searchTerm) {
            console.log('📋 No search term, returning all objects:', this.commonObjects.length);
            return this.commonObjects;
        }
        
        const filtered = this.commonObjects.filter(obj => {
            return obj.name.toLowerCase().includes(this.panels.objects.searchTerm) ||
                   (obj.label && obj.label.toLowerCase().includes(this.panels.objects.searchTerm));
        });
        
        console.log('🔍 Filtered results:', filtered.length, 'objects');
        return filtered;
    }

    sortObjects(objects) {
        return objects.sort((a, b) => {
            let comparison = 0;
            
            if (this.panels.objects.sortMode === 'package') {
                const namespaceA = a.namespace || 'Standard';
                const namespaceB = b.namespace || 'Standard';
                comparison = namespaceA.localeCompare(namespaceB);
                if (comparison === 0) {
                    comparison = a.name.localeCompare(b.name);
                }
            } else {
                comparison = a.name.localeCompare(b.name);
            }
            
            return this.panels.objects.sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    renderGroupedObjects(objects) {
        const grouped = this.groupByNamespace(objects);
        let html = '';
        
        Object.entries(grouped).forEach(([namespace, objects]) => {
            html += `
                <div class="namespace-group">
                    <div class="namespace-header">${namespace || 'Standard'}</div>
                    ${objects.map(obj => this.createObjectHTML(obj)).join('')}
                </div>
            `;
        });
        
        this.elements.p1ObjectsList.innerHTML = html;
    }

    renderFlatObjects(objects) {
        console.log('📋 renderFlatObjects called with', objects.length, 'objects');
        const html = objects.map(obj => this.createObjectHTML(obj)).join('');
        console.log('📝 Generated HTML length:', html.length);
        this.elements.p1ObjectsList.innerHTML = html;
        console.log('✅ HTML set to p1ObjectsList');
    }

    groupByNamespace(objects) {
        return objects.reduce((groups, obj) => {
            const namespace = obj.namespace || 'Standard';
            if (!groups[namespace]) groups[namespace] = [];
            groups[namespace].push(obj);
            return groups;
        }, {});
    }

    createObjectHTML(obj) {
        const isConfigured = this.configuredObjects.has(obj.name);
        const isSelected = this.selectedObject === obj.name;
        const isVolatile = this.isObjectVolatile(obj.name);
        
        let cssClasses = ['object-item'];
        if (isSelected) cssClasses.push('selected');
        if (isConfigured) cssClasses.push('validated');
        else if (isVolatile) cssClasses.push('volatile');
        
        return `
            <div class="${cssClasses.join(' ')}" data-object="${obj.name}">
                <div class="object-name">${obj.name}</div>
                <div class="object-details">
                    <span>${obj.label || obj.name}</span>
                    ${obj.namespace ? `<span class="object-package">${obj.namespace}</span>` : ''}
                </div>
                ${this.getObjectStatusIndicator(obj.name)}
            </div>
        `;
    }

    getObjectStatusIndicator(objectName) {
        const isConfigured = this.configuredObjects.has(objectName);
        const isVolatile = this.isObjectVolatile(objectName);
        
        if (isConfigured) {
            return `<div class="object-status validated" title="Configured">
                <svg class="slds-icon slds-icon_xx-small slds-icon-text-success" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#success"></use>
                </svg>
            </div>`;
        } else if (isVolatile) {
            return `<div class="object-status volatile" title="Has Changes">
                <svg class="slds-icon slds-icon_xx-small slds-icon-text-warning" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#clock"></use>
                </svg>
            </div>`;
        }
        
        return '';
    }

    isObjectVolatile(objectName) {
        return this.config.volatile?.[objectName] && !this.configuredObjects.has(objectName);
    }

    updateObjectSelection() {
        this.elements.p1ObjectsList?.querySelectorAll('.object-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.object === this.selectedObject);
        });
    }

    async selectObject(objectName) {
        if (this.selectedObject === objectName) return;
        
        this.selectedObject = objectName;
        this.updateObjectSelection();
        this.elements.p2Title.textContent = `Fields: ${objectName}`;
        this.elements.p3CurrentObject.textContent = objectName;
        
        // ===== V1 PATTERN: Complete state clearing for new object =====
        // Clear all field selection state
        this.panels.fields.selectedFields.clear();
        this.panels.fields.selectedLookups.clear();
        this.panels.fields.selectedForeignKey = null;
        
        // Clear lookup modal state (Issue #1 fix)
        this.currentLookupField = null;
        this.panels.fields.lookupFKs.clear();  // Now safe to call since it's initialized
        
        // Reset object-specific arrays
        this.objectFields = [];
        this.objectLookupFields = [];
        this.objectForeignKeys = [];
        
        // Clear search state
        this.panels.fields.searchTerm = '';
        if (this.elements.p2Search) this.elements.p2Search.value = '';
        
        // Clear panel displays
        this.setPanelState('fields', 'empty');
        this.updateFieldStats();
        
        // Load fields for selected object
        await this.loadObjectFields(objectName);
    }

    // DUPLICATE FUNCTION REMOVED - Using complete version below at line 1324

    // DUPLICATE FUNCTION REMOVED - Using enhanced version below

    // DUPLICATE FUNCTION REMOVED - Using complete version below at line 1330

    // DUPLICATE FUNCTION REMOVED - Filtering logic integrated into complete renderFields() function

    // UNUSED FUNCTION REMOVED - HTML generation integrated into complete renderFields() function

    toggleFieldSelection(fieldName, selected) {
        if (selected) {
            this.panels.fields.selectedFields.add(fieldName);
        } else {
            this.panels.fields.selectedFields.delete(fieldName);
        }
        
        // Re-render to update visual state like object selection
        this.renderFields();
        
        this.updateFieldStats();
        this.updateVolatileConfig();
    }

    selectAllFields() {
        // Select all currently visible fields
        this.objectFields.forEach(field => {
            this.panels.fields.selectedFields.add(field.name);
        });
        
        // Re-render to update UI
        this.renderFields();
        
        this.updateFieldStats();
        this.updateVolatileConfig();
    }

    clearAllFields() {
        console.log('🧹 Clear All Fields clicked');
        console.log('📊 Fields before clear:', this.panels.fields.selectedFields.size);
        
        this.panels.fields.selectedFields.clear();
        
        const checkboxes = this.elements.p2FieldsList.querySelectorAll('.field-checkbox');
        console.log('☑️ Found checkboxes:', checkboxes.length);
        
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        
        console.log('📊 Fields after clear:', this.panels.fields.selectedFields.size);
        
        this.updateFieldStats();
        this.updateVolatileConfig();
        
        // Trigger search if there was a search term (this might be why Clear All triggers search)
        if (this.panels.fields.searchTerm) {
            console.log('🔍 Re-rendering fields after clear with search term:', this.panels.fields.searchTerm);
            this.renderFields();
        }
    }

    updateFieldStats() {
        const count = this.panels.fields.selectedFields.size;
        this.elements.selectedFieldsCount.textContent = count;
        this.elements.validateObjectBtn.disabled = count === 0;
        
        // Update foreign key status
        const currentConfig = this.config.volatile[this.selectedObject];
        if (currentConfig?.foreignKey) {
            this.elements.foreignKeyStatus.textContent = currentConfig.foreignKey;
            this.elements.foreignKeyInfo.innerHTML = `<span class="foreign-key-selected">Foreign Key: ${currentConfig.foreignKey}</span>`;
        } else {
            this.elements.foreignKeyStatus.textContent = 'No FK';
            this.elements.foreignKeyInfo.innerHTML = '<span class="no-foreign-key">No foreign key selected</span>';
        }
    }

    updateVolatileConfig() {
        if (!this.selectedObject) return;
        
        const fields = Array.from(this.panels.fields.selectedFields);
        const lookups = Array.from(this.panels.fields.selectedLookups);
        const foreignKey = this.panels.fields.selectedForeignKey;
        const currentConfig = this.config.volatile[this.selectedObject] || {};
        
        this.config.volatile[this.selectedObject] = {
            ...currentConfig,
            fields: fields,
            lookups: lookups,
            foreignKey: foreignKey
        };
    }

    setForeignKey(fieldName) {
        if (!this.selectedObject) return;
        
        const currentConfig = this.config.volatile[this.selectedObject] || {};
        this.config.volatile[this.selectedObject] = {
            ...currentConfig,
            foreignKey: fieldName
        };
        
        this.updateFieldStats();
    }

    validateCurrentObject() {
        if (!this.selectedObject || this.panels.fields.selectedFields.size === 0) return;
        
        const fields = Array.from(this.panels.fields.selectedFields);
        const lookups = Array.from(this.panels.fields.selectedLookups);
        const foreignKey = this.panels.fields.selectedForeignKey;
        const lookupFKs = this.panels.fields.lookupFKs || new Map();
        const currentConfig = this.config.volatile[this.selectedObject] || {};
        
        // Convert lookup+FK combinations to V1 dot notation format
        const expandedLookupFields = [];
        lookups.forEach(lookupField => {
            const fkField = lookupFKs.get(lookupField);
            if (fkField) {
                // V1 format: "LookupField.ForeignKeyField"
                expandedLookupFields.push(`${lookupField}.${fkField}`);
            } else {
                // If no FK selected, just include the lookup field itself
                expandedLookupFields.push(lookupField);
            }
        });
        
        // Combine regular fields with expanded lookup fields (V1 pattern)
        const allFields = [...fields, ...expandedLookupFields];
        
        // Create v2-style object configuration
        const objectConfig = {
            fields: allFields,  // Combined fields including expanded lookups
            foreignKey: foreignKey || null,
            orgFilters: {} // Initialize empty, will be configured in filters step
        };
        
        // Initialize orgFilters for each org with default values
        this.config.validated.orgs.forEach(org => {
            objectConfig.orgFilters[org] = {
                customFilter: '' // Will be set in filters step
            };
        });
        
        // Save to both configuredObjects map and validated config
        this.configuredObjects.set(this.selectedObject, objectConfig);
        
        // Update validated config
        if (!this.config.validated.objects) {
            this.config.validated.objects = {};
        }
        this.config.validated.objects[this.selectedObject] = objectConfig;
        
        // Update metadata
        this.config.validated.metadata.totalObjects = Object.keys(this.config.validated.objects).length;
        this.config.validated.metadata.totalFields = Object.values(this.config.validated.objects)
            .reduce((sum, obj) => sum + obj.fields.length, 0);
        
        // Save to sessionStorage
        this.saveValidatedConfig();
        
        // Remove from volatile
        delete this.config.volatile[this.selectedObject];
        
        // Log successful validation
        const lookupCount = expandedLookupFields.length;
        this.logToShell('info', `Validated ${this.selectedObject}: ${fields.length} fields, ${lookupCount} lookup fields, FK: ${foreignKey || 'None'}`);
        
        // Update UI
        this.renderConfiguredObjects();
        this.renderObjects(); // Update object status indicators
        this.updateProceedButton();
    }

    renderConfiguredObjects() {
        if (!this.elements.configuredObjectsList) return;
        
        if (this.configuredObjects.size === 0) {
            this.elements.configuredObjectsList.innerHTML = '<p class="no-objects">No objects configured yet</p>';
            return;
        }
        
        const html = Array.from(this.configuredObjects.entries()).map(([objectName, config]) => {
            const hasConditions = config.orgFilters && Object.values(config.orgFilters).some(f => f.customFilter);
            const conditionsIndicator = hasConditions ? `<svg class="slds-icon slds-icon_xx-small slds-icon-text-default conditions-icon" aria-hidden="true">
                <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#settings"></use>
            </svg>` : '';
            
            return `
                <div class="configured-object">
                    <div class="configured-object-header">
                        <div class="configured-object-name">
                            <svg class="slds-icon slds-icon_xx-small slds-icon-text-success configured-icon" aria-hidden="true">
                                <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#success"></use>
                            </svg>
                            ${objectName}
                        </div>
                        <div class="configured-object-indicators">
                            ${conditionsIndicator}
                        </div>
                    </div>
                    <div class="configured-object-details">
                        <div class="configured-object-count">${config.fields.length} fields selected</div>
                        <div class="configured-object-fk">FK: ${config.foreignKey || 'Not selected'}</div>
                        ${hasConditions ? `<div class="configured-object-conditions">Filters configured</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.configuredObjectsList.innerHTML = html;
        
        // Icons are now rendered inline with SLDS
    }

    updateProceedButton() {
        this.elements.proceedFiltersBtn.disabled = this.configuredObjects.size === 0;
    }

    // ===== FILTERS PAGE =====

    renderFiltersPage() {
        console.log('🔧 Rendering Configure Active Conditions page');
        
        // Use the correct element for the conditions page
        const targetElement = this.elements.conditionsObjectsList;
        if (!targetElement) {
            console.error('❌ No element found for conditions list');
            return;
        }
        
        console.log('📊 Configured objects to display:', this.configuredObjects.size);
        
        const html = Array.from(this.configuredObjects.entries()).map(([objectName, config]) => {
            const hasFilters = config.orgFilters && Object.values(config.orgFilters).some(f => 
                f.activeCondition || f.dateFilterType || f.customFilter
            );
            
            return `
                <article class="slds-card slds-m-bottom_medium">
                    <div class="slds-card__header slds-grid">
                        <header class="slds-media slds-media_center slds-has-flexi-truncate">
                            <div class="slds-media__figure">
                                <span class="slds-icon_container slds-icon-standard-custom">
                                    <svg class="slds-icon slds-icon_small" aria-hidden="true">
                                        <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#custom"></use>
                                    </svg>
                                </span>
                            </div>
                            <div class="slds-media__body">
                                <h2 class="slds-card__header-title">
                                    <span>${objectName}</span>
                                    ${hasFilters ? '<span class="slds-badge slds-badge_success slds-m-left_x-small">Filters Configured</span>' : ''}
                                </h2>
                            </div>
                        </header>
                        <div class="slds-no-flex">
                            <button class="slds-button slds-button_neutral configure-conditions-btn" data-object="${objectName}">
                                Configure Active Conditions
                            </button>
                        </div>
                    </div>
                    <div class="slds-card__body slds-card__body_inner">
                        <div class="slds-accordion">
                            ${this.config.validated.orgs.map((org, index) => {
                                const orgFilter = config.orgFilters?.[org] || {};
                                const hasOrgFilter = orgFilter.activeCondition || orgFilter.dateFilterType || orgFilter.customFilter;
                                const accordionId = `accordion-${objectName}-${org}`.replace(/[^a-zA-Z0-9-]/g, '-');
                                
                                return `
                                    <section class="slds-accordion__section ${index === 0 ? 'slds-is-open' : ''}">
                                        <div class="slds-accordion__summary">
                                            <h3 class="slds-accordion__summary-heading">
                                                <button aria-controls="${accordionId}" 
                                                        aria-expanded="${index === 0 ? 'true' : 'false'}" 
                                                        class="slds-button slds-accordion__summary-action">
                                                    <svg class="slds-accordion__summary-action-icon slds-button__icon slds-button__icon_left" aria-hidden="true">
                                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#switch"></use>
                                                    </svg>
                                                    <span class="slds-accordion__summary-content">
                                                        ${org}
                                                        ${hasOrgFilter ? '<span class="slds-badge slds-badge_lightest slds-m-left_x-small">Configured</span>' : ''}
                                                    </span>
                                                </button>
                                            </h3>
                                        </div>
                                        <div aria-hidden="${index === 0 ? 'false' : 'true'}" 
                                             class="slds-accordion__content" 
                                             id="${accordionId}">
                                            <div class="slds-box slds-box_x-small">
                                                ${hasOrgFilter ? `
                                                    <dl class="slds-list_horizontal slds-wrap">
                                                        ${orgFilter.activeCondition ? `
                                                            <dt class="slds-item_label slds-text-color_weak">Active Condition:</dt>
                                                            <dd class="slds-item_detail"><code>${orgFilter.activeCondition}</code></dd>
                                                        ` : ''}
                                                        ${orgFilter.dateFilterType ? `
                                                            <dt class="slds-item_label slds-text-color_weak">Date Filter:</dt>
                                                            <dd class="slds-item_detail">${orgFilter.dateFilterType}: ${orgFilter.dateFrom || 'Any'} to ${orgFilter.dateTo || 'Any'}</dd>
                                                        ` : ''}
                                                        ${orgFilter.customFilter ? `
                                                            <dt class="slds-item_label slds-text-color_weak">Custom Filter:</dt>
                                                            <dd class="slds-item_detail"><code>${orgFilter.customFilter}</code></dd>
                                                        ` : ''}
                                                    </dl>
                                                ` : '<p class="slds-text-body_small slds-text-color_weak">No filters configured for this organization</p>'}
                                            </div>
                                        </div>
                                    </section>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </article>
            `;
        }).join('');
        
        targetElement.innerHTML = html || '<p class="slds-text-body_regular slds-text-align_center slds-m-around_large">No objects configured yet. Please complete the Objects & Fields step first.</p>';
        
        // Add event listeners for configure buttons
        targetElement.querySelectorAll('.configure-conditions-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const objectName = e.target.dataset.object;
                console.log('🔧 Opening conditions modal for:', objectName);
                this.openConditionsModal(objectName);
            });
        });
        
        // Add accordion functionality
        targetElement.querySelectorAll('.slds-accordion__summary-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const section = btn.closest('.slds-accordion__section');
                const isOpen = section.classList.contains('slds-is-open');
                const content = section.querySelector('.slds-accordion__content');
                
                if (isOpen) {
                    section.classList.remove('slds-is-open');
                    btn.setAttribute('aria-expanded', 'false');
                    content.setAttribute('aria-hidden', 'true');
                } else {
                    // Close other sections in the same accordion
                    const accordion = section.closest('.slds-accordion');
                    accordion.querySelectorAll('.slds-accordion__section').forEach(s => {
                        s.classList.remove('slds-is-open');
                        s.querySelector('.slds-accordion__summary-action').setAttribute('aria-expanded', 'false');
                        s.querySelector('.slds-accordion__content').setAttribute('aria-hidden', 'true');
                    });
                    
                    // Open this section
                    section.classList.add('slds-is-open');
                    btn.setAttribute('aria-expanded', 'true');
                    content.setAttribute('aria-hidden', 'false');
                }
            });
        });
    }

    openFiltersModal(objectName) {
        this.currentFilterObject = objectName;
        this.elements.filterObjectName.textContent = objectName;
        
        // Render per-org filter configuration
        this.renderOrgFilters(objectName);
        
        // Show modal
        this.elements.filtersModal?.classList.remove('hidden');
    }

    renderOrgFilters(objectName) {
        if (!this.elements.orgFiltersContent) return;
        
        const config = this.configuredObjects.get(objectName);
        if (!config) return;
        
        const html = this.config.validated.orgs.map(org => `
            <div class="org-filter-card">
                <h4>${org}</h4>
                <div class="filter-controls">
                    <div class="filter-group">
                        <label>Active Condition:</label>
                        <select class="active-condition" data-org="${org}">
                            <option value="">All records</option>
                            <option value="IsDeleted = false">Active only</option>
                            <option value="IsDeleted = true">Deleted only</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Date Filter:</label>
                        <select class="date-filter-type" data-org="${org}">
                            <option value="">No date filter</option>
                            <option value="LastModifiedDate">Last Modified</option>
                            <option value="CreatedDate">Created Date</option>
                        </select>
                    </div>
                    <div class="filter-group date-range hidden">
                        <label>Date Range:</label>
                        <input type="date" class="date-from" data-org="${org}">
                        <input type="date" class="date-to" data-org="${org}">
                    </div>
                </div>
            </div>
        `).join('');
        
        this.elements.orgFiltersContent.innerHTML = html;
        
        // Add event listeners for date filter type changes
        this.elements.orgFiltersContent.addEventListener('change', (e) => {
            if (e.target.classList.contains('date-filter-type')) {
                const dateRange = e.target.closest('.org-filter-card').querySelector('.date-range');
                dateRange?.classList.toggle('hidden', !e.target.value);
            }
        });
    }

    saveObjectFilters() {
        if (!this.currentFilterObject) return;
        
        const config = this.configuredObjects.get(this.currentFilterObject);
        if (!config) return;
        
        // Collect filter data for each org
        this.config.validated.orgs.forEach(org => {
            const orgCard = this.elements.orgFiltersContent.querySelector(`[data-org="${org}"]`).closest('.org-filter-card');
            const activeCondition = orgCard.querySelector('.active-condition').value;
            const dateFilterType = orgCard.querySelector('.date-filter-type').value;
            const dateFrom = orgCard.querySelector('.date-from').value;
            const dateTo = orgCard.querySelector('.date-to').value;
            
            config.orgFilters[org] = {
                activeCondition,
                dateFilterType,
                dateFrom,
                dateTo
            };
        });
        
        this.closeModal('filtersModal');
        this.renderFiltersPage(); // Refresh the display
    }

    // ===== FINALIZE PAGE =====

    renderFinalizePage() {
        // Update summary stats
        document.getElementById('summary-orgs-count').textContent = this.config.validated.orgs.length;
        document.getElementById('summary-objects-count').textContent = this.configuredObjects.size;
        
        const totalFields = Array.from(this.configuredObjects.values())
            .reduce((sum, config) => sum + config.fields.length, 0);
        document.getElementById('summary-fields-count').textContent = totalFields;
        
        // Enable Start Comparison button if we have configured objects
        const startComparisonBtn = document.getElementById('start-comparison-btn');
        if (startComparisonBtn) {
            startComparisonBtn.disabled = this.configuredObjects.size === 0;
        }
        
        // Render object summaries
        const summaryHtml = Array.from(this.configuredObjects.entries()).map(([objectName, config]) => `
            <div class="summary-object">
                <h4>${objectName}</h4>
                <p>${config.fields.length} fields</p>
                ${config.foreignKey ? `<p>FK: ${config.foreignKey}</p>` : ''}
            </div>
        `).join('');
        
        document.getElementById('summary-objects-list').innerHTML = summaryHtml;
    }

    // ===== MODAL UTILITIES =====

    closeModal(modalName) {
        if (modalName === 'conditionsModal') {
            this.elements.conditionsModal?.classList.remove('slds-fade-in-open');
            const backdrop = document.getElementById('conditions-backdrop');
            backdrop?.classList.remove('slds-backdrop_open');
        } else if (modalName === 'fieldDetailsModal') {
            this.elements.fieldDetailsModal?.classList.remove('slds-fade-in-open');
            const backdrop = document.getElementById('field-details-backdrop');
            backdrop?.classList.remove('slds-backdrop_open');
        }
    }

    // ===== ENHANCED FIELD/LOOKUP HANDLING =====
    
    switchFieldsMode(mode) {
        console.log(`Switching to ${mode} mode`);
        this.panels.fields.mode = mode;
        
        // Clear search query when switching modes (FIXED)
        this.panels.fields.searchTerm = '';
        if (this.elements.p2Search) {
            this.elements.p2Search.value = '';
            this.elements.p2Search.placeholder = mode === 'fields' ? 'Search fields...' : 'Search lookups and foreign keys...';
        }
        
        // Update tab state using SLDS classes
        if (mode === 'fields') {
            this.elements.p2FieldsTab?.parentElement?.classList.add('slds-is-active');
            this.elements.p2LookupsTab?.parentElement?.classList.remove('slds-is-active');
        } else {
            this.elements.p2FieldsTab?.parentElement?.classList.remove('slds-is-active');
            this.elements.p2LookupsTab?.parentElement?.classList.add('slds-is-active');
        }
        
        // Update content visibility using SLDS classes
        if (mode === 'fields') {
            this.elements.fieldsContent?.classList.remove('slds-hide');
            this.elements.fieldsContent?.classList.add('slds-show');
            this.elements.lookupsContent?.classList.remove('slds-show');
            this.elements.lookupsContent?.classList.add('slds-hide');
        } else {
            this.elements.fieldsContent?.classList.remove('slds-show');
            this.elements.fieldsContent?.classList.add('slds-hide');
            this.elements.lookupsContent?.classList.remove('slds-hide');
            this.elements.lookupsContent?.classList.add('slds-show');
        }
        
        this.renderCurrentFieldMode();
    }
    
    renderCurrentFieldMode() {
        if (this.panels.fields.mode === 'fields') {
            this.renderFields();
        } else {
            this.renderLookups();
        }
    }
    
    async loadObjectFields(objectName) {
        if (!objectName) return;
        
        console.log(`🔍 loadObjectFields called for: ${objectName}`);
        console.log(`📋 Validated orgs:`, this.config.validated.orgs);
        
        // Check if we have validated orgs
        if (!this.config.validated.orgs || this.config.validated.orgs.length === 0) {
            console.error('❌ No validated orgs available - cannot load fields');
            this.setPanelState('fields', 'error');
            return;
        }
        
        // Set loading state for fields
        this.fieldLoadingStates.hasAttemptedLoad = true;
        this.fieldLoadingStates.isLoading = true;
        this.fieldLoadingStates.lastError = null;
        
        // Only show loading state, don't show error until actual failure
        this.setPanelState('fields', 'loading');
        
        this.postMessageToShell({
            type: 'SHOW_LOADER',
            data: { text: `Loading fields for ${objectName}...`, progress: 30 }
        });
        
        try {
            this.postMessageToShell({
                type: 'UPDATE_LOADER',
                data: { progress: 60, text: 'Analyzing field metadata...' }
            });
            
            const requestBody = { orgs: this.config.validated.orgs };
            console.log(`🌐 Making API request to /data-comparison/api/objects/${objectName}/fields`);
            console.log(`📦 Request body:`, requestBody);
            
            const response = await fetch(`/data-comparison/api/objects/${objectName}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            console.log(`📡 Response status:`, response.status);
            const data = await response.json();
            console.log(`📊 Response data:`, data);
            
            if (data.success && data.fields) {
                // Separate fields by type based on actual field metadata
                this.objectFields = data.fields.filter(f => f.type !== 'reference');
                this.objectLookupFields = data.fields.filter(f => f.type === 'reference');
                // All non-lookup fields can potentially be foreign keys
                this.objectForeignKeys = data.fields.filter(f => f.type !== 'reference');
                
                this.fieldLoadingStates.isLoading = false;
                this.setPanelState('fields', 'loaded');
                this.renderCurrentFieldMode();
                
                this.postMessageToShell({
                    type: 'UPDATE_LOADER',
                    data: { progress: 100, text: `Loaded ${data.fields.length} fields` }
                });
                
                setTimeout(() => {
                    this.postMessageToShell({ type: 'HIDE_LOADER' });
                }, 300);
            } else {
                throw new Error(data.error || 'Failed to load fields');
            }
        } catch (error) {
            console.error('Failed to load fields:', error);
            this.fieldLoadingStates.isLoading = false;
            this.fieldLoadingStates.lastError = error.message;
            
            // Only show error state if we actually attempted and failed
            if (this.fieldLoadingStates.hasAttemptedLoad) {
                this.setPanelState('fields', 'error');
            }
            
            this.postMessageToShell({ type: 'HIDE_LOADER' });
        }
    }
    
    renderFields() {
        if (!this.elements.p2FieldsList || !this.objectFields) return;
        
        const filteredFields = this.objectFields.filter(field => {
            if (!this.panels.fields.searchTerm) return true;
            return field.name.toLowerCase().includes(this.panels.fields.searchTerm) ||
                   field.label?.toLowerCase().includes(this.panels.fields.searchTerm);
        });
        
        const html = filteredFields.map(field => {
            const isSelected = this.panels.fields.selectedFields.has(field.name);
            const isForeignKey = this.panels.fields.selectedForeignKey === field.name;
            const isAutoSelected = isForeignKey; // FK fields are auto-selected
            
            return `
            <div class="field-item ${isSelected || isAutoSelected ? 'selected' : ''}" data-field="${field.name}">
                <input type="checkbox" class="field-checkbox" 
                       data-field="${field.name}" 
                       ${isSelected ? 'checked' : ''}
                       ${isAutoSelected ? 'disabled' : ''}>
                <div class="field-info">
                    <div class="field-name">${field.name}</div>
                    <div class="field-details">
                        <span class="field-type">${field.type}</span>
                        ${field.label ? `<span class="field-label">${field.label}</span>` : ''}
                        ${field.required ? '<span class="field-required">Required</span>' : ''}
                    </div>
                </div>
                <div class="field-actions">
                    <button class="field-action-btn fk ${isForeignKey ? 'active' : ''}" 
                            data-field="${field.name}" title="Select as Foreign Key">
                        <svg class="slds-icon slds-icon_xx-small slds-icon-text-default" aria-hidden="true">
                            <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#key"></use>
                        </svg>
                    </button>
                </div>
            </div>
            `;
        }).join('');
        
        this.elements.p2FieldsList.innerHTML = html;
        
        // Update field counts and create icons (event listeners are handled globally)
        this.updateFieldCounts();
        // Icons are now rendered inline with SLDS
    }
    
    renderLookups() {
        if (!this.elements.p2LookupsList) return;
        
        // Filter lookup fields based on search term
        const filteredLookups = this.objectLookupFields.filter(field => {
            if (!this.panels.fields.searchTerm) return true;
            return field.name.toLowerCase().includes(this.panels.fields.searchTerm) ||
                   field.label?.toLowerCase().includes(this.panels.fields.searchTerm);
        });
        
        // Render lookup fields with FK selection modal trigger
        const lookupsHtml = filteredLookups.map(field => {
            const isSelected = this.panels.fields.selectedLookups.has(field.name);
            const hasSelectedFK = this.isLookupFKSelected(field.name);
            
            return `
            <div class="field-item lookup-field ${isSelected ? 'selected' : ''}" data-field="${field.name}">
                <div class="field-info">
                    <div class="field-name">${field.name}</div>
                    <div class="field-details">
                        <span class="field-type">${field.type}</span>
                        ${field.label ? `<span class="field-label">${field.label}</span>` : ''}
                        ${field.referenceTo ? `<span class="field-reference">→ ${field.referenceTo.join(', ')}</span>` : ''}
                        ${field.required ? '<span class="field-required">Required</span>' : ''}
                    </div>
                    ${hasSelectedFK ? `<div class="fk-indicator">FK: ${this.getLookupFK(field.name)}</div>` : ''}
                </div>
                <div class="field-actions">
                    <button class="field-action-btn lookup ${hasSelectedFK ? 'active' : ''}" 
                            data-field="${field.name}" title="Configure Foreign Key for Lookup">
                        <svg class="slds-icon slds-icon_xx-small slds-icon-text-default" aria-hidden="true">
                            <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#new_window"></use>
                        </svg>
                    </button>
                </div>
            </div>
            `;
        }).join('');
        
        this.elements.p2LookupsList.innerHTML = lookupsHtml || '<p class="no-lookups">No reference/lookup fields found for this object</p>';
        
        // Update field counts and create icons (event listeners are handled globally)
        this.updateFieldCounts();
        // Icons are now rendered inline with SLDS
    }
    
    addFieldEventListeners() {
        if (this.eventListenersAdded.fields) return;
        this.eventListenersAdded.fields = true;
        
        // Use document-level event delegation to handle dynamically added content
        document.addEventListener('click', (e) => {
            // Check if we're in the fields list area
            if (!e.target.closest('#p2-fields-list')) return;
            
            const fkButton = e.target.closest('.field-action-btn.fk');
            if (fkButton) {
                e.preventDefault();
                e.stopPropagation();
                const fieldName = fkButton.dataset.field;
                console.log('FK button clicked:', fieldName);
                this.toggleFieldFK(fieldName);
            }
        });
        
        // Field selection - make entire field item clickable like objects
        document.addEventListener('click', (e) => {
            // Check if we're in the fields list area
            if (!e.target.closest('#p2-fields-list')) return;
            
            const fieldItem = e.target.closest('.field-item');
            if (fieldItem && !fieldItem.classList.contains('lookup-field')) {
                // Don't handle if clicking on action buttons
                if (e.target.closest('.field-action-btn')) return;
                
                const fieldName = fieldItem.dataset.field;
                const checkbox = fieldItem.querySelector('.field-checkbox');
                
                // Skip if checkbox is disabled (auto-selected FK)
                if (checkbox.disabled) return;
                
                // Toggle selection
                const isCurrentlySelected = this.panels.fields.selectedFields.has(fieldName);
                this.toggleFieldSelection(fieldName, !isCurrentlySelected);
                
                // Update checkbox to match
                checkbox.checked = !isCurrentlySelected;
                
                console.log('Field item clicked:', fieldName, !isCurrentlySelected);
            }
        });
        
        // Still handle checkbox changes for direct checkbox interaction
        document.addEventListener('change', (e) => {
            // Check if we're in the fields list area
            if (!e.target.closest('#p2-fields-list')) return;
            
            if (e.target.type === 'checkbox' && e.target.classList.contains('field-checkbox')) {
                const fieldName = e.target.dataset.field;
                console.log('Field checkbox changed:', fieldName, e.target.checked);
                this.toggleFieldSelection(fieldName, e.target.checked);
            }
        });
    }
    
    addLookupEventListeners() {
        if (this.eventListenersAdded.lookups) return;
        this.eventListenersAdded.lookups = true;
        
        console.log('🔗 Adding lookup event listeners');
        
        // Use document-level event delegation for lookup buttons
        document.addEventListener('click', (e) => {
            // Check if we're in the lookups list area
            if (!e.target.closest('#p2-lookups-list')) return;
            
            console.log('🖱️ Click detected in lookups list');
            const lookupButton = e.target.closest('.field-action-btn.lookup');
            if (lookupButton) {
                e.preventDefault();
                e.stopPropagation();
                const fieldName = lookupButton.dataset.field;
                console.log('🔍 Lookup button clicked for field:', fieldName);
                this.openLookupFKModal(fieldName);
            }
        });
    }
    
    toggleFieldFK(fieldName) {
        const currentFK = this.panels.fields.selectedForeignKey;
        
        if (currentFK === fieldName) {
            // Unselect current FK
            this.panels.fields.selectedForeignKey = null;
            // Remove from selected fields if it was auto-selected
            // Keep it if user manually selected it
        } else {
            // Select new FK
            this.panels.fields.selectedForeignKey = fieldName;
            // Auto-select the field for comparison
            this.panels.fields.selectedFields.add(fieldName);
        }
        
        this.renderFields(); // Re-render to update UI
        this.updateFieldCounts();
        this.updateVolatileConfig(); // Save FK selection to volatile config
    }
    
    async openLookupFKModal(lookupFieldName) {
        console.log(`Opening FK selection modal for lookup: ${lookupFieldName}`);
        
        // Store the current lookup context
        this.currentLookupField = lookupFieldName;
        
        // Find the lookup field to get its target object
        const lookupField = this.objectLookupFields.find(f => f.name === lookupFieldName);
        if (!lookupField || !lookupField.referenceTo || lookupField.referenceTo.length === 0) {
            console.error('Cannot find target object for lookup field:', lookupFieldName);
            alert('Unable to determine target object for this lookup field');
            return;
        }
        
        // Get the target object name (usually the first referenced object)
        const targetObjectName = lookupField.referenceTo[0];
        console.log(`Loading fields for target object: ${targetObjectName}`);
        
        // Show loading modal first
        this.showLookupFKModalLoading(lookupFieldName, targetObjectName);
        
        try {
            // Fetch fields from the target object
            const response = await fetch(`/data-comparison/api/objects/${targetObjectName}/fields`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgs: this.config.validated.orgs })
            });
            
            const data = await response.json();
            
            if (data.success && data.fields) {
                // Render modal with target object fields
                this.renderLookupFKModal(lookupFieldName, targetObjectName, data.fields);
            } else {
                throw new Error(data.error || 'Failed to load target object fields');
            }
        } catch (error) {
            console.error('Failed to load target object fields:', error);
            this.showLookupFKModalError(lookupFieldName, targetObjectName, error.message);
        }
    }
    
    renderLookupFKModal(lookupFieldName, targetObjectName, targetFields) {
        if (!this.elements.fieldDetailsTitle || !this.elements.fieldDetailsContent) return;
        
        this.elements.fieldDetailsTitle.textContent = `Select Foreign Key for ${lookupFieldName} → ${targetObjectName}`;
        
        // lookupFKs is already initialized in constructor
        const currentFK = this.panels.fields.lookupFKs.get(lookupFieldName);
        
        // Use target object fields as FK options (filter out reference fields)
        const fkOptions = targetFields.filter(f => f.type !== 'reference');
        
        const html = `
            <div class="lookup-fk-selection">
                <p class="instruction">Select a foreign key field to establish record linkage for this lookup:</p>
                <div class="fk-options">
                    <div class="fk-option ${!currentFK ? 'selected' : ''}" data-fk="">
                        <input type="radio" name="lookup-fk" value="" ${!currentFK ? 'checked' : ''}>
                        <div class="fk-info">
                            <div class="fk-name">No Foreign Key</div>
                            <div class="fk-description">Don't use this lookup for record linkage</div>
                        </div>
                    </div>
                    ${fkOptions.map(field => `
                        <div class="fk-option ${currentFK === field.name ? 'selected' : ''}" data-fk="${field.name}">
                            <input type="radio" name="lookup-fk" value="${field.name}" ${currentFK === field.name ? 'checked' : ''}>
                            <div class="fk-info">
                                <div class="fk-name">${field.name}</div>
                                <div class="fk-description">
                                    <span class="fk-type">${field.type}</span>
                                    ${field.label ? ` - ${field.label}` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="cancel-lookup-fk">Cancel</button>
                    <button class="btn btn-primary" id="save-lookup-fk">Save Selection</button>
                </div>
            </div>
        `;
        
        this.elements.fieldDetailsContent.innerHTML = html;
        
        // Add event listeners for radio button selection
        this.elements.fieldDetailsContent.addEventListener('change', (e) => {
            if (e.target.type === 'radio') {
                // Update visual selection
                this.elements.fieldDetailsContent.querySelectorAll('.fk-option').forEach(option => {
                    option.classList.toggle('selected', option.dataset.fk === e.target.value);
                });
            }
        });
        
        // Add event listeners for modal buttons
        const cancelBtn = this.elements.fieldDetailsContent.querySelector('#cancel-lookup-fk');
        const saveBtn = this.elements.fieldDetailsContent.querySelector('#save-lookup-fk');
        
        cancelBtn?.addEventListener('click', () => this.closeLookupFKModal());
        saveBtn?.addEventListener('click', () => this.saveLookupFK());
    }
    
    showLookupFKModalLoading(lookupFieldName, targetObjectName) {
        if (!this.elements.fieldDetailsTitle || !this.elements.fieldDetailsContent) return;
        
        this.elements.fieldDetailsTitle.textContent = `Loading fields for ${lookupFieldName} → ${targetObjectName}`;
        this.elements.fieldDetailsContent.innerHTML = `
            <div class="modal-loading">
                <div class="loader"></div>
                <p>Loading ${targetObjectName} fields...</p>
            </div>
        `;
        
        // Show the modal using SLDS classes
        this.elements.fieldDetailsModal?.classList.add('slds-fade-in-open');
        // Also need to show backdrop
        const backdrop = document.getElementById('field-details-backdrop');
        if (!backdrop) {
            // Create backdrop if it doesn't exist
            const newBackdrop = document.createElement('div');
            newBackdrop.className = 'slds-backdrop slds-backdrop_open';
            newBackdrop.id = 'field-details-backdrop';
            document.body.appendChild(newBackdrop);
        } else {
            backdrop.classList.add('slds-backdrop_open');
        }
    }
    
    showLookupFKModalError(lookupFieldName, targetObjectName, errorMessage) {
        if (!this.elements.fieldDetailsTitle || !this.elements.fieldDetailsContent) return;
        
        this.elements.fieldDetailsTitle.textContent = `Error loading ${targetObjectName} fields`;
        this.elements.fieldDetailsContent.innerHTML = `
            <div class="modal-error">
                <div class="error-icon">⚠️</div>
                <p>Failed to load fields for ${targetObjectName}</p>
                <p class="error-detail">${errorMessage}</p>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="retry-target-fields" data-lookup="${lookupFieldName}">Retry</button>
                    <button class="btn btn-primary" id="close-error-modal">Close</button>
                </div>
            </div>
        `;
        
        // Add event listeners
        const retryBtn = this.elements.fieldDetailsContent.querySelector('#retry-target-fields');
        const closeBtn = this.elements.fieldDetailsContent.querySelector('#close-error-modal');
        
        retryBtn?.addEventListener('click', () => {
            this.openLookupFKModal(lookupFieldName);
        });
        
        closeBtn?.addEventListener('click', () => {
            this.closeLookupFKModal();
        });
    }
    
    saveLookupFK() {
        const selectedRadio = this.elements.fieldDetailsContent?.querySelector('input[name="lookup-fk"]:checked');
        if (!selectedRadio || !this.currentLookupField) return;
        
        const selectedFK = selectedRadio.value;
        
        // lookupFKs is already initialized in constructor
        
        if (selectedFK) {
            // Set the FK for this lookup
            this.panels.fields.lookupFKs.set(this.currentLookupField, selectedFK);
            // Auto-select the lookup
            this.panels.fields.selectedLookups.add(this.currentLookupField);
        } else {
            // Remove FK for this lookup
            this.panels.fields.lookupFKs.delete(this.currentLookupField);
            // Don't auto-unselect lookup, let user decide
        }
        
        this.closeLookupFKModal();
        this.renderLookups(); // Re-render to update UI
        this.updateFieldCounts();
        this.updateVolatileConfig(); // Save lookup FK changes to volatile config
    }
    
    closeLookupFKModal() {
        console.log('Closing lookup FK modal');
        this.elements.fieldDetailsModal?.classList.remove('slds-fade-in-open');
        const backdrop = document.getElementById('field-details-backdrop');
        backdrop?.classList.remove('slds-backdrop_open');
        this.currentLookupField = null;
        
        // Clear any existing event listeners on the modal content
        if (this.elements.fieldDetailsContent) {
            this.elements.fieldDetailsContent.innerHTML = '';
        }
    }
    
    isLookupFKSelected(lookupFieldName) {
        this.panels.fields.lookupFKs = this.panels.fields.lookupFKs || new Map();
        return this.panels.fields.lookupFKs.has(lookupFieldName);
    }
    
    getLookupFK(lookupFieldName) {
        this.panels.fields.lookupFKs = this.panels.fields.lookupFKs || new Map();
        return this.panels.fields.lookupFKs.get(lookupFieldName);
    }
    
    // DUPLICATE FUNCTION REMOVED - Using enhanced version above
    
    toggleLookupSelection(fieldName, checked) {
        if (checked) {
            this.panels.fields.selectedLookups.add(fieldName);
        } else {
            this.panels.fields.selectedLookups.delete(fieldName);
        }
        this.updateFieldCounts();
        this.updateVolatileConfig(); // Save lookup selection changes
    }
    
    setForeignKey(fieldName) {
        this.panels.fields.selectedForeignKey = fieldName;
        console.log(`Foreign key set to: ${fieldName}`);
        this.updateFieldCounts();
        this.updateVolatileConfig(); // Save FK selection to volatile config
        this.renderLookups(); // Re-render to update selection
    }
    
    updateFieldCounts() {
        // Update field counts in panel 3
        if (this.elements.selectedFieldsCount) {
            this.elements.selectedFieldsCount.textContent = this.panels.fields.selectedFields.size;
        }
        
        if (this.elements.selectedLookupsCount) {
            this.elements.selectedLookupsCount.textContent = this.panels.fields.selectedLookups.size;
        }
        
        if (this.elements.foreignKeyStatus) {
            this.elements.foreignKeyStatus.textContent = this.panels.fields.selectedForeignKey || 'Not selected';
        }
        
        // Update foreign key status display
        const fkInfo = this.elements.foreignKeyInfo;
        if (fkInfo) {
            const noFkElement = fkInfo.querySelector('.no-foreign-key');
            const hasFkElement = fkInfo.querySelector('.has-foreign-key');
            const selectedFkName = fkInfo.querySelector('#selected-fk-name');
            
            if (this.panels.fields.selectedForeignKey) {
                noFkElement?.classList.add('hidden');
                hasFkElement?.classList.remove('hidden');
                if (selectedFkName) {
                    selectedFkName.textContent = this.panels.fields.selectedForeignKey;
                }
            } else {
                noFkElement?.classList.remove('hidden');
                hasFkElement?.classList.add('hidden');
            }
        }
        
        // Enable/disable validate button
        const hasRequiredSelections = this.panels.fields.selectedFields.size > 0 && this.panels.fields.selectedForeignKey;
        if (this.elements.validateObjectBtn) {
            this.elements.validateObjectBtn.disabled = !hasRequiredSelections;
        }
    }
    
    // DUPLICATE FUNCTION REMOVED - Using async version above
    
    openConditionsModal(objectName) {
        console.log(`Opening conditions modal for: ${objectName}`);
        
        if (this.elements.conditionObjectName) {
            this.elements.conditionObjectName.textContent = objectName;
        }
        
        // Render per-org condition forms
        this.renderOrgConditionsForms(objectName);
        
        // Show the modal using SLDS classes
        this.elements.conditionsModal?.classList.add('slds-fade-in-open');
        
        // Also need to show backdrop
        let backdrop = document.getElementById('conditions-backdrop');
        if (!backdrop) {
            // Create backdrop if it doesn't exist
            backdrop = document.createElement('div');
            backdrop.className = 'slds-backdrop slds-backdrop_open';
            backdrop.id = 'conditions-backdrop';
            document.body.appendChild(backdrop);
        } else {
            backdrop.classList.add('slds-backdrop_open');
        }
    }
    
    renderOrgConditionsForms(objectName) {
        if (!this.elements.orgConditionsContent) return;
        
        const config = this.configuredObjects.get(objectName) || {};
        
        const formsHtml = this.config.validated.orgs.map(orgAlias => {
            const orgFilter = config.orgFilters?.[orgAlias] || {};
            
            return `
                <div class="slds-card org-condition-card" data-org="${orgAlias}">
                    <div class="slds-card__header slds-grid">
                        <header class="slds-media slds-media_center slds-has-flexi-truncate">
                            <div class="slds-media__body">
                                <h2 class="slds-card__header-title">
                                    <span class="slds-text-heading_small">${orgAlias}</span>
                                </h2>
                            </div>
                        </header>
                    </div>
                    <div class="slds-card__body slds-card__body_inner">
                        <div class="slds-form-element">
                            <label class="slds-form-element__label" for="custom-filter-${orgAlias}">
                                Filter Condition (SOQL WHERE clause)
                            </label>
                            <div class="slds-form-element__control">
                                <textarea 
                                    id="custom-filter-${orgAlias}" 
                                    class="slds-textarea" 
                                    placeholder="e.g., SBQQ__Active__c = TRUE AND RecordType.Name = 'Standard'"
                                    rows="3">${orgFilter.customFilter || ''}</textarea>
                            </div>
                            <div class="slds-form-element__help">
                                Enter a SOQL WHERE clause to filter records for this organization. Leave empty to include all records.
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        this.elements.orgConditionsContent.innerHTML = formsHtml;
    }
    
    populateConditionFieldOptions(objectName) {
        // Get the configured object to access its fields
        const configuredObject = this.configuredObjects.get(objectName);
        if (!configuredObject) return;
        
        // Get all available fields from the field selection
        const availableFields = this.objectFields || [];
        
        // Filter boolean fields for Active Condition dropdown
        const booleanFields = availableFields.filter(field => 
            field.type === 'boolean' || 
            field.type === 'checkbox' ||
            field.name.toLowerCase().includes('deleted') ||
            field.name.toLowerCase().includes('active') ||
            field.name.toLowerCase().includes('enabled')
        );
        
        // Filter date fields for Date Field dropdown
        const dateFields = availableFields.filter(field => 
            field.type === 'date' || 
            field.type === 'datetime' ||
            field.name.toLowerCase().includes('date') ||
            field.name.toLowerCase().includes('time')
        );
        
        // Populate Active Condition dropdowns for each org
        this.config.validated.orgs.forEach(orgAlias => {
            const activeSelect = document.getElementById(`active-${orgAlias}`);
            if (activeSelect) {
                // Keep "No active condition" as default
                activeSelect.innerHTML = '<option value="">No active condition</option>';
                
                // Add boolean fields
                booleanFields.forEach(field => {
                    const option = document.createElement('option');
                    option.value = `${field.name} = true`;
                    option.textContent = `${field.label || field.name} (Active)`;
                    activeSelect.appendChild(option);
                    
                    // Add false option too
                    const optionFalse = document.createElement('option');
                    optionFalse.value = `${field.name} = false`;
                    optionFalse.textContent = `${field.label || field.name} (Inactive)`;
                    activeSelect.appendChild(optionFalse);
                });
                
                // Add common patterns
                if (availableFields.find(f => f.name === 'IsDeleted')) {
                    const option = document.createElement('option');
                    option.value = 'IsDeleted = false';
                    option.textContent = 'Active Records Only';
                    activeSelect.appendChild(option);
                }
            }
            
            // Populate Date Field dropdowns
            const dateSelect = document.getElementById(`date-field-${orgAlias}`);
            if (dateSelect) {
                dateSelect.innerHTML = '<option value="">No date filter</option>';
                
                dateFields.forEach(field => {
                    const option = document.createElement('option');
                    option.value = field.name;
                    option.textContent = field.label || field.name;
                    dateSelect.appendChild(option);
                });
            }
        });
    }
    
    loadExistingConditions(objectName) {
        // Load existing conditions if object was previously configured
        const configuredObject = this.configuredObjects.get(objectName);
        if (!configuredObject || !configuredObject.orgFilters) return;
        
        // Set form values from existing configuration
        this.config.validated.orgs.forEach(orgAlias => {
            const orgFilter = configuredObject.orgFilters[orgAlias];
            if (!orgFilter) return;
            
            // Set Custom Filter textarea
            const customFilterInput = document.getElementById(`custom-filter-${orgAlias}`);
            if (customFilterInput && orgFilter.customFilter) {
                customFilterInput.value = orgFilter.customFilter;
            }
        });
    }
    
    saveObjectConditions() {
        // Save the conditions from the modal
        const objectName = this.elements.conditionObjectName?.textContent;
        if (!objectName) return;
        
        const config = this.configuredObjects.get(objectName) || {};
        config.orgFilters = config.orgFilters || {};
        
        // Collect conditions from form - v2 style with just customFilter
        this.config.validated.orgs.forEach(orgAlias => {
            // Get the custom filter value
            const customFilterInput = document.getElementById(`custom-filter-${orgAlias}`);
            if (customFilterInput) {
                config.orgFilters[orgAlias] = {
                    customFilter: customFilterInput.value.trim()
                };
            }
        });
        
        // Update both configuredObjects and validated config
        this.configuredObjects.set(objectName, config);
        
        // Update validated config
        if (this.config.validated.objects && this.config.validated.objects[objectName]) {
            this.config.validated.objects[objectName].orgFilters = config.orgFilters;
        }
        
        // Save to sessionStorage
        this.saveValidatedConfig();
        
        this.closeModal('conditionsModal');
        this.renderFiltersPage(); // Refresh the display
        
        // Show success indicator
        this.showConfigurationSavedIndicator(objectName);
    }
    
    showConfigurationSavedIndicator(objectName) {
        // Show a brief success message
        const indicator = document.createElement('div');
        indicator.className = 'config-saved-indicator';
        indicator.innerHTML = `
            <div class="success-message">
                <svg class="slds-icon slds-icon_xx-small slds-icon-text-success" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#success"></use>
                </svg>
                <span>Configuration saved for ${objectName}</span>
            </div>
        `;
        
        // Add to page and auto-remove after 3 seconds
        document.body.appendChild(indicator);
        // Icons are now rendered inline with SLDS
        
        setTimeout(() => {
            indicator.remove();
        }, 3000);
    }
    
    // ===== FINALIZE PAGE ACTIONS =====
    
    async downloadConfiguration() {
        try {
            this.showShellLoader('Generating configuration...', 20);
            this.updateShellState('loading', 'Preparing configuration download...');
            this.logToShell('info', 'Starting configuration download');
            
            // Generate configuration object
            this.updateShellLoader(50, 'Building configuration data...');
            const configData = this.generateFinalConfiguration();
            
            // Create filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `cpq-config-${timestamp}.json`;
            
            this.updateShellLoader(80, 'Creating download file...');
            
            // Create downloadable blob
            const blob = new Blob([JSON.stringify(configData, null, 2)], {
                type: 'application/json'
            });
            
            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            
            // Trigger download
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateShellLoader(100, 'Download complete!');
            
            // Show success message
            this.showConfigurationSavedIndicator('Configuration');
            
            setTimeout(() => {
                this.hideShellLoader();
                this.updateShellState('success', 'Configuration downloaded successfully');
            }, 1000);
            
            this.logToShell('info', `Configuration downloaded: ${filename} (${configData.metadata.totalObjects} objects, ${configData.metadata.totalFields} fields)`);
            
            // Log successful download
            console.log('Configuration downloaded:', filename);
            
        } catch (error) {
            this.hideShellLoader();
            this.updateShellState('error', 'Download failed');
            this.logToShell('error', `Configuration download failed: ${error.message}`);
            
            console.error('Download configuration failed:', error);
            alert('Failed to download configuration. Please try again.');
        }
    }
    
    async startComparison() {
        try {
            // Generate and save configuration first
            const configData = this.generateFinalConfiguration();
            
            // Send to server for processing
            const response = await fetch('/data-comparison/api/data-comparison/config/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Redirect to home page for upload (Issue #5 fix)
                if (window.parent && window.parent !== window) {
                    // In iframe - tell shell to navigate to home
                    window.parent.postMessage({
                        type: 'NAVIGATE_TO_HOME',
                        data: { configFile: result.configFilename }
                    }, '*');
                } else {
                    // Direct navigation
                    window.location.href = '/data-comparison/';
                }
            } else {
                throw new Error(result.error || 'Failed to start comparison');
            }
            
        } catch (error) {
            console.error('Start comparison failed:', error);
            alert('Failed to start comparison. Please try again.');
        }
    }
    
    generateFinalConfiguration() {
        // Generate complete configuration object for download/comparison
        const configData = {
            version: '2.0.0',
            createdAt: new Date().toISOString(),
            orgs: this.config.validated.orgs,
            objects: {},
            metadata: {
                totalOrgs: this.config.validated.orgs.length,
                totalObjects: this.configuredObjects.size,
                totalFields: Array.from(this.configuredObjects.values())
                    .reduce((sum, config) => sum + config.fields.length, 0),
                configGenerator: 'enhanced',
                uiVersion: 'v1-ux-v2-styling'
            }
        };
        
        // Add configured objects in v2 format
        this.configuredObjects.forEach((config, objectName) => {
            configData.objects[objectName] = {
                fields: config.fields,  // Already includes expanded lookup fields in dot notation
                foreignKey: config.foreignKey,
                orgFilters: config.orgFilters || {}
            };
        });
        
        return configData;
    }

    closeModal(modalName) {
        if (modalName === 'conditionsModal') {
            this.elements.conditionsModal?.classList.remove('slds-fade-in-open');
            const backdrop = document.getElementById('conditions-backdrop');
            backdrop?.classList.remove('slds-backdrop_open');
        } else if (modalName === 'fieldDetailsModal') {
            this.elements.fieldDetailsModal?.classList.remove('slds-fade-in-open');
            const backdrop = document.getElementById('field-details-backdrop');
            backdrop?.classList.remove('slds-backdrop_open');
        }
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Initialize the config generator
        window.configGenerator = new ImprovedConfigGenerator();
    });
} else {
    // DOM is already loaded, initialize immediately
    window.configGenerator = new ImprovedConfigGenerator();
}