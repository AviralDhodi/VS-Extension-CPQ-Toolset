class ObjectFieldSelector {
    constructor() {
        this.config = JSON.parse(localStorage.getItem('currentConfig') || '{}');
        this.objects = [];
        this.fields = [];
        this.lookupFields = [];
        this.selectedObject = null;
        this.currentTab = 'fields';
        this.selections = JSON.parse(localStorage.getItem('objectSelections') || '{}');
        this.sortByPackage = false;
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.fieldSearchTerm = '';
        
        console.log('ObjectFieldSelector initialized', { 
            config: this.config, 
            existingSelections: Object.keys(this.selections).length 
        });
        
        this.init();
    }

    async init() {
        lucide.createIcons();
        this.setupEventListeners();
        await this.loadObjects();
        this.updateConfigSummary();
    }

    setupEventListeners() {
        console.log('Setting up persistent event listeners');

        // Object search
        document.getElementById('object-search').addEventListener('input', (e) => {
            this.searchTerm = e.target.value.toLowerCase();
            this.filterAndDisplayObjects();
        });

        // Object sorting
        document.getElementById('sort-package').addEventListener('click', () => {
            this.sortByPackage = !this.sortByPackage;
            this.filterAndDisplayObjects();
        });

        document.getElementById('sort-direction').addEventListener('click', () => {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            document.getElementById('sort-icon').setAttribute('data-lucide', 
                this.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down');
            lucide.createIcons();
            this.filterAndDisplayObjects();
        });

        // Field tabs
        document.querySelectorAll('.field-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const newTab = e.target.dataset.tab;
                this.switchTab(newTab);
            });
        });

        // Field search
        document.getElementById('field-search').addEventListener('input', (e) => {
            this.fieldSearchTerm = e.target.value.toLowerCase();
            this.filterAndDisplayFields();
        });

        // Object list event delegation
        document.getElementById('objects-list').addEventListener('click', (e) => {
            const objectItem = e.target.closest('.object-item');
            if (objectItem) {
                const objectName = objectItem.dataset.object;
                this.selectObject(objectName);
            }
        });

        // Fields list event delegation
        document.getElementById('fields-list').addEventListener('click', (e) => {
            this.handleFieldAction(e, 'fields');
        });

        document.getElementById('lookups-list').addEventListener('click', (e) => {
            this.handleFieldAction(e, 'lookups');
        });

        // Modal event listeners
        document.getElementById('lookup-modal-close').addEventListener('click', () => {
            this.closeLookupModal();
        });

        document.getElementById('lookup-cancel').addEventListener('click', () => {
            this.closeLookupModal();
        });

        document.getElementById('lookup-confirm').addEventListener('click', () => {
            this.confirmLookupSelection();
        });

        document.querySelector('.modal-backdrop').addEventListener('click', () => {
            this.closeLookupModal();
        });

        // Lookup fields delegation
        document.getElementById('lookup-fields-container').addEventListener('click', (e) => {
            const lookupItem = e.target.closest('.lookup-field-item');
            if (lookupItem) {
                document.querySelectorAll('.lookup-field-item').forEach(item => 
                    item.classList.remove('selected'));
                lookupItem.classList.add('selected');
                document.getElementById('lookup-confirm').disabled = false;
            }
        });

        // Config actions
        document.getElementById('save-config').addEventListener('click', () => {
            this.saveConfiguration();
        });

        document.getElementById('proceed-btn').addEventListener('click', () => {
            this.proceedToNextStep();
        });
    }

    async loadObjects() {
        console.log('Loading objects from server');
        this.showObjectsLoading(true);

        try {
            const response = await fetch(`/api/data-comparison/ajax/objects?config=${encodeURIComponent(JSON.stringify(this.config))}`);
            const data = await response.json();
            
            console.log('Objects loaded', { success: data.success, count: data.objects?.length });
            
            if (data.success && data.objects) {
                this.objects = data.objects;
                this.showObjectsLoading(false);
                this.filterAndDisplayObjects();
            } else {
                throw new Error('Invalid objects response');
            }
        } catch (error) {
            console.error('Failed to load objects', { error: error.message });
            this.showObjectsLoading(false);
        }
    }

    showObjectsLoading(loading) {
        document.getElementById('loading-objects').classList.toggle('active', loading);
        document.getElementById('objects-list').classList.toggle('hidden', loading);
    }

    showFieldsLoading(loading) {
        document.getElementById('loading-fields').classList.toggle('active', loading);
        document.getElementById('fields-list').classList.toggle('active', !loading && this.currentTab === 'fields');
        document.getElementById('lookups-list').classList.toggle('active', !loading && this.currentTab === 'lookups');
        document.getElementById('no-object-selected').classList.toggle('active', false);
    }

    filterAndDisplayObjects() {
        console.log('Filtering objects', { 
            searchTerm: this.searchTerm, 
            sortByPackage: this.sortByPackage, 
            sortDirection: this.sortDirection 
        });

        let filteredObjects = [...this.objects];

        // Apply search filter
        if (this.searchTerm) {
            filteredObjects = filteredObjects.filter(obj => 
                obj.name.toLowerCase().includes(this.searchTerm) ||
                obj.label.toLowerCase().includes(this.searchTerm)
            );
        }

        // Sort objects
        filteredObjects.sort((a, b) => {
            const aValue = this.sortByPackage ? (a.namespace || 'Standard') : a.name;
            const bValue = this.sortByPackage ? (b.namespace || 'Standard') : b.name;
            
            const comparison = aValue.localeCompare(bValue);
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });

        this.displayObjects(filteredObjects);
    }

    displayObjects(objects) {
        const container = document.getElementById('objects-list');
        
        if (this.sortByPackage) {
            const grouped = this.groupByNamespace(objects);
            container.innerHTML = Object.entries(grouped).map(([namespace, namespaceObjects]) => `
                <div class="namespace-group">
                    <div class="namespace-header">${namespace || 'Standard'}</div>
                    ${namespaceObjects.map(obj => this.createObjectHTML(obj)).join('')}
                </div>
            `).join('');
        } else {
            container.innerHTML = objects.map(obj => this.createObjectHTML(obj)).join('');
        }

        console.log('Objects displayed', { count: objects.length, grouped: this.sortByPackage });
    }

    groupByNamespace(objects) {
        return objects.reduce((groups, obj) => {
            const namespace = obj.namespace || '';
            if (!groups[namespace]) groups[namespace] = [];
            groups[namespace].push(obj);
            return groups;
        }, {});
    }

    createObjectHTML(obj) {
        const isSelected = this.selectedObject === obj.name;
        return `
            <div class="object-item ${isSelected ? 'selected' : ''}" data-object="${obj.name}">
                <div class="object-name">${obj.name}</div>
                <div class="object-label">${obj.label}</div>
            </div>
        `;
    }

    async selectObject(objectName) {
        console.log('Object selected', { objectName, previousSelection: this.selectedObject });

        // Update UI selection
        document.querySelectorAll('.object-item').forEach(item => item.classList.remove('selected'));
        document.querySelector(`[data-object="${objectName}"]`)?.classList.add('selected');
        
        this.selectedObject = objectName;
        document.getElementById('no-object-selected').classList.remove('active');
        
        await this.loadFields();
    }

    async loadFields() {
        console.log('Loading fields for object', { object: this.selectedObject });
        this.showFieldsLoading(true);

        try {
            const response = await fetch(`/api/data-comparison/ajax/fields/${this.selectedObject}?config=${encodeURIComponent(JSON.stringify(this.config))}`);
            const data = await response.json();
            
            console.log('Fields loaded', { 
                success: data.success, 
                fieldsCount: data.fields?.length,
                lookupsCount: data.lookupFields?.length 
            });
            
            if (data.success) {
                this.fields = data.fields.filter(f => !f.isLookup);
                this.lookupFields = data.lookupFields || [];
                this.showFieldsLoading(false);
                this.filterAndDisplayFields();
            } else {
                throw new Error('Invalid fields response');
            }
        } catch (error) {
            console.error('Failed to load fields', { error: error.message, object: this.selectedObject });
            this.showFieldsLoading(false);
        }
    }

    switchTab(tab) {
        console.log('Switching tab', { from: this.currentTab, to: tab });

        document.querySelectorAll('.field-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');
        
        document.querySelectorAll('.fields-list').forEach(list => list.classList.remove('active'));
        document.getElementById(`${tab}-list`).classList.add('active');
        
        this.currentTab = tab;
        
        if (this.selectedObject) {
            this.filterAndDisplayFields();
        }
    }

    filterAndDisplayFields() {
        const currentFields = this.currentTab === 'fields' ? this.fields : this.lookupFields;
        
        let filteredFields = [...currentFields];
        
        if (this.fieldSearchTerm) {
            filteredFields = filteredFields.filter(field => 
                field.name.toLowerCase().includes(this.fieldSearchTerm) ||
                field.label.toLowerCase().includes(this.fieldSearchTerm)
            );
        }

        this.displayFields(filteredFields);
    }

    displayFields(fields) {
        const container = document.getElementById(`${this.currentTab}-list`);
        const selections = this.selections[this.selectedObject] || {};
        
        console.log('Displaying fields', { 
            tab: this.currentTab, 
            fieldCount: fields.length,
            object: this.selectedObject 
        });

        if (this.currentTab === 'fields') {
            container.innerHTML = fields.map(field => `
                <div class="field-item" data-field="${field.name}">
                    <input type="checkbox" class="field-checkbox" 
                           ${selections.fields?.includes(field.name) ? 'checked' : ''}>
                    <div class="field-info">
                        <div class="field-name">${field.name}</div>
                        <div class="field-label">${field.label}</div>
                    </div>
                    <div class="field-controls">
                        <button class="field-star ${selections.foreignKey === field.name ? 'active' : ''}" 
                                data-action="star" data-field="${field.name}">
                            <i data-lucide="star"></i>
                        </button>
                        <button class="field-active ${selections.activeFields?.includes(field.name) ? 'active' : ''}"
                                data-action="active" data-field="${field.name}">
                            ACT
                        </button>
                    </div>
                    <div class="field-type">${field.type}</div>
                </div>
            `).join('');
        } else {
            container.innerHTML = fields.map(field => `
                <div class="field-item" data-field="${field.name}">
                    <input type="checkbox" class="field-checkbox"
                           ${selections.fields?.includes(field.name) ? 'checked' : ''}>
                    <div class="field-info">
                        <div class="field-name">${field.name}</div>
                        <div class="field-label">${field.label}</div>
                    </div>
                    <div class="field-controls">
                        <button class="field-active ${selections.activeFields?.includes(field.name) ? 'active' : ''}"
                                data-action="active" data-field="${field.name}">
                            ACT
                        </button>
                        <button class="expand-lookup" 
                                data-action="expand" data-field="${field.name}" 
                                data-reference="${field.referenceTo ? field.referenceTo[0] : ''}">
                            +
                        </button>
                    </div>
                    <div class="field-type">${field.type}</div>
                </div>
            `).join('');
        }

        lucide.createIcons();
    }

    handleFieldAction(e, tab) {
        const action = e.target.dataset.action;
        const fieldName = e.target.dataset.field;
        
        if (!action || !fieldName) return;

        console.log('Field action triggered', { action, fieldName, tab });

        switch (action) {
            case 'star':
                this.setForeignKey(fieldName);
                break;
            case 'active':
                this.toggleActive(fieldName);
                break;
            case 'expand':
                const referenceTo = e.target.dataset.reference;
                this.handleLookupExpand(fieldName, referenceTo);
                break;
        }

        // Handle checkbox changes
        if (e.target.type === 'checkbox') {
            this.toggleField(fieldName, e.target.checked);
        }
    }

    toggleField(fieldName, checked) {
        console.log('Toggling field selection', { fieldName, checked, object: this.selectedObject });

        if (!this.selections[this.selectedObject]) {
            this.selections[this.selectedObject] = { fields: [] };
        }
        
        if (!this.selections[this.selectedObject].fields) {
            this.selections[this.selectedObject].fields = [];
        }
        
        if (checked) {
            if (!this.selections[this.selectedObject].fields.includes(fieldName)) {
                this.selections[this.selectedObject].fields.push(fieldName);
            }
        } else {
            this.selections[this.selectedObject].fields = 
                this.selections[this.selectedObject].fields.filter(f => f !== fieldName);
        }
        
        this.saveSelections();
        this.updateConfigSummary();
    }

    setForeignKey(fieldName) {
        console.log('Setting foreign key', { fieldName, object: this.selectedObject });

        if (!this.selections[this.selectedObject]) {
            this.selections[this.selectedObject] = {};
        }
        
        // Remove previous foreign key styling
        document.querySelectorAll('.field-star').forEach(s => s.classList.remove('active'));
        
        this.selections[this.selectedObject].foreignKey = fieldName;
        document.querySelector(`[data-field="${fieldName}"] .field-star`).classList.add('active');
        
        // Auto-select field
        const checkbox = document.querySelector(`[data-field="${fieldName}"] .field-checkbox`);
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            this.toggleField(fieldName, true);
        }
        
        this.saveSelections();
        this.updateConfigSummary();
    }

    toggleActive(fieldName) {
        console.log('Toggling active field', { fieldName, object: this.selectedObject });

        if (!this.selections[this.selectedObject]) {
            this.selections[this.selectedObject] = {};
        }
        
        if (!this.selections[this.selectedObject].activeFields) {
            this.selections[this.selectedObject].activeFields = [];
        }
        
        const activeFields = this.selections[this.selectedObject].activeFields;
        const button = document.querySelector(`[data-field="${fieldName}"] .field-active`);
        
        if (activeFields.includes(fieldName)) {
            this.selections[this.selectedObject].activeFields = activeFields.filter(f => f !== fieldName);
            button.classList.remove('active');
        } else {
            activeFields.push(fieldName);
            button.classList.add('active');
        }
        
        this.saveSelections();
        this.updateConfigSummary();
    }

    async handleLookupExpand(lookupFieldName, referenceTo) {
        console.log('Expanding lookup field', { lookupFieldName, referenceTo, object: this.selectedObject });

        if (!referenceTo) {
            console.warn('No reference object found for lookup field');
            return;
        }

        try {
            const response = await fetch(`/api/data-comparison/ajax/lookup-fields/${referenceTo}?config=${encodeURIComponent(JSON.stringify(this.config))}`);
            const data = await response.json();
            
            console.log('Lookup fields response', { 
                success: data.success, 
                fieldsCount: data.fields?.length,
                referenceTo 
            });
            
            if (data.success) {
                this.showLookupModal(data.fields, referenceTo, this.selectedObject, lookupFieldName);
            } else {
                console.error('Failed to load lookup fields', { error: data.error });
            }
        } catch (error) {
            console.error('Error loading lookup fields', { error: error.message });
        }
    }

    showLookupModal(fields, lookupObjectName, parentObjectName, lookupFieldName) {
        console.log('Showing lookup modal', { 
            lookupObject: lookupObjectName, 
            parentObject: parentObjectName, 
            lookupField: lookupFieldName,
            fieldsCount: fields.length 
        });

        document.getElementById('lookup-modal-title').textContent = `Select field from ${lookupObjectName}`;
        
        const container = document.getElementById('lookup-fields-container');
        container.innerHTML = fields.map(field => `
            <div class="lookup-field-item" data-field="${field.name}" data-parent="${parentObjectName}" 
                 data-lookup="${lookupFieldName}" data-reference="${lookupObjectName}">
                <input type="radio" name="lookupFieldSelection" value="${field.name}">
                <div class="field-info">
                    <div class="field-name">${field.name}</div>
                    <div class="field-label">${field.label}</div>
                </div>
                <div class="field-type">${field.type}</div>
            </div>
        `).join('');

        document.getElementById('lookup-modal').classList.remove('hidden');
        document.getElementById('lookup-confirm').disabled = true;
    }

    confirmLookupSelection() {
        const selectedItem = document.querySelector('.lookup-field-item.selected');
        
        if (selectedItem) {
            const fieldName = selectedItem.dataset.field;
            const parentObject = selectedItem.dataset.parent;
            const lookupField = selectedItem.dataset.lookup;
            const referenceObject = selectedItem.dataset.reference;
            
            const fullFieldPath = `${parentObject}.${lookupField}.${fieldName}`;
            
            console.log('Confirming lookup selection', { 
                fullFieldPath, 
                parentObject, 
                lookupField, 
                referenceObject, 
                fieldName 
            });
            
            // Add to selections as a lookup field
            if (!this.selections[parentObject]) {
                this.selections[parentObject] = {};
            }
            
            if (!this.selections[parentObject].lookupFields) {
                this.selections[parentObject].lookupFields = [];
            }
            
            // Remove any existing lookup field for this lookup (max 1)
            this.selections[parentObject].lookupFields = 
                this.selections[parentObject].lookupFields.filter(lf => !lf.startsWith(`${parentObject}.${lookupField}.`));
            
            this.selections[parentObject].lookupFields.push(fullFieldPath);
            
            this.saveSelections();
            this.updateConfigSummary();
            this.closeLookupModal();
        }
    }

    closeLookupModal() {
        console.log('Closing lookup modal');
        document.getElementById('lookup-modal').classList.add('hidden');
    }

    saveSelections() {
        localStorage.setItem('objectSelections', JSON.stringify(this.selections));
        console.log('Selections saved to localStorage', { selections: this.selections });
    }

    updateConfigSummary() {
        const selectedObjectsList = document.getElementById('selected-objects-list');
        const fieldSelectionsList = document.getElementById('field-selections-list');
        
        // Update selected objects
        const selectedObjects = Object.keys(this.selections);
        selectedObjectsList.innerHTML = selectedObjects.length > 0 
            ? selectedObjects.map(obj => `<div class="selected-item">${obj}</div>`).join('')
            : '<div class="empty-selection">No objects selected</div>';

        // Update field selections
        let totalSelections = 0;
        const fieldSummary = Object.entries(this.selections).map(([objectName, config]) => {
            const fieldCount = (config.fields?.length || 0);
            const lookupCount = (config.lookupFields?.length || 0);
            const foreignKey = config.foreignKey ? 1 : 0;
            const activeCount = (config.activeFields?.length || 0);
            
            totalSelections += fieldCount + lookupCount;
            
            return `
                <div class="selection-item">
                    <strong>${objectName}</strong><br>
                    Fields: ${fieldCount}, Lookups: ${lookupCount}<br>
                    Foreign Key: ${config.foreignKey || 'None'}<br>
                    Active Fields: ${activeCount}
                </div>
            `;
        }).join('');

        fieldSelectionsList.innerHTML = fieldSummary || '<div class="empty-selection">No fields selected</div>';
        
        // Enable/disable proceed button
        const canProceed = selectedObjects.length > 0 && totalSelections > 0;
        document.getElementById('proceed-btn').disabled = !canProceed;
        
        console.log('Config summary updated', { 
            selectedObjects: selectedObjects.length, 
            totalSelections, 
            canProceed 
        });
    }

    saveConfiguration() {
        console.log('Saving configuration', { selections: this.selections });
        // TODO: Implement configuration save to server
        alert('Configuration saved locally. Server save functionality to be implemented.');
    }

    proceedToNextStep() {
        console.log('Proceeding to next step', { selections: this.selections });
        // TODO: Implement navigation to next step (comparison execution)
        alert('Proceeding to comparison execution. Implementation pending.');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing ObjectFieldSelector');
    new ObjectFieldSelector();
});