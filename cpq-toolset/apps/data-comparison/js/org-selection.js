// /apps/data-comparison/js/org-selection.js


class OrgSelector {
    constructor() {
        this.orgs = [];
        this.selectedOrgs = [];
        this.currentState = 'loading'; // loading, error, config-choice, org-selection, upload-progress
        this.uploadedConfig = null;
    }

    async init() {
        this.setupEventListeners();
        await this.loadOrgs();
    }

    async loadOrgs() {
        try {
            this.setState('loading');
            
            const response = await fetch('/api/data-comparison/orgs');
            const data = await response.json();
            
            if (data.success) {
                this.orgs = data.orgs;
                this.setState('config-choice');
            } else {
                throw new Error(data.error || 'Failed to load orgs');
            }
        } catch (error) {
            console.error('Error loading orgs:', error);
            this.setState('error');
            document.getElementById('error-text').textContent = error.message;
        }
    }

    setState(state) {
        this.currentState = state;
        
        // Hide all state containers
        document.querySelectorAll('.state-container').forEach(container => {
            container.classList.add('hidden');
        });
        
        // Show current state
        const stateMap = {
            'loading': 'loading-state',
            'error': 'error-state',
            'config-choice': 'config-choice',
            'org-selection': 'org-selection',
            'upload-progress': 'upload-progress'
        };
        
        const currentContainer = document.getElementById(stateMap[state]);
        if (currentContainer) {
            currentContainer.classList.remove('hidden');
        }
        
        // Update step indicators
        this.updateStepIndicators();
    }

    updateStepIndicators() {
        const steps = document.querySelectorAll('.step');
        steps.forEach((step, index) => {
            step.classList.remove('active', 'completed');
            
            if (this.currentState === 'config-choice' || this.currentState === 'loading' || this.currentState === 'error') {
                if (index === 0) step.classList.add('active');
            } else if (this.currentState === 'org-selection' || this.currentState === 'upload-progress') {
                if (index === 0) step.classList.add('completed');
                if (index === 1) step.classList.add('active');
            }
        });
    }

    setupEventListeners() {
        // Retry button
        document.getElementById('retry-btn').addEventListener('click', () => {
            this.loadOrgs();
        });

        // Config choice buttons
        document.getElementById('upload-config-btn').addEventListener('click', () => {
            this.triggerFileUpload();
        });

        document.getElementById('create-config-btn').addEventListener('click', () => {
            this.setState('org-selection');
            this.renderOrgList();
        });

        // File input change
        document.getElementById('config-file-input').addEventListener('change', (event) => {
            this.handleFileUpload(event);
        });

        // Back button
        document.getElementById('back-to-config-btn').addEventListener('click', () => {
            this.setState('config-choice');
        });

        // Org selection buttons
        document.getElementById('select-all-btn').addEventListener('click', () => {
            this.selectAllOrgs();
        });

        document.getElementById('clear-selection-btn').addEventListener('click', () => {
            this.clearSelection();
        });

        // Action buttons
        document.getElementById('validate-btn').addEventListener('click', () => {
            this.validateSelection();
        });

        document.getElementById('next-btn').addEventListener('click', () => {
            this.proceedToNextStep();
        });
    }

