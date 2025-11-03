/**
 * CPQ Toolset v2 - Extension Welcome Page
 * Main dashboard for accessing all available applications
 */

class ExtensionWelcome {
    constructor() {
        this.extensionName = 'CPQ Toolset v2';
        this.extensionVersion = '2.0.0';
        this.serverUrl = 'http://localhost:3030';
        this.apps = {
            'data-comparison': {
                name: 'Data Comparison',
                path: '/data-comparison',
                status: 'production'
            },
            'permissions-analyser': {
                name: 'Permissions Analyser', 
                path: '/permissions-analyser',
                status: 'development'
            }
        };

        this.elements = {
            dataComparisonBtn: document.querySelector('.data-comparison-btn'),
            permissionsBtn: document.querySelector('.permissions-btn'),
            healthCheckBtn: document.getElementById('health-check-btn'),
            refreshBtn: document.getElementById('refresh-btn'),
            connectionStatus: document.getElementById('connection-status'),
            sfdxStatus: document.getElementById('sfdx-status'),
            serverUrl: document.getElementById('server-url')
        };

        this.init();
    }

    init() {
        console.log(`🎯 ${this.extensionName} initializing...`);
        
        this.initializeLucideIcons();
        this.bindEvents();
        this.updateSystemInfo();
        this.checkSystemHealth();
        
        console.log('✅ Extension Welcome page initialized');
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
            console.log('🎨 Lucide icons initialized');
        } else {
            console.warn('⚠️ Lucide icons not available');
        }
    }

    bindEvents() {
        // App navigation buttons
        this.elements.dataComparisonBtn?.addEventListener('click', () => {
            this.launchApp('data-comparison');
        });

        this.elements.permissionsBtn?.addEventListener('click', () => {
            this.launchApp('permissions-analyser');
        });

        // Footer actions
        this.elements.healthCheckBtn?.addEventListener('click', () => {
            this.performHealthCheck();
        });

        this.elements.refreshBtn?.addEventListener('click', () => {
            this.refreshPage();
        });

        // App card click handlers
        document.querySelectorAll('.app-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.app-button')) {
                    const appName = card.getAttribute('data-app');
                    this.launchApp(appName);
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case '1':
                        e.preventDefault();
                        this.launchApp('data-comparison');
                        break;
                    case '2':
                        e.preventDefault();
                        this.launchApp('permissions-analyser');
                        break;
                    case 'r':
                        e.preventDefault();
                        this.refreshPage();
                        break;
                    case 'h':
                        e.preventDefault();
                        this.performHealthCheck();
                        break;
                }
            }
        });

        console.log('🔗 Event listeners bound');
    }

    updateSystemInfo() {
        // Update server URL
        if (this.elements.serverUrl) {
            this.elements.serverUrl.textContent = this.serverUrl;
        }

        console.log('📊 System info updated');
    }

    async checkSystemHealth() {
        console.log('🏥 Checking system health...');

        // Check server connection
        await this.checkServerConnection();
        
        // Check SFDX CLI
        await this.checkSFDXStatus();
    }

    async checkServerConnection() {
        try {
            const response = await fetch('/health', {
                method: 'GET',
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                this.updateConnectionStatus('connected', `Connected (${data.version})`);
                console.log('✅ Server connection healthy');
            } else {
                this.updateConnectionStatus('disconnected', 'Server Error');
                console.warn('⚠️ Server responded with error');
            }
        } catch (error) {
            this.updateConnectionStatus('disconnected', 'Disconnected');
            console.error('❌ Server connection failed:', error);
        }
    }

    async checkSFDXStatus() {
        try {
            const response = await fetch('/data-comparison/api/data-comparison/orgs', {
                method: 'GET',
                timeout: 10000
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && data.orgs) {
                    this.updateSFDXStatus('success', `${data.orgs.length} org(s) authenticated`);
                    console.log(`✅ SFDX CLI healthy - ${data.orgs.length} orgs found`);
                } else {
                    this.updateSFDXStatus('warning', 'No orgs found');
                    console.warn('⚠️ SFDX CLI working but no orgs authenticated');
                }
            } else {
                this.updateSFDXStatus('error', 'CLI Error');
                console.warn('⚠️ SFDX CLI check failed');
            }
        } catch (error) {
            this.updateSFDXStatus('error', 'Not Available');
            console.error('❌ SFDX CLI check failed:', error);
        }
    }

    updateConnectionStatus(status, text) {
        if (this.elements.connectionStatus) {
            this.elements.connectionStatus.textContent = text;
            this.elements.connectionStatus.className = `info-value connection-status ${status}`;
        }
    }

    updateSFDXStatus(status, text) {
        if (this.elements.sfdxStatus) {
            this.elements.sfdxStatus.textContent = text;
            this.elements.sfdxStatus.className = `info-value status-${status}`;
        }
    }

    async launchApp(appName) {
        const app = this.apps[appName];
        
        if (!app) {
            console.error(`❌ App not found: ${appName}`);
            this.showNotification('error', `Application "${appName}" not found`);
            return;
        }

        console.log(`🚀 Launching app: ${app.name}`);
        
        // Show loading state
        this.showAppLoading(appName, true);
        
        try {
            // Add a small delay for visual feedback
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Navigate to the app
            window.location.href = app.path;
            
        } catch (error) {
            console.error(`❌ Failed to launch ${app.name}:`, error);
            this.showNotification('error', `Failed to launch ${app.name}`);
            this.showAppLoading(appName, false);
        }
    }

    showAppLoading(appName, loading) {
        const appCard = document.querySelector(`[data-app="${appName}"]`);
        const appButton = appCard?.querySelector('.app-button');
        
        if (appCard && appButton) {
            if (loading) {
                appCard.classList.add('loading');
                appButton.innerHTML = `
                    <i data-lucide="loader-2" class="button-icon animate-spin"></i>
                    Launching...
                `;
            } else {
                appCard.classList.remove('loading');
                // Restore original button content based on app
                const originalText = appName === 'data-comparison' 
                    ? 'Launch Data Comparison' 
                    : 'Launch Permissions Analyser';
                appButton.innerHTML = `
                    <i data-lucide="arrow-right" class="button-icon"></i>
                    ${originalText}
                `;
            }
            
            // Re-initialize icons
            this.initializeLucideIcons();
        }
    }

    async performHealthCheck() {
        console.log('🔍 Performing comprehensive health check...');
        
        // Show loading state
        const healthBtn = this.elements.healthCheckBtn;
        const originalContent = healthBtn.innerHTML;
        healthBtn.innerHTML = `
            <i data-lucide="loader-2" class="btn-icon animate-spin"></i>
            Checking...
        `;
        healthBtn.disabled = true;
        
        try {
            // Reset statuses
            this.updateConnectionStatus('checking', 'Checking...');
            this.updateSFDXStatus('checking', 'Checking...');
            
            // Run health checks
            await Promise.all([
                this.checkServerConnection(),
                this.checkSFDXStatus()
            ]);
            
            this.showNotification('success', 'Health check completed');
            console.log('✅ Health check completed');
            
        } catch (error) {
            console.error('❌ Health check failed:', error);
            this.showNotification('error', 'Health check failed');
        } finally {
            // Restore button
            healthBtn.innerHTML = originalContent;
            healthBtn.disabled = false;
            this.initializeLucideIcons();
        }
    }

    refreshPage() {
        console.log('🔄 Refreshing extension welcome page...');
        
        // Show loading state
        const refreshBtn = this.elements.refreshBtn;
        const originalContent = refreshBtn.innerHTML;
        refreshBtn.innerHTML = `
            <i data-lucide="loader-2" class="btn-icon animate-spin"></i>
            Refreshing...
        `;
        refreshBtn.disabled = true;
        
        // Add slight delay for visual feedback, then reload
        setTimeout(() => {
            window.location.reload();
        }, 500);
    }

    showNotification(type, message) {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; 
                        background: ${type === 'success' ? 'var(--success)' : 'var(--error)'}; 
                        color: white; padding: 1rem; border-radius: var(--border-radius); 
                        box-shadow: var(--shadow-lg); z-index: 1000; max-width: 400px;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <i data-lucide="${type === 'success' ? 'check-circle' : 'x-circle'}" 
                       style="width: 16px; height: 16px;"></i>
                    <strong>${message}</strong>
                </div>
            </div>
        `;
        document.body.appendChild(notification);
        
        // Initialize icons in notification
        this.initializeLucideIcons();
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 4000);
    }

    // Public API for external access
    getExtensionInfo() {
        return {
            name: this.extensionName,
            version: this.extensionVersion,
            serverUrl: this.serverUrl,
            apps: this.apps
        };
    }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    .animate-spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    .notification {
        animation: slideInRight 0.3s ease-out;
    }
    
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏁 DOM loaded, initializing Extension Welcome...');
    window.extensionWelcome = new ExtensionWelcome();
});

// Global API
window.ExtensionWelcome = {
    getInfo: () => window.extensionWelcome?.getExtensionInfo(),
    launchApp: (appName) => window.extensionWelcome?.launchApp(appName),
    healthCheck: () => window.extensionWelcome?.performHealthCheck()
};