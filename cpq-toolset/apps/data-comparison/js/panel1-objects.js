// /apps/data-comparison/js/panel1-objects.js
class Panel1Objects {
    constructor() {
        this.state = {
            objects: [],
            searchTerm: '',
            sortMode: 'name', // 'name', 'package'
            sortDirection: 'asc',
            groupByPackage: false,
            selectedObject: null,
            validated: {},
            volatile: {}
        };
        
        this.elements = {
            panel: document.getElementById('panel1'),
            searchInput: document.getElementById('p1-search'),
            sortPackageBtn: document.getElementById('p1-sort-package'),
            sortDirectionBtn: document.getElementById('p1-sort-direction'),
            sortIcon: document.getElementById('p1-sort-icon'),
            objectsList: document.getElementById('p1-objects-list')
        };
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Panel 1 Events
        document.addEventListener('p1MainEvent', this.handleP1MainEvent.bind(this));
        document.addEventListener('refreshP1Main', this.handleRefreshP1Main.bind(this));
        
        // Settings Events
        this.elements.searchInput?.addEventListener('input', this.handleSearchInput.bind(this));
        this.elements.sortPackageBtn?.addEventListener('click', this.handleSortPackage.bind(this));
        this.elements.sortDirectionBtn?.addEventListener('click', this.handleSortDirection.bind(this));
        
        // Object selection events
        this.elements.objectsList?.addEventListener('click', this.handleObjectClick.bind(this));
    }

    /**
     * Handle p1MainEvent - receives object data and settings
     */
    handleP1MainEvent(event) {
        const { validated, volatile, searchTerm, sortMode, groupByPackage } = event.detail || {};
        
        this.state.validated = validated || {};
        this.state.volatile = volatile || {};
        
        if (searchTerm !== undefined) this.state.searchTerm = searchTerm;
        if (sortMode !== undefined) this.state.sortMode = sortMode;
        if (groupByPackage !== undefined) this.state.groupByPackage = groupByPackage;
        
        this.renderObjects();
    }

    /**
     * Handle refreshP1Main - reload objects from server
     */
    async handleRefreshP1Main(event) {
        console.log('Panel1: refreshP1Main triggered');
        this.setPanelState('loading');
        
        try {
            // Get current config from controller
            const controller = window.objectController;
            const sessionConfig = JSON.parse(localStorage.getItem('currentConfig') || '{}');
            
            // Fetch objects from server
            const response = await fetch(`/api/data-comparison/ajax/objects?config=${encodeURIComponent(JSON.stringify(sessionConfig))}`);
            const data = await response.json();
            
            if (data.success && data.objects) {
                this.state.objects = data.objects;
                this.setPanelState('loaded');
                this.renderObjects();
            } else {
                throw new Error('Failed to load objects');
            }
        } catch (error) {
            console.error('Panel1: Failed to refresh objects:', error);
            this.setPanelState('error');
        }
    }

    /**
     * Handle search input
     */
    handleSearchInput(event) {
        this.state.searchTerm = event.target.value.toLowerCase();
        this.requestData();
    }

    /**
     * Handle sort by package toggle
     */
    handleSortPackage(event) {
        this.state.groupByPackage = !this.state.groupByPackage;
        this.elements.sortPackageBtn.classList.toggle('active', this.state.groupByPackage);
        this.requestData();
    }

    /**
     * Handle sort direction toggle
     */
    handleSortDirection(event) {
        this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
        this.elements.sortIcon.setAttribute('data-lucide', 
            this.state.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'
        );
        lucide.createIcons({ parent: this.elements.sortDirectionBtn });
        this.requestData();
    }

    /**
     * Handle object click selection
     */
    handleObjectClick(event) {
        const objectItem = event.target.closest('.object-item');
        if (!objectItem) return;
        
        const objectName = objectItem.dataset.object;
        if (!objectName) return;
        
        // Update selection visual state
        this.state.selectedObject = objectName;
        this.updateObjectSelection();
        
        // Fire event to notify controller
        document.dispatchEvent(new CustomEvent('p2ObjectForward', {
            detail: { objectName }
        }));
    }

    /**
     * Request data from controller
     */
    requestData() {
        document.dispatchEvent(new CustomEvent('p1DataRequestEvent', {
            detail: {
                searchTerm: this.state.searchTerm,
                sortMode: this.state.sortMode,
                groupByPackage: this.state.groupByPackage,
                sortDirection: this.state.sortDirection
            }
        }));
    }

    /**
     * Render objects list
     */
    renderObjects() {
        if (!this.elements.objectsList) return;
        
        let filteredObjects = this.filterObjects();
        let sortedObjects = this.sortObjects(filteredObjects);
        
        if (this.state.groupByPackage) {
            this.renderGroupedObjects(sortedObjects);
        } else {
            this.renderFlatObjects(sortedObjects);
        }
        
        this.updateObjectSelection();
        lucide.createIcons({ parent: this.elements.objectsList });
    }

