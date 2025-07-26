// CPQ Toolset v3 - Shell View Controller
class ShellViewController {
    constructor() {
        this.theme = 'dark'; // Default to dark mode for SLDS
        this.currentApp = 'Data Comparison';
        this.loggingEnabled = false;
        this.logs = [];
        
        this.elements = {
            appTitle: document.getElementById('app-title'),
            appSubtitle: document.getElementById('app-subtitle'),
            themeToggle: document.getElementById('theme-toggle'),
            loggingToggle: document.getElementById('logging-toggle'),
            homeBtn: document.getElementById('home-btn'),
            progressContainer: document.getElementById('progress-container'),
            progressFill: document.getElementById('progress-fill'),
            progressText: document.getElementById('progress-text'),
            appIframe: document.getElementById('app-iframe'),
            loggingPanel: document.getElementById('logging-panel'),
            loggingContent: document.getElementById('logging-content'),
            logLevelFilter: document.getElementById('log-level-filter'),
            clearLogs: document.getElementById('clear-logs'),
            globalLoader: document.getElementById('global-loader'),
            loaderText: document.getElementById('loader-text'),
            loaderProgressFill: document.getElementById('loader-progress-fill'),
            loaderProgressText: document.getElementById('loader-progress-text'),
            statusToast: document.getElementById('status-toast'),
            toastIcon: document.getElementById('toast-icon'),
            toastMessage: document.getElementById('toast-message')
        };
        
        this.init();
    }
    
    init() {
        console.log('Shell View Controller initializing...');
        
        // Apply dark theme by default
        this.applyTheme('dark');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup iframe communication
        this.setupIframeCommunication();
        
        // Hide progress bar initially
        this.hideProgress();
        
        // Update app info
        this.updateAppInfo('Data Comparison', 'Multi-org Salesforce data analysis');
        
        console.log('Shell View Controller initialized');
    }
    
    setupEventListeners() {
        // Theme toggle
        this.elements.themeToggle?.addEventListener('click', () => {
            this.toggleTheme();
        });
        
        // Logging toggle
        this.elements.loggingToggle?.addEventListener('click', () => {
            this.toggleLogging();
        });
        
        // Home button
        this.elements.homeBtn?.addEventListener('click', () => {
            window.location.href = '/';
        });
        
        // Log level filter
        this.elements.logLevelFilter?.addEventListener('change', (e) => {
            this.filterLogs(e.target.value);
        });
        
        // Clear logs
        this.elements.clearLogs?.addEventListener('click', () => {
            this.clearLogs();
        });
    }
    
