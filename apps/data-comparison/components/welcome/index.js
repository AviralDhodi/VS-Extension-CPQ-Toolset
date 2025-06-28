/**
 * Data Comparison App - Welcome Component
 * Main entry point for the data comparison tool
 * FIXED: Proper theme communication with shell
 */

class DataComparisonWelcome {
    constructor() {
        this.appName = 'Data Comparison';
        this.appVersion = '1.0.0';
        this.currentState = 'idle';
        this.isInExtensionShell = window.parent !== window;
        this.logger = null;
        this.themeReceived = false;

        this.elements = {
            uploadOption: document.getElementById('upload-option'),
            createOption: document.getElementById('create-option'),
            uploadBtn: document.querySelector('.upload-btn'),
            createBtn: document.querySelector('.create-btn'),
            appState: document.getElementById('app-state'),
            connectionStatus: document.querySelector('.connection-status')
        };

        this.init();
    }

    init() {
        console.log(`🎯 ${this.appName} initializing...`);
        console.log(`📡 In extension shell: ${this.isInExtensionShell}`);
        
        this.setupLogger();
        this.initializeLucideIcons();
        this.setupExtensionCommunication();
        this.bindEvents();
        this.notifyExtensionLoaded();
        this.setInitialState();
        
        this.logger.info('Data Comparison Welcome component initialized');
    }

    setupLogger() {
        // Browser-compatible logger that communicates with Extension Shell
        this.logger = {
            log: (level, message, data = null) => {
                const timestamp = new Date().toISOString();
                const formatted = `[${timestamp}] [${level.toUpperCase()}] [${this.appName}] [welcome/index.js] ${message}`;
                
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
                        location: 'welcome/index.js',
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
            this.updateConnectionStatus(false);
            return;
        }

        this.updateConnectionStatus(true);
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
        // Set app to idle state and hide any loaders
        this.setAppState('idle', 'Ready');
        this.hideLoader();
        this.updateAppStateDisplay('Ready');
        this.logger.debug('Initial state set to idle');
    }

    setAppState(state, message = '') {
        this.currentState = state;
        this.postMessageToExtension({
            type: 'APP_STATE_CHANGED',
            data: { state, message: message || this.capitalizeFirst(state) }
        });
        this.logger.debug('App state changed', { state, message });
    }

    updateAppStateDisplay(stateText) {
        if (this.elements.appState) {
            this.elements.appState.textContent = stateText;
        }
    }

    updateConnectionStatus(connected) {
        const statusElement = this.elements.connectionStatus;
        if (!statusElement) return;

        const iconElement = statusElement.querySelector('.connection-icon');
        const textElement = statusElement.querySelector('.connection-text');

        if (connected) {
            iconElement.setAttribute('data-lucide', 'wifi');
            textElement.textContent = 'Extension Connected';
            statusElement.style.color = 'var(--success)';
        } else {
            iconElement.setAttribute('data-lucide', 'wifi-off');
            textElement.textContent = 'Standalone Mode';
            statusElement.style.color = 'var(--warning)';
        }

        this.initializeLucideIcons();
    }

    hideLoader() {
        this.postMessageToExtension({
            type: 'HIDE_LOADER'
        });
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

    async handleUploadConfiguration() {
        this.logger.info('Upload Configuration clicked');
        
        // Trigger file input
        const fileInput = document.getElementById('config-file-input');
        if (!fileInput) {
            this.logger.error('File input not found');
            return;
        }
        
        fileInput.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) {
                this.logger.info('No file selected');
                return;
            }
            
            this.logger.info('File selected for upload', { 
                name: file.name, 
                size: file.size, 
                type: file.type 
            });
            
            this.setAppState('loading', 'Uploading configuration');
            this.showLoader('Uploading file...', 10);
            
            try {
                // Create form data
                const formData = new FormData();
                formData.append('configFile', file);
                
                this.updateLoader(30, 'Validating file format...');
                
                // Upload to server
                const response = await fetch('/data-comparison/api/config/upload', {
                    method: 'POST',
                    body: formData
                });
                
                this.updateLoader(70, 'Processing configuration...');
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    this.updateLoader(100, 'Upload successful!');
                    
                    this.logger.info('Configuration uploaded successfully', {
                        filename: result.filename,
                        orgs: result.summary.orgs
                    });
                    
                    this.setAppState('success', 'Configuration uploaded');
                    this.hideLoader();
                    
                    // Show success message with option to proceed
                    this.showUploadSuccess(result);
                    
                } else {
                    throw new Error(result.error || 'Upload failed');
                }
                
            } catch (error) {
                this.logger.error('Upload failed', { error: error.message });
                this.hideLoader();
                this.setAppState('error', 'Upload failed');
                this.showUploadError(error.message);
            }
        };
        
