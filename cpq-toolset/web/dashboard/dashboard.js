class Dashboard {
    constructor() {
        this.apps = [];
        this.init();
    }

    async init() {
        // Initialize Lucide icons
        lucide.createIcons();
        
        // Fetch and display apps
        await this.loadApps();
        
        // Setup event listeners
        this.setupEventListeners();
    }

    async loadApps() {
        this.showLoading();
        
        try {
            const response = await fetch('/api/apps');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.apps = await response.json();
            this.displayApps();
            
        } catch (error) {
            console.error('Error loading apps:', error);
            this.showError(error.message);
        }
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('error').classList.add('hidden');
        document.getElementById('apps-grid').classList.add('hidden');
        document.getElementById('empty-state').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('error-message').textContent = message;
        document.getElementById('apps-grid').classList.add('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        
        document.getElementById('app-count').textContent = 'Error';
    }

    displayApps() {
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
        
        if (this.apps.length === 0) {
            document.getElementById('empty-state').classList.remove('hidden');
            document.getElementById('apps-grid').classList.add('hidden');
            document.getElementById('app-count').textContent = '0 tools available';
            return;
        }

        document.getElementById('apps-grid').classList.remove('hidden');
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('app-count').textContent = `${this.apps.length} tool${this.apps.length !== 1 ? 's' : ''} available`;

        const grid = document.getElementById('apps-grid');
        grid.innerHTML = '';

        this.apps.forEach(app => {
            const card = this.createAppCard(app);
            grid.appendChild(card);
        });

        // Add fade-in animation
        grid.classList.add('fade-in');
        
        // Reinitialize Lucide icons for new content
        lucide.createIcons();
    }

    createAppCard(app) {
        const card = document.createElement('div');
        card.className = 'app-card';
        card.setAttribute('data-app', app.name);
        
        // Generate icon from first letter of title
        const iconLetter = app.title.charAt(0).toUpperCase();
        
        // Generate description based on app name
        const descriptions = {
            'data-comparison': 'Compare configuration data across multiple Salesforce orgs with advanced filtering and diff visualization.',
            'schema-analysis': 'Analyze and compare object schemas, field types, and relationships across orgs.',
            'default': 'Salesforce CPQ development and analysis tool.'
        };
        
        const description = descriptions[app.name] || descriptions.default;

        card.innerHTML = `
            <div class="app-header">
                <div class="app-icon">${iconLetter}</div>
                <div class="app-info">
                    <h3>${app.title}</h3>
                    <div class="app-path">${app.path}</div>
                </div>
            </div>
            <div class="app-description">
                ${description}
            </div>
        `;

        card.addEventListener('click', () => this.launchApp(app));
        
        return card;
    }

    launchApp(app) {
        console.log('Launching app:', app);
        // For now, just navigate to the app path
        window.location.href = app.path;
    }

    setupEventListeners() {
        document.getElementById('retry-btn').addEventListener('click', () => {
            this.loadApps();
        });
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});