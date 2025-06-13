// /apps/data-comparison/js/object-selection-controller.js
class ObjectSelectionController {
    constructor() {
        this.config = {
            validated: {},  // Config from file
            volatile: {}    // In-memory config
        };
        
        this.state = {
            selectedOrgs: [],
            selectedObject: null,
            isLoading: false,
            currentConfigFile: null
        };
        
        this.validator = new MockValidator();
        this.initializeEventListeners();
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('ObjectSelectionController: Initializing...');
        this.showGlobalSpinner(true);
        
        try {
            // Load session config info
            const sessionConfig = JSON.parse(localStorage.getItem('currentConfig') || '{}');
            this.state.selectedOrgs = sessionConfig.selectedOrgs || [];
            this.state.currentConfigFile = sessionConfig.filename || null;
            
            if (!this.state.selectedOrgs || this.state.selectedOrgs.length < 2) {
                throw new Error('Invalid session - please restart from org selection ' + sessionConfig );
            }

            // Trigger onLoadEvent to setup all panels
            this.fireEvent('onLoadEvent', {
                orgs: this.state.selectedOrgs,
                configFile: this.state.currentConfigFile
            });
            
        } catch (error) {
            console.error('ObjectSelectionController: Initialization failed:', error);
            this.showError('Initialization failed: ' + error.message);
        } finally {
            this.showGlobalSpinner(false);
        }
    }

    /**
     * Initialize all event listeners
     */
    initializeEventListeners() {
        // Panel 1 Events
        document.addEventListener('p1DataRequestEvent', this.handleP1DataRequest.bind(this));
        document.addEventListener('p2ObjectForward', this.handleP2ObjectForward.bind(this));
        document.addEventListener('reloadP1Setting', this.handleReloadP1Setting.bind(this));

        // Panel 2 Events  
        document.addEventListener('p2PanelEvent', this.handleP2PanelEvent.bind(this));
        document.addEventListener('p2DataRequestEvent', this.handleP2DataRequest.bind(this));
        document.addEventListener('reloadP2Setting', this.handleReloadP2Setting.bind(this));

        // Panel 3 Events
        document.addEventListener('p3DataRequestEvent', this.handleP3DataRequest.bind(this));
        document.addEventListener('validateAndSave', this.handleValidateAndSave.bind(this));
        document.addEventListener('reloadP3Setting', this.handleReloadP3Setting.bind(this));

        // Global Events
        document.addEventListener('onLoadEvent', this.handleOnLoadEvent.bind(this));
        
        // Initialize Lucide icons
        lucide.createIcons();
    }

    /**
     * Load validated config from file
     */
    /**
 * Load validated config from latest file
 */
    async loadValidatedConfig() {
        if (!this.state.selectedOrgs || this.state.selectedOrgs.length === 0) {
            console.log('No selected orgs to load config for');
            return {};
        }

        try {
            // Get org IDs for latest config lookup
            const orgIds = this.state.selectedOrgs.map(org => org.orgId).sort().join(',');
            
            // Get latest config
            const response = await fetch(`/api/data-comparison/config/latest?orgIds=${encodeURIComponent(orgIds)}`);
            const data = await response.json();
            
            if (data.success && data.latestConfig) {
                // Update current config file reference
                this.state.currentConfigFile = data.latestConfig.filename;
                
                // Return objects from config
                return data.latestConfig.content.objects || {};
            }
        } catch (error) {
            console.error('Failed to load validated config:', error);
        }
        
        return {};
    }

