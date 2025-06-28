// apps/data-comparison/components/appView/index.js
class DataComparisonAppView {
    constructor() {
        this.currentComponent = null;
        this.isInExtensionShell = window.parent !== window;
        this.themeReceived = false;
        this.componentCache = new Map();
        
        this.elements = {
            loader: document.getElementById('app-loader'),
            progressFill: document.getElementById('loader-progress-fill'),
            componentContainer: document.getElementById('component-container'),
            errorContainer: document.getElementById('error-container'),
            errorMessage: document.getElementById('error-message'),
            retryButton: document.getElementById('retry-button')
        };

        this.init();
    }

    async init() {
        console.log(' Data Comparison AppView initializing...');
        
        this.setupShellCommunication();
        this.bindEvents();
        this.initializeLucideIcons();
        
        // Request theme from shell
        this.requestThemeData();
        
        // Load initial component based on URL or state
        await this.loadInitialComponent();
        
        this.notifyShellLoaded();
        console.log(' AppView initialized');
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    setupShellCommunication() {
        if (!this.isInExtensionShell) {
            console.warn(' Not in extension shell - standalone mode');
            return;
        }

        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;

            const { type, theme, variables } = event.data;

            switch (type) {
                case 'THEME_DATA':
                case 'THEME_CHANGED':
                    this.applyTheme(theme, variables);
                    this.themeReceived = true;
                    break;
                    
                default:
                    console.log(' Unknown message from shell:', type);
            }
        });
    }

    requestThemeData() {
        if (this.isInExtensionShell) {
            window.parent.postMessage({ type: 'REQUEST_THEME' }, '*');
            console.log(' Requested theme from shell');
        }
        
        // Fallback if no theme received
        setTimeout(() => {
            if (!this.themeReceived) {
                console.warn(' No theme received, using default');
                this.applyTheme('light', {});
            }
        }, 1000);
    }

    applyTheme(theme, variables) {
        console.log(` Applying theme: ${theme}`, variables);
        
        document.body.setAttribute('data-theme', theme);
        
        if (variables) {
            const root = document.documentElement;
            Object.entries(variables).forEach(([key, value]) => {
                if (value && value.trim()) {
                    root.style.setProperty(`--app-${key}`, value.trim());
                }
            });
        }
        
        // Force repaint
        document.body.style.display = 'none';
        document.body.offsetHeight;
        document.body.style.display = '';
        
        this.sendLogToShell('info', `Theme ${theme} applied`);
    }

    async loadInitialComponent() {
        // Check URL params for component
        const urlParams = new URLSearchParams(window.location.search);
        const component = urlParams.get('component') || 'welcome';
        
        // Check window.INITIAL_COMPONENT (injected by routes)
        const initialComponent = window.INITIAL_COMPONENT || component;
        
        // Check window.APP_STATE for state data
        const appState = window.APP_STATE || {};
        
        console.log(` Loading initial component: ${initialComponent}`, appState);
        
        await this.loadComponent(initialComponent, appState);
    }

    async loadComponent(componentName, stateData = {}) {
        try {
            this.showLoader(`Loading ${componentName}...`);
            this.hideError();
            
            // Update progress
            this.updateLoaderProgress(25, 'Fetching component...');
            
            // Check cache first
            let componentHtml;
            if (this.componentCache.has(componentName)) {
                componentHtml = this.componentCache.get(componentName);
                this.updateLoaderProgress(50, 'Loading from cache...');
            } else {
                // Fetch component HTML
                const response = await fetch(`/data-comparison/components/${componentName}/index.html`);
                if (!response.ok) {
                    throw new Error(`Component ${componentName} not found (${response.status})`);
                }
                
                componentHtml = await response.text();
                this.componentCache.set(componentName, componentHtml);
                this.updateLoaderProgress(50, 'Component fetched...');
            }
            
            // Load into container
            this.elements.componentContainer.innerHTML = componentHtml;
            this.updateLoaderProgress(75, 'Rendering component...');
            
            // Load component assets (CSS/JS)
            await this.loadComponentAssets(componentName);
            this.updateLoaderProgress(100, 'Component ready!');
            
            // Reinitialize icons for new content
            this.initializeLucideIcons();
            
            // Show component with animation
            setTimeout(() => {
                this.elements.componentContainer.classList.add('loaded');
                this.hideLoader();
                this.currentComponent = componentName;
                
                // Initialize component if it has an init function
                this.initializeComponent(componentName, stateData);
                
                this.sendLogToShell('info', `Component ${componentName} loaded successfully`);
            }, 300);
            
        } catch (error) {
            console.error(' Component load failed:', error);
            this.showError(error.message);
            this.sendLogToShell('error', `Failed to load component ${componentName}: ${error.message}`);
        }
    }

    async loadComponentAssets(componentName) {
        const promises = [];
        
        // Load CSS
        const cssPromise = this.loadCSS(`/data-comparison/components/${componentName}/index.css`);
        promises.push(cssPromise);
        
        // Load JS
        const jsPromise = this.loadJS(`/data-comparison/components/${componentName}/index.js`);
        promises.push(jsPromise);
        
        await Promise.allSettled(promises);
    }

    loadCSS(href) {
        return new Promise((resolve, reject) => {
            const existingLink = document.querySelector(`link[href="${href}"]`);
            if (existingLink) {
                resolve();
                return;
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = () => {
                console.warn(` CSS not found: ${href}`);
                resolve(); // Don't fail for missing CSS
            };
            document.head.appendChild(link);
        });
    }

    loadJS(src) {
        return new Promise((resolve, reject) => {
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => {
                console.warn(` JS not found: ${src}`);
                resolve(); // Don't fail for missing JS
            };
            document.head.appendChild(script);
        });
    }

    initializeComponent(componentName, stateData) {
        // Try to initialize component-specific functionality
        const initFunctionName = `init${componentName.charAt(0).toUpperCase() + componentName.slice(1)}`;
        
        if (typeof window[initFunctionName] === 'function') {
            try {
                window[initFunctionName](stateData, this);
                console.log(` Component ${componentName} initialized`);
            } catch (error) {
                console.warn(` Component init failed:`, error);
            }
        }
        
        // Generic component setup
        this.setupComponentEventDelegation();
    }

    setupComponentEventDelegation() {
        // Add event delegation for common component interactions
        this.elements.componentContainer.addEventListener('click', (e) => {
            // Handle navigation requests
            if (e.target.dataset.navigate) {
                const component = e.target.dataset.navigate;
                const data = e.target.dataset.navigationData ? 
                    JSON.parse(e.target.dataset.navigationData) : {};
                this.loadComponent(component, data);
            }
            
            // Handle state changes
            if (e.target.dataset.stateChange) {
                const stateChange = JSON.parse(e.target.dataset.stateChange);
                this.notifyStateChange(stateChange.component, stateChange.data);
            }
        });
    }

    showLoader(text = 'Loading...') {
        this.elements.loader.classList.remove('hidden');
        this.elements.componentContainer.classList.remove('loaded');
        this.updateLoaderProgress(0, text);
    }

    hideLoader() {
        this.elements.loader.classList.add('hidden');
    }

    updateLoaderProgress(progress, text) {
        this.elements.progressFill.style.width = `${progress}%`;
        
        const progressText = this.elements.loader.querySelector('.progress-text');
        const loaderText = this.elements.loader.querySelector('.loader-text');
        
        if (progressText) progressText.textContent = `${progress}%`;
        if (loaderText && text) loaderText.textContent = text;
    }

    showError(message) {
        this.elements.errorContainer.classList.remove('hidden');
        this.elements.errorMessage.textContent = message;
        this.hideLoader();
        this.initializeLucideIcons();
    }

    hideError() {
        this.elements.errorContainer.classList.add('hidden');
    }

    bindEvents() {
        // Retry button
        this.elements.retryButton?.addEventListener('click', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const component = urlParams.get('component') || 'welcome';
            this.loadComponent(component);
        });
    }

    // Communication with shell
    sendLogToShell(level, message) {
        if (this.isInExtensionShell) {
            window.parent.postMessage({
                type: 'ADD_LOG',
                data: {
                    app: 'Data Comparison',
                    level: level,
                    message: message,
                    location: 'appView',
                    timestamp: new Date().toISOString()
                }
            }, '*');
        }
    }

    notifyShellLoaded() {
        if (this.isInExtensionShell) {
            window.parent.postMessage({
                type: 'APP_LOADED',
                data: {
                    appName: 'Data Comparison',
                    version: '2.0.0'
                }
            }, '*');
        }
    }

    notifyStateChange(component, data) {
        // Update app state via API
        fetch('/data-comparison/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ component, data })
        }).then(response => response.json())
          .then(result => {
              if (result.success) {
                  this.sendLogToShell('info', `State changed to ${component}`);
              }
          })
          .catch(err => {
              this.sendLogToShell('error', `State change failed: ${err.message}`);
          });
    }

    // Public API for components
    navigateToComponent(componentName, data = {}) {
        this.loadComponent(componentName, data);
    }

    updateShellState(state, message) {
        if (this.isInExtensionShell) {
            window.parent.postMessage({
                type: 'APP_STATE_CHANGED',
                data: { state, message }
            }, '*');
        }
    }

    showShellLoader(text, progress = 0) {
        if (this.isInExtensionShell) {
            window.parent.postMessage({
                type: 'SHOW_LOADER',
                data: { text, progress }
            }, '*');
        }
    }

    hideShellLoader() {
        if (this.isInExtensionShell) {
            window.parent.postMessage({
                type: 'HIDE_LOADER'
            }, '*');
        }
    }
}

// Initialize AppView
document.addEventListener('DOMContentLoaded', () => {
    console.log(' DOM loaded, initializing AppView...');
    window.dataComparisonAppView = new DataComparisonAppView();
});

// Global API for components
window.AppView = {
    navigate: (component, data) => window.dataComparisonAppView?.navigateToComponent(component, data),
    updateState: (state, message) => window.dataComparisonAppView?.updateShellState(state, message),
    showLoader: (text, progress) => window.dataComparisonAppView?.showShellLoader(text, progress),
    hideLoader: () => window.dataComparisonAppView?.hideShellLoader(),
    log: (level, message) => window.dataComparisonAppView?.sendLogToShell(level, message)
};