    /**
     * Filter objects based on search term
     */
    filterObjects() {
        if (!this.state.searchTerm) return this.state.objects;
        
        return this.state.objects.filter(obj => {
            return obj.name.toLowerCase().includes(this.state.searchTerm) ||
                   (obj.label && obj.label.toLowerCase().includes(this.state.searchTerm)) ||
                   (obj.namespace && obj.namespace.toLowerCase().includes(this.state.searchTerm));
        });
    }

    /**
     * Sort objects
     */
    sortObjects(objects) {
        return objects.sort((a, b) => {
            let comparison = 0;
            
            if (this.state.sortMode === 'package') {
                // Sort by namespace first, then by name
                const namespaceA = a.namespace || 'Standard';
                const namespaceB = b.namespace || 'Standard';
                comparison = namespaceA.localeCompare(namespaceB);
                if (comparison === 0) {
                    comparison = a.name.localeCompare(b.name);
                }
            } else {
                // Sort by name
                comparison = a.name.localeCompare(b.name);
            }
            
            return this.state.sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Render objects grouped by namespace
     */
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
        
        this.elements.objectsList.innerHTML = html;
    }

    /**
     * Render objects as flat list
     */
    renderFlatObjects(objects) {
        const html = objects.map(obj => this.createObjectHTML(obj)).join('');
        this.elements.objectsList.innerHTML = html;
    }

    /**
     * Group objects by namespace
     */
    groupByNamespace(objects) {
        return objects.reduce((groups, obj) => {
            const namespace = obj.namespace || 'Standard';
            if (!groups[namespace]) groups[namespace] = [];
            groups[namespace].push(obj);
            return groups;
        }, {});
    }

    /**
     * Create HTML for single object
     */
    createObjectHTML(obj) {
        const isValidated = this.isObjectValidated(obj.name);
        const isVolatile = this.isObjectVolatile(obj.name);
        const isSelected = this.state.selectedObject === obj.name;
        
        let cssClasses = ['object-item'];
        if (isSelected) cssClasses.push('selected');
        if (isValidated) cssClasses.push('validated');
        else if (isVolatile) cssClasses.push('volatile');
        
        return `
            <div class="${cssClasses.join(' ')}" data-object="${obj.name}">
                <div class="object-name">${obj.name}</div>
                <div class="object-label">${obj.label || obj.name}</div>
                ${this.getObjectStatusIndicator(obj.name)}
            </div>
        `;
    }

    /**
     * Get status indicator for object
     */
    getObjectStatusIndicator(objectName) {
        const isValidated = this.isObjectValidated(objectName);
        const isVolatile = this.isObjectVolatile(objectName);
        
        if (isValidated) {
            return '<div class="object-status validated" title="Validated"><i data-lucide="check-circle"></i></div>';
        } else if (isVolatile) {
            return '<div class="object-status volatile" title="Has Changes"><i data-lucide="clock"></i></div>';
        }
        
        return '';
    }

    /**
     * Check if object is fully validated
     */
    isObjectValidated(objectName) {
        const validated = this.state.validated?.[objectName];
        const volatile = this.state.volatile?.[objectName];
        
        if (!validated) return false;
        if (!volatile) return true;
        
        return JSON.stringify(validated) === JSON.stringify(volatile);
    }

    /**
     * Check if object has volatile changes
     */
    isObjectVolatile(objectName) {
        const volatile = this.state.volatile?.[objectName];
        const validated = this.state.validated?.[objectName];
        
        if (!volatile) return false;
        if (!validated) return true;
        
        return JSON.stringify(validated) !== JSON.stringify(volatile);
    }

    /**
     * Update object selection visual state
     */
    updateObjectSelection() {
        // Remove selection from all objects
        this.elements.objectsList.querySelectorAll('.object-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // Add selection to current object
        if (this.state.selectedObject) {
            const selectedItem = this.elements.objectsList.querySelector(`[data-object="${this.state.selectedObject}"]`);
            selectedItem?.classList.add('selected');
        }
    }

    /**
     * Set panel state
     */
    setPanelState(state) {
        this.elements.panel.setAttribute('data-panel1-state', state);
    }

    /**
     * Reset panel to initial state
     */
    reset() {
        this.state.searchTerm = '';
        this.state.selectedObject = null;
        this.state.groupByPackage = false;
        this.state.sortDirection = 'asc';
        
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        this.elements.sortPackageBtn?.classList.remove('active');
        this.elements.sortIcon?.setAttribute('data-lucide', 'arrow-up');
        
        this.setPanelState('loading');
        this.requestData();
    }
}

// Initialize Panel 1
document.addEventListener('DOMContentLoaded', () => {
    window.panel1Objects = new Panel1Objects();
});