    setupIframeCommunication() {
        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            
            const { type, data } = event.data;
            
            switch (type) {
                case 'REQUEST_THEME':
                    this.sendThemeToIframe();
                    break;
                    
                case 'APP_LOADED':
                    this.handleAppLoaded(data);
                    break;
                    
                case 'APP_STATE_CHANGED':
                    this.handleStateChange(data);
                    break;
                    
                case 'ADD_LOG':
                    this.addLog(data);
                    break;
                    
                case 'SHOW_LOADER':
                    this.showGlobalLoader(data.text, data.progress);
                    break;
                    
                case 'HIDE_LOADER':
                    this.hideGlobalLoader();
                    break;
                    
                default:
                    console.log('Unknown message from iframe:', type);
            }
        });
    }
    
    applyTheme(theme) {
        this.theme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        document.body.setAttribute('data-theme', theme);
        
        // Update theme icon
        const icon = this.elements.themeToggle?.querySelector('svg');
        if (icon && theme === 'dark') {
            // Moon icon for dark mode
            icon.innerHTML = '<path d="M9 11.75c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zm6 0c-.69 0-1.25.56-1.25 1.25s.56 1.25 1.25 1.25 1.25-.56 1.25-1.25-.56-1.25-1.25-1.25zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-.29.02-.58.05-.86 2.36-1.05 4.23-2.98 5.21-5.37C11.07 8.33 14.05 10 17.42 10c.78 0 1.53-.09 2.25-.26.21.71.33 1.47.33 2.26 0 4.41-3.59 8-8 8z"/>';
        } else {
            // Sun icon for light mode
            icon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>';
        }
        
        // Send theme to iframe
        this.sendThemeToIframe();
    }
    
    toggleTheme() {
        const newTheme = this.theme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        this.showToast('success', `Switched to ${newTheme} mode`);
    }
    
    sendThemeToIframe() {
        if (this.elements.appIframe?.contentWindow) {
            const variables = {
                primaryColor: getComputedStyle(document.documentElement).getPropertyValue('--slds-g-color-brand-base-50'),
                backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--slds-g-color-neutral-base-10'),
                textColor: getComputedStyle(document.documentElement).getPropertyValue('--slds-g-color-neutral-10')
            };
            
            this.elements.appIframe.contentWindow.postMessage({
                type: 'THEME_DATA',
                theme: this.theme,
                variables
            }, '*');
        }
    }
    
    toggleLogging() {
        this.loggingEnabled = !this.loggingEnabled;
        this.elements.loggingPanel?.classList.toggle('active', this.loggingEnabled);
        this.elements.loggingToggle?.classList.toggle('active', this.loggingEnabled);
    }
    
    updateAppInfo(title, subtitle) {
        if (this.elements.appTitle) this.elements.appTitle.textContent = title;
        if (this.elements.appSubtitle) this.elements.appSubtitle.textContent = subtitle;
    }
    
    showProgress(text = 'Loading...', progress = 0) {
        this.elements.progressContainer?.classList.add('active');
        this.updateProgress(progress, text);
    }
    
    updateProgress(progress, text) {
        if (this.elements.progressFill) {
            this.elements.progressFill.style.width = `${progress}%`;
        }
        if (this.elements.progressText && text) {
            this.elements.progressText.textContent = text;
        }
    }
    
    hideProgress() {
        this.elements.progressContainer?.classList.remove('active');
    }
    
    showGlobalLoader(text = 'Loading...', progress = 0) {
        this.elements.globalLoader?.classList.add('active');
        if (this.elements.loaderText) {
            this.elements.loaderText.textContent = text;
        }
        if (this.elements.loaderProgressFill) {
            this.elements.loaderProgressFill.style.width = `${progress}%`;
        }
        if (this.elements.loaderProgressText) {
            this.elements.loaderProgressText.textContent = `${progress}%`;
        }
    }
    
    hideGlobalLoader() {
        this.elements.globalLoader?.classList.remove('active');
    }
    
    showToast(type, message, duration = 3000) {
        const toast = this.elements.statusToast;
        if (!toast) return;
        
        // Set icon based on type
        const icons = {
            success: '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>',
            error: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
            warning: '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
            info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'
        };
        
        if (this.elements.toastIcon) {
            this.elements.toastIcon.innerHTML = `<svg viewBox="0 0 24 24">${icons[type] || icons.info}</svg>`;
            this.elements.toastIcon.className = `toast-icon toast-icon-${type}`;
        }
        
        if (this.elements.toastMessage) {
            this.elements.toastMessage.textContent = message;
        }
        
        toast.classList.add('active');
        
        setTimeout(() => {
            toast.classList.remove('active');
        }, duration);
    }
    
    addLog(logData) {
        const log = {
            timestamp: logData.timestamp || new Date().toISOString(),
            level: logData.level || 'info',
            app: logData.app || 'Unknown',
            location: logData.location || 'Unknown',
            message: logData.message || ''
        };
        
        this.logs.push(log);
        
        // Keep only last 1000 logs
        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-1000);
        }
        
        // Add to UI if logging is visible
        if (this.loggingEnabled) {
            this.appendLogToUI(log);
        }
    }
    
    appendLogToUI(log) {
        const logElement = document.createElement('div');
        logElement.className = `log-entry log-${log.level}`;
        logElement.dataset.level = log.level;
        
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        
        logElement.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-level">[${log.level.toUpperCase()}]</span>
            <span class="log-location">[${log.app}:${log.location}]</span>
            <span class="log-message">${this.escapeHtml(log.message)}</span>
        `;
        
        this.elements.loggingContent?.appendChild(logElement);
        
        // Auto-scroll to bottom
        if (this.elements.loggingContent) {
            this.elements.loggingContent.scrollTop = this.elements.loggingContent.scrollHeight;
        }
    }
    
    filterLogs(level) {
        const levels = ['error', 'warn', 'info', 'debug'];
        const minLevel = levels.indexOf(level);
        
        const logEntries = this.elements.loggingContent?.querySelectorAll('.log-entry');
        logEntries?.forEach(entry => {
            const entryLevel = entry.dataset.level;
            const entryLevelIndex = levels.indexOf(entryLevel);
            
            if (level === 'all' || entryLevelIndex <= minLevel) {
                entry.style.display = 'flex';
            } else {
                entry.style.display = 'none';
            }
        });
    }
    
    clearLogs() {
        this.logs = [];
        if (this.elements.loggingContent) {
            this.elements.loggingContent.innerHTML = '';
        }
    }
    
    handleAppLoaded(data) {
        console.log('App loaded:', data);
        this.hideProgress();
        this.showToast('success', `${data.appName} loaded successfully`);
    }
    
    handleStateChange(data) {
        console.log('App state changed:', data);
        if (data.message) {
            this.updateAppInfo(this.currentApp, data.message);
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize shell controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Shell View Controller...');
    window.shellController = new ShellViewController();
});