        // Trigger file picker
        fileInput.click();
    }

    showUploadSuccess(result) {
        this.logger.info('Showing upload success message', result);
        
        // Create a simple success notification 
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: var(--success-bg, #dcfce7); 
                        color: var(--success-text, #166534); padding: 1rem; border-radius: 8px; 
                        border: 1px solid var(--success-border, #bbf7d0); z-index: 1000; max-width: 400px;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <i data-lucide="check-circle" style="width: 16px; height: 16px;"></i>
                    <strong>Configuration Uploaded Successfully!</strong>
                </div>
                <div style="font-size: 0.875rem; margin-bottom: 1rem;">
                    File: ${result.filename}<br>
                    Organizations: ${result.summary.orgs}<br>
                    Ready to proceed with comparison setup.
                </div>
                <button onclick="this.parentElement.parentElement.remove(); window.location.href='/data-comparison/object-selection';" 
                        style="background: var(--success-text, #166534); color: white; border: none; 
                               padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-right: 0.5rem;">
                    Continue Setup
                </button>
                <button onclick="this.parentElement.parentElement.remove();" 
                        style="background: transparent; color: var(--success-text, #166534); border: 1px solid; 
                               padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">
                    Close
                </button>
            </div>
        `;
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }

    showUploadError(errorMessage) {
        this.logger.error('Showing upload error message', { error: errorMessage });
        
        // Create a simple error notification
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: var(--error-bg, #fef2f2); 
                        color: var(--error-text, #dc2626); padding: 1rem; border-radius: 8px; 
                        border: 1px solid var(--error-border, #fecaca); z-index: 1000; max-width: 400px;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <i data-lucide="x-circle" style="width: 16px; height: 16px;"></i>
                    <strong>Upload Failed</strong>
                </div>
                <div style="font-size: 0.875rem; margin-bottom: 1rem;">
                    ${errorMessage}
                </div>
                <button onclick="this.parentElement.parentElement.remove();" 
                        style="background: var(--error-text, #dc2626); color: white; border: none; 
                               padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">
                    Close
                </button>
            </div>
        `;
        document.body.appendChild(notification);
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 8000);
    }

    showTemporaryFeedback(type, message) {
        const button = type === 'upload' ? this.elements.uploadBtn : this.elements.createBtn;
        const originalText = button.innerHTML;
        
        button.innerHTML = `
            <i data-lucide="info" class="button-icon"></i>
            ${message}
        `;
        button.style.opacity = '0.8';
        
        this.initializeLucideIcons();
        
        setTimeout(() => {
            button.innerHTML = originalText;
            button.style.opacity = '1';
            this.initializeLucideIcons();
            this.setAppState('idle', 'Ready');
        }, 3000);
    }

    bindEvents() {
        // Upload Configuration button
        this.elements.uploadBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleUploadConfiguration();
        });

        // Create Configuration button
        this.elements.createBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleCreateConfiguration();
        });

        // Option card hover effects
        this.elements.uploadOption?.addEventListener('mouseenter', () => {
            this.logger.trace('Upload option hovered');
        });

        this.elements.createOption?.addEventListener('mouseenter', () => {
            this.logger.trace('Create option hovered');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'u':
                        e.preventDefault();
                        this.handleUploadConfiguration();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.handleCreateConfiguration();
                        break;
                }
            }
        });

        this.logger.debug('Event listeners bound');
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Public API for external components
    getAppInfo() {
        return {
            name: this.appName,
            version: this.appVersion,
            state: this.currentState,
            isConnected: this.isInExtensionShell,
            themeReceived: this.themeReceived
        };
    }

    handleCreateConfiguration() {
        this.logger.info('Create Configuration clicked - navigating to Config Generator');
        this.setAppState('loading', 'Navigating to config generator');
        this.showLoader('Loading config generator...', 10);
        
        // Navigate to config generator
        if (this.isInExtensionShell && window.parent) {
            window.parent.location.href = '/data-comparison/config-generator';
        } else {
            window.location.href = '/data-comparison/config-generator';
        }
        
        this.logger.info('Navigating to config generator');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏁 DOM loaded, initializing Data Comparison Welcome...');
    window.dataComparisonWelcome = new DataComparisonWelcome();
});

// Global API
window.DataComparisonWelcome = {
    getAppInfo: () => window.dataComparisonWelcome?.getAppInfo(),
    setTheme: (theme, variables) => window.dataComparisonWelcome?.updateTheme(theme, variables)
};