    /**
     * Save config to file
     */
    async saveConfigToFile(config) {
        try {
            const response = await fetch('/api/data-comparison/config/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.state.currentConfigFile,
                    objects: config
                })
            });

            if (response.ok) {
                this.config.validated = { ...config };
                console.log('Config saved to file successfully');
                return true;
            } else {
                throw new Error('Failed to save config to file');
            }
        } catch (error) {
            console.error('Error saving config to file:', error);
            return false;
        }
    }

    /**
     * Event Handlers
     */
    async handleOnLoadEvent(event) {
    console.log('ObjectSelectionController: onLoadEvent triggered');
    
    try {
        // 1. Load validated config from file (should pick up saved objects)
        this.config.validated = await this.loadValidatedConfig();
        console.log('Validated config loaded from file:', this.config.validated);
        
        // 2. Load volatile from localStorage, fallback to validated copy
        const storedVolatile = this.loadFromLocalStorage();
        this.config.volatile = Object.keys(storedVolatile).length > 0 ? 
            storedVolatile : JSON.parse(JSON.stringify(this.config.validated));
        
        console.log('Current config state:', {
            validated: Object.keys(this.config.validated),
            volatile: Object.keys(this.config.volatile)
        });
        
        // 3. Trigger panel reloads
        this.fireEvent('reloadP1Setting');
        this.fireEvent('reloadP2Setting'); 
        this.fireEvent('reloadP3Setting');
        
        console.log('ObjectSelectionController: onLoadEvent completed');
    } catch (error) {
        console.error('OnLoadEvent failed:', error);
        this.showError('Failed to load configuration');
    }
}

    handleP1DataRequest(event) {
        console.log('ObjectSelectionController: p1DataRequestEvent');
        const { searchTerm, sortMode, groupByPackage } = event.detail || {};
        
        // Return both validated and volatile config data
        this.fireEvent('p1MainEvent', {
            validated: this.config.validated,
            volatile: this.config.volatile,
            searchTerm,
            sortMode,
            groupByPackage
        });
    }
    
    handleP2ObjectForward(event) {
        console.log('ObjectSelectionController: p2ObjectForward');
        const { objectName } = event.detail || {};
        
        if (!objectName) return;
        
        this.state.selectedObject = objectName;
        
        // Get object config from both validated and volatile
        const validatedObject = this.config.validated[objectName] || {};
        const volatileObject = this.config.volatile[objectName] || {};
        
        this.fireEvent('p2PanelEvent', {
            objectName,
            validated: validatedObject,
            volatile: volatileObject,
            fields: [], // Will be loaded by Panel 2
            lookupFields: []
        });
    }

    async handleP2DataRequest(event) {
        console.log('ObjectSelectionController: p2DataRequestEvent');
        const { objectName, blank } = event.detail || {};
        
        if (blank || !objectName) {
            this.fireEvent('p2MainEvent', { blank: true });
            return;
        }

        try {
            // Load fields from server
            const response = await fetch(`/api/data-comparison/ajax/fields/${objectName}?config=${encodeURIComponent(JSON.stringify({ selectedOrgs: this.state.selectedOrgs }))}`);
            const data = await response.json();
            
            if (data.success) {
                const validatedObject = this.config.validated[objectName] || {};
                const volatileObject = this.config.volatile[objectName] || {};
                
                this.fireEvent('p2MainEvent', {
                    objectName,
                    fields: data.fields.filter(f => !f.isLookup),
                    lookupFields: data.lookupFields || data.fields.filter(f => f.isLookup),
                    validated: validatedObject,
                    volatile: volatileObject
                });
            }
        } catch (error) {
            console.error('Failed to load fields:', error);
            this.showError('Failed to load fields for ' + objectName);
        }
    }

    handleP2PanelEvent(event) {
        console.log('ObjectSelectionController: p2PanelEvent');
        // Panel 2 forwards this to Panel 2 Main
        this.fireEvent('p2DataRequestEvent', event.detail);
    }

    handleP3DataRequest(event) {
        console.log('ObjectSelectionController: p3DataRequestEvent');
        const { mode } = event.detail || {};
        
        const currentObject = this.state.selectedObject;
        if (!currentObject) {
            this.fireEvent('p3MainEvent', { mode, empty: true });
            return;
        }
        
        const validatedObject = this.config.validated[currentObject] || {};
        const volatileObject = this.config.volatile[currentObject] || {};
        
        this.fireEvent('p3MainEvent', {
            mode,
            objectName: currentObject,
            validated: validatedObject,
            volatile: volatileObject
        });
    }

    async handleValidateAndSave(event) {
        console.log('ObjectSelectionController: validateAndSave');
        
        const currentObject = this.state.selectedObject;
        if (!currentObject) {
            this.showError('Please select an object to validate');
            return;
        }
        
        try {
            this.showGlobalSpinner(true, 'Validating configuration...');
            
            // Get current object's volatile config
            const objectConfig = this.config.volatile[currentObject];
            if (!objectConfig) {
                throw new Error('No configuration found for selected object');
            }
            
            console.log('Object to validate:', currentObject);
            console.log('Object config:', objectConfig);
            console.log('Current config file:', this.state.currentConfigFile);
            
            // Validate current object config (placeholder for real validation)
            const validation = await this.validator.validateConfig({ [currentObject]: objectConfig });
            
            if (validation.isValid) {
                console.log('Validation passed, saving to file...');
                
                // Save this specific object to file
                const saved = await this.saveObjectToConfigFile(currentObject, objectConfig);
                
                if (saved) {
                    console.log('Object saved successfully, updating memory...');
                    
                    // Update validated config in memory
                    this.config.validated[currentObject] = JSON.parse(JSON.stringify(objectConfig));
                    
                    // Keep volatile same as validated since it's now saved
                    this.config.volatile[currentObject] = JSON.parse(JSON.stringify(objectConfig));
                    this.saveToLocalStorage();
                    
                    console.log('Memory updated, refreshing UI...');
                    
                    // Refresh UI to show validated state
                    this.fireEvent('onLoadEvent');
                    this.showSuccess(`Configuration for ${currentObject} validated and saved successfully!`);
                } else {
                    this.showError('Failed to save configuration to file');
                }
            } else {
                console.log('Validation failed:', validation);
                // Show validation errors
                this.showValidationErrors(validation);
            }
        } catch (error) {
            console.error('Validate and save failed:', error);
            this.showError('Validation failed: ' + error.message);
        } finally {
            this.showGlobalSpinner(false);
        }
    }


    handleReloadP1Setting(event) {
        console.log('ObjectSelectionController: reloadP1Setting');
        this.fireEvent('refreshP1Main');
    }

    handleReloadP2Setting(event) {
        console.log('ObjectSelectionController: reloadP2Setting');
        this.fireEvent('p2DataRequestEvent', { blank: true });
    }

    handleReloadP3Setting(event) {
        console.log('ObjectSelectionController: reloadP3Setting');
        this.fireEvent('p3MainClean');
    }

    /**
     * Update volatile config
     */
    updateVolatileConfig(objectName, updates) {
    if (!this.config.volatile[objectName]) {
        this.config.volatile[objectName] = {
            Fields: [],
            Active: [],
            foreignKey: null,
            ActiveCondition: "",
            LastModifiedBetween: [null, null],
            CreatedBetween: [null, null]
        };
    }
    
    Object.assign(this.config.volatile[objectName], updates);
    this.saveToLocalStorage(); // Add this line
    console.log(`Volatile config updated for ${objectName}:`, this.config.volatile[objectName]);
}

    saveToLocalStorage() {
        try {
            localStorage.setItem('sf-compare-volatile-config', JSON.stringify(this.config.volatile));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('sf-compare-volatile-config');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            return {};
        }
    }

    /**
     * Utility Methods
     */
    fireEvent(eventName, detail = {}) {
        console.log(`ObjectSelectionController: Firing ${eventName}`, detail);
        document.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    showGlobalSpinner(show, message = 'Loading...') {
        const spinner = document.getElementById('global-spinner');
        const text = spinner?.querySelector('p');
        
        if (spinner) {
            spinner.classList.toggle('hidden', !show);
            if (text) text.textContent = message;
        }
    }

    showError(message) {
        console.error('ObjectSelectionController:', message);
        // Create a simple error toast
        this.showToast(message, 'error');
    }

    showSuccess(message) {
        console.log('ObjectSelectionController:', message);
        this.showToast(message, 'success');
    }

    showValidationErrors(validation) {
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = this.validator.generateValidationReport(this.config.volatile);
        errorDiv.className = 'validation-overlay';
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 10000);
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'error' ? 'x-circle' : 'check-circle'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(toast);
        lucide.createIcons({ parent: toast });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    /**
     * Expose methods for panel use
     */
    getConfig() {
        return {
            validated: this.config.validated,
            volatile: this.config.volatile
        };
    }

    updateConfig(objectName, updates) {
        this.updateVolatileConfig(objectName, updates);
    }

    getCurrentObject() {
        return this.state.selectedObject;
    }

    /**
     * Save specific object config to config file
     */
    async saveObjectToConfigFile(objectName, objectConfig) {
        try {
            // Load current config file
            const response = await fetch(`/apps/data-comparison/config/${this.state.currentConfigFile}`);
            if (!response.ok) {
                throw new Error('Failed to load current config file');
            }
            
            const currentConfig = await response.json();
            
            // Initialize objects as object (not array) if not exists
            if (!currentConfig.objects || Array.isArray(currentConfig.objects)) {
                currentConfig.objects = {};
            }
            
            // Update the specific object in objects
            currentConfig.objects[objectName] = {
                ...objectConfig,
                validatedAt: new Date().toISOString(),
                objectName: objectName
            };
            
            console.log('Updating config with object:', objectName, currentConfig.objects[objectName]);
            
            // Save back to file - send entire objects structure
            const saveResponse = await fetch('/api/data-comparison/config/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filename: this.state.currentConfigFile,
                    objects: currentConfig.objects  // Send entire objects structure
                })
            });

            const saveResult = await saveResponse.json();
            
            if (saveResult.success) {
                console.log(`Object ${objectName} saved to config file successfully`);
                console.log('Updated objects structure:', currentConfig.objects);
                return true;
            } else {
                throw new Error(saveResult.message || 'Failed to save to file');
            }
        } catch (error) {
            console.error('Error saving object to config file:', error);
            return false;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.objectController = new ObjectSelectionController();
    window.objectController.init();
});