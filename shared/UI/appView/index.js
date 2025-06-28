// shared/UI/appView/index.js - Extension Shell with State-Driven Dynamic UI
class ExtensionShell {
    constructor() {
        this.currentTheme = 'light';
        this.currentApp = 'Loading...';
        this.currentState = 'loading';
        this.logEntries = [];
        this.isLogPanelOpen = false;
        
        this.elements = {
            body: document.body,
            themeToggle: document.getElementById('theme-toggle'),
            themeIcon: document.querySelector('.theme-icon'),
            activeAppName: document.getElementById('active-app-name'),
            appState: document.getElementById('app-state'),
            appStateText: document.getElementById('app-state-text'),
            stateIcon: document.querySelector('.state-icon'),
            appFrame: document.getElementById('app-frame'),
            logToggle: document.getElementById('log-toggle'),
            logPanel: document.getElementById('log-panel'),
            logEntries: document.getElementById('log-entries'),
            clearLogs: document.getElementById('clear-logs'),
            loaderSection: document.getElementById('loader-section'),
            loaderText: document.getElementById('loader-text'),
            loaderProgress: document.getElementById('loader-progress')
        };

        this.init();
    }

    init() {
        console.log('🚀 Extension Shell initializing...');
        this.loadTheme();
        this.bindEvents();
        this.setupIFrameCommunication();
        this.initializeLucideIcons();
        this.addInitialLog();
        this.setInitialState();
        //this.autoDetectAndCoordinate();
    }

    // Auto-detect app from URL and coordinate
    autoDetectAndCoordinate() {
        const path = window.location.pathname;
        console.log(`🔍 Auto-detecting app from path: ${path}`);
        
        if (path.startsWith('/data-comparison')) {
            this.coordinateAppViewGeneration('data-comparison', 'welcome');
        } else if (path.startsWith('/upcoming-app')) {
            this.coordinateAppViewGeneration('upcoming-app', 'welcome');
        } else {
            // Default to loading welcome page
            this.setAppState('idle', 'Ready');
            this.setActiveApp('Welcome');
        }
    }

    async coordinateAppViewGeneration(app, state) {
        console.log(`🎯 Coordinating appView generation for ${app}:${state}`);
        
        this.showLoader(`Generating ${app} ${state} interface...`, 0);
        this.setAppState('loading', `Loading ${state}...`);
        this.setActiveApp(`${app} - ${state}`);
        
        try {
            this.updateLoader(25, 'Requesting dynamic UI...');
            
            // Request app state API first to sync state
            const stateResponse = await fetch(`/${app}/api/state`);
            const stateData = await stateResponse.json();
            
            this.updateLoader(50, 'Generating component...');
            
            // Set iframe to load the dynamic UI endpoint
            const dynamicUrl = `/${app}/${state}-ui`;
            console.log(`📋 Setting iframe src to: ${dynamicUrl}`);
            
            this.elements.appFrame.src = dynamicUrl;
            
            this.updateLoader(75, 'Loading into iframe...');
            
            // Wait for iframe to load
            this.elements.appFrame.onload = () => {
                this.updateLoader(100, 'Complete!');
                
                setTimeout(() => {
                    this.hideLoader();
                    this.setAppState('idle', 'Ready');
                    this.addLog('Shell', 'info', `Dynamic appView loaded for ${app}:${state}`);
                    
                    // Send theme to newly loaded iframe
                    setTimeout(() => this.sendThemeToApp(this.currentTheme, this.getThemeVariables()), 500);
                }, 800);
            };
            
            this.elements.appFrame.onerror = () => {
                throw new Error('Failed to load iframe content');
            };
            
        } catch (error) {
            console.error('❌ AppView coordination failed:', error);
            this.hideLoader();
            this.setAppState('error', 'Failed to load');
            this.addLog('Shell', 'error', `AppView generation failed: ${error.message}`);
            
            // Show error in iframe
            const errorHtml = this.generateErrorHTML(app, state, error.message);
            const blob = new Blob([errorHtml], { type: 'text/html' });
            this.elements.appFrame.src = URL.createObjectURL(blob);
        }
    }

