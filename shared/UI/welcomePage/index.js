// shared/UI/welcomePage/index.js - Standalone welcome (no shell communication)
class WelcomeApp {
    constructor() {
        this.apps = [];
        this.init();
    }

    async init() {
        console.log('🎯 Welcome App initializing (standalone mode)...');
        this.initializeLucideIcons();
        await this.loadApps();
        this.bindEvents();
    }

    initializeLucideIcons() {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
            console.log('✨ Lucide icons initialized');
        } else {
            console.warn('⚠️ Lucide icons not available');
        }
    }

    async loadApps() {
        try {
            console.log('📱 Loading apps...');
            const response = await fetch('/utils/get-apps');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.apps = await response.json();
            console.log('✅ Apps loaded:', this.apps);
            this.displayApps();
        } catch (error) {
            console.error('❌ Error loading apps:', error);
            this.showError();
        }
    }

    displayApps() {
        const appCount = document.getElementById('app-count');
        const appsGrid = document.getElementById('apps-grid');
        
        if (!appCount || !appsGrid) {
            console.error('❌ Required elements not found');
            return;
        }

        appCount.textContent = `${this.apps.length} tool${this.apps.length !== 1 ? 's' : ''}`;
        appsGrid.innerHTML = '';

        this.apps.forEach((app, index) => {
            const card = this.createAppCard(app);
            appsGrid.appendChild(card);
            
            // Add staggered animation
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });

        this.initializeLucideIcons();
        console.log('🎨 Apps displayed');
    }

    createAppCard(app) {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'all 0.3s ease';
        
        const iconName = this.getAppIcon(app.name);
        const description = this.getAppDescription(app.name);

        card.innerHTML = `
            <div class="app-header">
                <div class="app-icon">
                    <i data-lucide="${iconName}"></i>
                </div>
                <div class="app-info">
                    <h3 class="app-title">${app.title}</h3>
                    <div class="app-path">${app.path}</div>
                </div>
            </div>
            <div class="app-description">${description}</div>
            <div class="app-footer">
                <div class="app-version">v${app.version}</div>
                <div class="app-status">
                    <i data-lucide="check-circle"></i>
                    <span>Ready</span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => this.launchApp(app));
        
        // Add hover effects
        card.addEventListener('mouseenter', () => {
            console.log(`👆 Hovering over ${app.title}`);
        });

        return card;
    }

    getAppIcon(name) {
        const icons = {
            'data-comparison': 'git-compare',
            'upcoming-app': 'zap',
            'config-generator': 'settings',
            'org-sync': 'cloud',
            'default': 'box'
        };
        return icons[name] || icons.default;
    }

    getAppDescription(name) {
        const descriptions = {
            'data-comparison': 'Compare Salesforce CPQ configurations across multiple orgs with advanced filtering and visualization.',
            'upcoming-app': 'Next-generation CPQ tool in development with enhanced functionality for configuration management.',
            'config-generator': 'Generate CPQ configurations automatically based on templates and best practices.',
            'org-sync': 'Synchronize configurations between different Salesforce orgs seamlessly.',
            'default': 'Powerful Salesforce CPQ development and analysis tool.'
        };
        return descriptions[name] || descriptions.default;
    }

    // UPDATED: Direct navigation (no shell communication needed)
    launchApp(app) {
        console.log(`🚀 Launching ${app.title} (${app.name})`);
        
        // Add visual feedback
        const card = event.currentTarget;
        card.style.transform = 'scale(0.95)';
        
        setTimeout(() => {
            card.style.transform = '';
            
            // Direct navigation to app route (will load shell + app)
            window.location.href = app.path;
            console.log(`🔗 Navigating to: ${app.path}`);
        }, 150);
    }

    showError() {
        const appCount = document.getElementById('app-count');
        const appsGrid = document.getElementById('apps-grid');
        
        if (appCount) appCount.textContent = 'Error loading';
        if (appsGrid) {
            appsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #ef4444;">
                    <p>❌ Failed to load applications</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        🔄 Try Again
                    </button>
                </div>
            `;
        }
    }

    bindEvents() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                location.reload();
            }

            // Quick app launch shortcuts
            if (e.key >= '1' && e.key <= '9') {
                const appIndex = parseInt(e.key) - 1;
                if (this.apps[appIndex]) {
                    this.launchApp(this.apps[appIndex]);
                }
            }
        });
        
        console.log('⌨️ Event listeners bound (standalone mode)');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏁 DOM loaded, initializing Welcome App (standalone)...');
    window.welcomeApp = new WelcomeApp();
});

// Global API
window.WelcomeApp = {
    refresh: () => window.welcomeApp?.loadApps(),
    getApps: () => window.welcomeApp?.apps || []
};