    triggerFileUpload() {
        const fileInput = document.getElementById('config-file-input');
        fileInput.click();
    }

    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.endsWith('.json')) {
            this.showToast('Please select a JSON configuration file', 'error');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('File size too large. Maximum 10MB allowed.', 'error');
            return;
        }

        try {
            this.setState('upload-progress');
            this.updateUploadProgress(10, 'Reading file...');

            // Read file content
            const fileContent = await this.readFileContent(file);
            this.updateUploadProgress(30, 'Validating configuration...');

            // Upload to server
            const formData = new FormData();
            formData.append('configFile', file);

            const response = await fetch('/api/data-comparison/config/upload', {
                method: 'POST',
                body: formData
            });

            this.updateUploadProgress(70, 'Processing upload...');

            const result = await response.json();

            if (result.success) {
                this.updateUploadProgress(100, 'Upload complete!');
                this.uploadedConfig = {
                    filename: result.configFilename,
                    summary: result.summary
                };

                // Show success and proceed
                setTimeout(() => {
                    this.showConfigUploadSuccess(result);
                }, 1000);

            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.showToast(`Upload failed: ${error.message}`, 'error');
            this.setState('config-choice');
        }

        // Reset file input
        event.target.value = '';
    }

    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    updateUploadProgress(percentage, statusText) {
        const progressFill = document.getElementById('upload-progress-fill');
        const statusTextElement = document.getElementById('upload-status-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (statusTextElement) {
            statusTextElement.textContent = statusText;
        }
    }

    showConfigUploadSuccess(result) {
        // Show success notification
        this.showToast(
            `Config uploaded successfully! ${result.summary.orgs} orgs, ${result.summary.objects} objects`, 
            'success'
        );

        // Show validation results and proceed button
        this.setState('config-choice');
        this.showUploadedConfigInfo(result);
    }

    showUploadedConfigInfo(result) {
        const configChoice = document.getElementById('config-choice');
        
        // Create success info element
        const successInfo = document.createElement('div');
        successInfo.className = 'uploaded-config-info';
        successInfo.innerHTML = `
            <div class="success-message">
                <i data-lucide="check-circle" class="success-icon"></i>
                <div class="success-content">
                    <h4>Configuration Uploaded Successfully</h4>
                    <p>File: ${result.configFilename}</p>
                    <div class="config-summary">
                        <span class="summary-item">
                            <i data-lucide="building"></i>
                            ${result.summary.orgs} Organizations
                        </span>
                        <span class="summary-item">
                            <i data-lucide="database"></i>
                            ${result.summary.objects} Objects
                        </span>
                        ${result.summary.validatedOrgs ? `
                        <span class="summary-item">
                            <i data-lucide="check"></i>
                            ${result.summary.validatedOrgs.length} Validated
                        </span>
                        ` : ''}
                    </div>
                    <button id="start-comparison-btn" class="btn btn-primary">
                        <i data-lucide="play"></i>
                        Start Comparison
                    </button>
                </div>
            </div>
        `;

        // Insert before config options
        const configOptions = configChoice.querySelector('.config-options');
        configChoice.insertBefore(successInfo, configOptions);

        // Initialize Lucide icons
        lucide.createIcons({ parent: successInfo });

        // Add event listener for start comparison
        document.getElementById('start-comparison-btn').addEventListener('click', () => {
            this.startComparisonWithConfig();
        });
    }

    async startComparisonWithConfig() {
        try {
            if (!this.uploadedConfig) {
                throw new Error('No config available');
            }

            this.showToast('Starting comparison...', 'info');

            // Start comparison with uploaded config
            const response = await fetch('/api/data-comparison/comparison/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    configFilename: this.uploadedConfig.filename
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Comparison started successfully!', 'success');
                
                // Redirect to status page
                setTimeout(() => {
                    window.location.href = `/api/data-comparison/status?comparisonId=${result.comparisonId}`;
                }, 1500);

            } else {
                throw new Error(result.error || 'Failed to start comparison');
            }

        } catch (error) {
            console.error('Error starting comparison:', error);
            this.showToast(`Failed to start comparison: ${error.message}`, 'error');
        }
    }

    renderOrgList() {
        const orgList = document.getElementById('org-list');
        orgList.innerHTML = '';

        this.orgs.forEach((org, index) => {
            const orgItem = document.createElement('div');
            orgItem.className = 'org-item';
            orgItem.innerHTML = `
                <div class="org-checkbox">
                    <input type="checkbox" id="org-${index}" data-org-index="${index}">
                    <label for="org-${index}" class="checkbox-label"></label>
                </div>
                <div class="org-info">
                    <div class="org-name">${org.alias || org.username}</div>
                    <div class="org-details">
                        <span class="org-username">${org.username}</span>
                        <span class="org-status ${org.connectedStatus === 'Connected' ? 'connected' : 'disconnected'}">
                            ${org.connectedStatus}
                        </span>
                    </div>
                </div>
                <div class="org-actions">
                    <span class="org-type">${org.orgType || 'Production'}</span>
                </div>
            `;

            // Add click listener
            const checkbox = orgItem.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', () => {
                this.updateOrgSelection();
            });

            orgList.appendChild(orgItem);
        });

        this.updateOrgSelection();
    }

    updateOrgSelection() {
        const checkboxes = document.querySelectorAll('#org-list input[type="checkbox"]');
        this.selectedOrgs = [];

        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const orgIndex = parseInt(checkbox.dataset.orgIndex);
                this.selectedOrgs.push(this.orgs[orgIndex]);
            }
        });

        // Update button states
        const validateBtn = document.getElementById('validate-btn');
        const nextBtn = document.getElementById('next-btn');
        
        const hasMinimumOrgs = this.selectedOrgs.length >= 2;
        
        validateBtn.disabled = !hasMinimumOrgs;
        nextBtn.disabled = !hasMinimumOrgs;

        // Update selection count display
        this.updateSelectionCount();
    }

    updateSelectionCount() {
        const header = document.querySelector('.org-list-header p');
        const count = this.selectedOrgs.length;
        const minRequired = 2;
        
        if (count === 0) {
            header.textContent = `Choose ${minRequired} or more orgs to compare (minimum required)`;
        } else if (count < minRequired) {
            header.textContent = `${count} selected - need ${minRequired - count} more (minimum ${minRequired} required)`;
        } else {
            header.textContent = `${count} orgs selected - ready to proceed`;
        }
    }

    selectAllOrgs() {
        const checkboxes = document.querySelectorAll('#org-list input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });
        this.updateOrgSelection();
    }

    clearSelection() {
        const checkboxes = document.querySelectorAll('#org-list input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.updateOrgSelection();
    }

    async validateSelection() {
        try {
            this.showToast('Validating org connections...', 'info');
            
            const response = await fetch('/api/data-comparison/orgs/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    orgs: this.selectedOrgs.map(org => org.username)
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('All orgs validated successfully!', 'success');
                this.showValidationResults(result.validationResults);
            } else {
                throw new Error(result.error || 'Validation failed');
            }

        } catch (error) {
            console.error('Validation error:', error);
            this.showToast(`Validation failed: ${error.message}`, 'error');
        }
    }

    showValidationResults(results) {
        const validationResults = document.getElementById('validation-results');
        const validationList = document.getElementById('validation-list');
        
        validationList.innerHTML = '';
        
        results.forEach(result => {
            const item = document.createElement('div');
            item.className = `validation-item ${result.isValid ? 'valid' : 'invalid'}`;
            item.innerHTML = `
                <i data-lucide="${result.isValid ? 'check-circle' : 'x-circle'}" class="validation-icon"></i>
                <span class="validation-org">${result.org}</span>
                <span class="validation-message">${result.message}</span>
            `;
            validationList.appendChild(item);
        });

        validationResults.classList.remove('hidden');
        lucide.createIcons({ parent: validationResults });
    }

    async proceedToNextStep() {
        try {
            if (this.selectedOrgs.length < 2) {
                this.showToast('Please select at least 2 orgs', 'error');
                return;
            }

            this.showToast('Generating configuration...', 'info');

            const response = await fetch('/api/data-comparison/config/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    selectedOrgs: this.selectedOrgs
                })
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('Configuration generated!', 'success');

                const configData = {
                    filename: result.configFilename, // from backend
                    selectedOrgs: this.selectedOrgs    // from UI state
                };
                console.log(JSON.stringify(result));
                console.log(JSON.stringify(configData));
                
                localStorage.setItem('currentConfig', JSON.stringify(configData));
                
                // Redirect to object selection 

                setTimeout(() => {
                    window.location.href = `/api/data-comparison/objects?config=${result.configFilename}`;
                }, 1000);

            } else {
                throw new Error(result.error || 'Failed to generate config');
            }

        } catch (error) {
            console.error('Error proceeding to next step:', error);
            this.showToast(`Failed to proceed: ${error.message}`, 'error');
        }
    }

    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info'}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        lucide.createIcons({ parent: toast });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new OrgSelector();
});

setTimeout(() => {
    if (!window.orgSelector) {
        console.log('Force initializing OrgSelector');
        window.orgSelector = new OrgSelector();
        window.orgSelector.init();
    }
}, 100);