    generateErrorHTML(app, state, errorMessage) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error Loading ${app}</title>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        padding: 2rem; 
                        text-align: center; 
                        background: var(--app-bg-primary, #f8fafc);
                        color: var(--app-text-primary, #1e293b);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                    }
                    .error-icon { 
                        color: #ef4444; 
                        font-size: 3rem; 
                        margin-bottom: 1rem; 
                    }
                    .error-title { 
                        font-size: 1.5rem; 
                        margin-bottom: 0.5rem; 
                        color: #1e293b;
                    }
                    .error-message { 
                        color: #ef4444; 
                        margin: 1rem 0; 
                        max-width: 500px;
                    }
                    .retry-btn { 
                        padding: 0.75rem 1.5rem; 
                        background: #3b82f6; 
                        color: white; 
                        border: none; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-size: 1rem;
                        margin-top: 1rem;
                        transition: background 0.2s;
                    }
                    .retry-btn:hover {
                        background: #2563eb;
                    }
                </style>
            </head>
            <body>
                <div class="error-icon">⚠️</div>
                <h2 class="error-title">Failed to Load ${app.charAt(0).toUpperCase() + app.slice(1)} - ${state}</h2>
                <div class="error-message">${errorMessage}</div>
                <button class="retry-btn" onclick="window.parent.location.reload()">🔄 Retry</button>
            </body>
            </html>
        `;
    }

    // Theme Management
    setTheme(theme) {
        console.log(`🎨 Setting theme to: ${theme}`);
        this.currentTheme = theme;
        this.elements.body.setAttribute('data-theme', theme);
        localStorage.setItem('ext-theme', theme);
        
        const iconName = theme === 'dark' ? 'moon' : 'sun';
        this.elements.themeIcon.setAttribute('data-lucide', iconName);
        this.initializeLucideIcons();
        
        // Send theme to iframe
        const variables = this.getThemeVariables();
        this.sendThemeToApp(theme, variables);

        this.addLog('Extension', 'info', `Theme switched to ${theme} mode`);
    }

    getThemeVariables() {
        const computedStyle = getComputedStyle(document.documentElement);
        const variables = {};
        
        const variableNames = [
            'bg-primary', 'bg-secondary', 'bg-tertiary',
            'text-primary', 'text-secondary', 'text-tertiary', 
            'border', 'border-hover', 'accent', 'accent-hover',
            'success', 'warning', 'error', 'transition',
            'border-radius', 'shadow', 'shadow-lg'
        ];
        
        variableNames.forEach(name => {
            const value = computedStyle.getPropertyValue(`--app-${name}`);
            if (value && value.trim()) {
                variables[name] = value.trim();
            }
        });
        
        return variables;
    }

    sendThemeToApp(theme, variables) {
        const message = {
            type: 'THEME_DATA',
            theme: theme,
            variables: variables
        };
        
        if (this.elements.appFrame.contentWindow) {
            try {
                this.elements.appFrame.contentWindow.postMessage(message, '*');
                console.log(`📤 Sent theme to app:`, theme);
            } catch (error) {
                console.warn('Failed to send theme to app:', error);
            }
        }
    }

    // iframe Communication
    setupIFrameCommunication() {
        window.addEventListener('message', (event) => {
            // Accept messages from iframe (blob URLs) and same origin
            if (event.origin !== window.location.origin && !event.origin.startsWith('blob:')) {
                return;
            }

            const { type, data } = event.data;
            console.log(`📨 Received message: ${type}`, data);

            switch (type) {
                case 'APP_LOADED':
                    this.setActiveApp(data.appName || 'Unknown App');
                    this.setAppState('idle', 'Ready');
                    this.addLog(data.appName || 'App', 'info', 'App loaded successfully');
                    break;
                    
                case 'APP_STATE_CHANGED':
                    this.setAppState(data.state, data.message);
                    break;
                    
                case 'SHOW_LOADER':
                    this.showLoader(data.text, data.progress);
                    break;
                    
                case 'UPDATE_LOADER':
                    this.updateLoader(data.progress, data.text);
                    break;
                    
                case 'HIDE_LOADER':
                    this.hideLoader();
                    break;
                    
                case 'ADD_LOG':
                    this.addLog(data.app, data.level, data.message);
                    break;
                    
                case 'REQUEST_THEME':
                    this.sendThemeToApp(this.currentTheme, this.getThemeVariables());
                    break;
                    
                case 'REQUEST_APPVIEW_GENERATION':
                    const { app, state } = data;
                    this.coordinateAppViewGeneration(app, state);
                    break;
                    
                default:
                    console.log('❓ Unknown message type:', type);
            }
        });
    }

    // Loader Management
    showLoader(text = 'Loading...', progress = 0) {
        this.elements.loaderText.textContent = text;
        this.elements.loaderProgress.style.width = `${progress}%`;
        this.elements.loaderSection.classList.add('visible');
    }

    updateLoader(progress, text = null) {
        if (text) this.elements.loaderText.textContent = text;
        this.elements.loaderProgress.style.width = `${progress}%`;
    }

    hideLoader() {
        this.elements.loaderSection.classList.remove('visible');
        setTimeout(() => this.elements.loaderProgress.style.width = '0%', 300);
    }

    // State Management
    setAppState(state, message = '') {
        this.currentState = state;
        this.elements.appState.classList.remove('idle', 'loading', 'success', 'error');
        this.elements.appState.classList.add(state);
        this.elements.appStateText.textContent = message || this.capitalizeFirst(state);
        
        const iconMap = {
            idle: 'circle',
            loading: 'loader', 
            success: 'check-circle',
            error: 'x-circle'
        };
        
        this.elements.stateIcon.setAttribute('data-lucide', iconMap[state] || 'circle');
        this.initializeLucideIcons();
    }

    setActiveApp(appName) {
        this.currentApp = appName;
        this.elements.activeAppName.textContent = appName;
    }

    // Logging System
    addLog(appName, level, message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.innerHTML = `
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level">[${level.toUpperCase()}]</span>
            <span class="log-app">[${appName}]</span>
            <span class="log-message">${message}</span>
        `;
        
        this.elements.logEntries.appendChild(logEntry);
        this.elements.logEntries.scrollTop = this.elements.logEntries.scrollHeight;
        
        // Keep only last 100 log entries
        const logs = this.elements.logEntries.children;
        if (logs.length > 100) {
            logs[0].remove();
        }
    }

    // Utility Methods
    setInitialState() {
        this.setAppState('loading', 'Loading app...');
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('ext-theme') || 'light';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    toggleLogPanel() {
        this.isLogPanelOpen = !this.isLogPanelOpen;
        
        if (this.isLogPanelOpen) {
            this.elements.logPanel.classList.add('expanded');
            this.elements.logToggle.classList.add('active');
        } else {
            this.elements.logPanel.classList.remove('expanded');
            this.elements.logToggle.classList.remove('active');
        }
    }

    clearLogs() {
        this.elements.logEntries.innerHTML = '';
        this.addLog('Extension', 'info', 'Logs cleared');
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    addInitialLog() {
        this.addLog('Extension', 'info', 'CPQ Toolset Extension Shell initialized');
    }

    bindEvents() {
        this.elements.themeToggle?.addEventListener('click', () => this.toggleTheme());
        this.elements.logToggle?.addEventListener('click', () => this.toggleLogPanel());
        this.elements.clearLogs?.addEventListener('click', () => this.clearLogs());
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

// Initialize Extension Shell
document.addEventListener('DOMContentLoaded', () => {
    console.log('🌟 Initializing Extension Shell...');
    window.extensionShell = new ExtensionShell();
});