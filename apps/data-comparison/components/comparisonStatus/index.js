// Comparison Status Component - SLDS 2.0 with Detailed Phase Tracking
console.log('[ComparisonStatus] Component loaded - SLDS 2.0 mode');

class ComparisonStatusManager {
    constructor() {
        this.comparisonId = null;
        this.updateInterval = null;
        this.startTime = null;
        this.currentPhase = 'initialization';
        this.phaseDetails = new Map();
        
        this.init();
    }

    init() {
        console.log('[ComparisonStatus] Initializing with SLDS 2.0...');
        
        // Get comparison ID from URL
        this.comparisonId = this.getComparisonId();
        
        if (this.comparisonId) {
            // Set initial UI state
            document.getElementById('comparison-id').textContent = this.comparisonId;
            this.initializeComparison();
        } else {
            this.showEmptyState();
        }

        this.setupEventListeners();
    }
    
    showEmptyState() {
        console.log('[ComparisonStatus] No comparison ID provided');
        
        // Update UI to show empty state
        document.getElementById('overall-status').innerHTML = '<span class="slds-badge">No Comparison Selected</span>';
        document.getElementById('start-time').textContent = '-';
        document.getElementById('duration').textContent = '-';
        document.getElementById('overall-progress').textContent = '0%';
        
        this.showError('No comparison ID provided. Please start a new comparison.');
    }
    
    async initializeComparison() {
        console.log('[ComparisonStatus] Initializing comparison:', this.comparisonId);
        
        try {
            // Start with initializing state
            this.updateOverallStatus('initializing', 'slds-badge');
            
            // Start periodic status updates
            this.startStatusUpdates();
            
        } catch (error) {
            console.error('[ComparisonStatus] Error initializing comparison:', error);
            this.showError(`Failed to initialize comparison: ${error.message}`);
        }
    }
    
    startStatusUpdates() {
        console.log('[ComparisonStatus] Starting status updates...');
        
        // Get initial status
        this.getComparisonStatus();
        
        // Update every 2 seconds
        this.updateInterval = setInterval(() => {
            this.getComparisonStatus();
        }, 2000);
    }
    
    async getComparisonStatus() {
        try {
            const response = await fetch(`/data-comparison/api/comparison/status/${this.comparisonId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to get status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.updateUIWithStatus(data);
            
            // Stop updates if completed or failed
            if (data.status === 'completed' || data.status === 'failed') {
                clearInterval(this.updateInterval);
                this.updateInterval = null;
            }
            
        } catch (error) {
            console.error('[ComparisonStatus] Error getting status:', error);
            clearInterval(this.updateInterval);
            this.showError(`Failed to get comparison status: ${error.message}`);
        }
    }
    
    updateUIWithStatus(data) {
        console.log('[ComparisonStatus] Updating UI with status:', data);
        
        // Check if duplicate resolution is required
        if (data.status === 'requires_duplicate_resolution') {
            // Redirect to duplicate resolver
            window.location.href = `/data-comparison/duplicate-resolver?comparisonId=${this.comparisonId}`;
            return;
        }
        
        // Update overall status badge
        this.updateOverallStatus(data.status);
        
        // Update start time
        if (data.startTime) {
            const startTime = new Date(data.startTime);
            document.getElementById('start-time').textContent = startTime.toLocaleString();
            this.startTime = startTime;
        }
        
        // Update duration
        if (this.startTime) {
            this.updateDuration();
        }
        
        // Update overall progress percentage
        document.getElementById('overall-progress').textContent = `${data.progress || 0}%`;
        
        // Update progress bar
        const progressBar = document.getElementById('progress-bar');
        progressBar.style.width = `${data.progress || 0}%`;
        
        // Update phases
        if (data.phases) {
            this.updatePhases(data.phases);
        }
        
        // Handle warnings (duplicate FKs, etc)
        if (data.warnings && data.warnings.length > 0) {
            this.displayWarnings(data.warnings);
        }
        
        // Update configuration summary
        if (data.config) {
            this.updateConfigSummary(data.config);
        }
        
        // Update live status
        this.updateLiveStatus(data);
        
        // Update phase details
        this.updatePhaseDetails(data);
        
        // Handle special states
        if (data.status === 'completed') {
            this.handleCompletedState(data);
        } else if (data.status === 'failed') {
            this.handleFailedState(data);
        }
    }
    
    updateOverallStatus(status, badgeClass = '') {
        const statusEl = document.getElementById('overall-status');
        const statusMap = {
            'initializing': { text: 'Initializing', class: 'slds-badge' },
            'fetching_data': { text: 'Fetching Data', class: 'slds-badge slds-badge_inverse' },
            'preparing_data': { text: 'Preparing Data', class: 'slds-badge slds-badge_inverse' },
            'detecting_duplicates': { text: 'Detecting Duplicates', class: 'slds-badge slds-badge_warning' },
            'comparing': { text: 'Comparing', class: 'slds-badge slds-badge_inverse' },
            'generating_results': { text: 'Generating Results', class: 'slds-badge slds-badge_inverse' },
            'completed': { text: 'Completed', class: 'slds-badge slds-badge_success' },
            'failed': { text: 'Failed', class: 'slds-badge slds-badge_error' }
        };
        
        const statusInfo = statusMap[status] || { text: status, class: badgeClass || 'slds-badge' };
        statusEl.innerHTML = `<span class="${statusInfo.class}">${statusInfo.text}</span>`;
    }
    
    updateDuration() {
        const now = new Date();
        const diff = now - this.startTime;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        let duration = '';
        if (hours > 0) {
            duration = `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            duration = `${minutes}m ${seconds % 60}s`;
        } else {
            duration = `${seconds}s`;
        }
        
        document.getElementById('duration').textContent = duration;
    }
    
    updatePhases(phases) {
        // Update phase progress items
        Object.keys(phases).forEach(phaseKey => {
            const phase = phases[phaseKey];
            const phaseEl = document.getElementById(`phase-${phaseKey.replace('_', '-')}`);
            
            if (phaseEl) {
                // Update phase status class
                phaseEl.classList.remove('slds-is-completed', 'slds-is-current', 'slds-has-error');
                
                if (phase.status === 'completed') {
                    phaseEl.classList.add('slds-is-completed');
                } else if (phase.status === 'in_progress') {
                    phaseEl.classList.add('slds-is-current');
                } else if (phase.status === 'failed') {
                    phaseEl.classList.add('slds-has-error');
                }
                
                // Update phase status text
                const statusEl = document.getElementById(`phase-${phaseKey.replace('_', '-')}-status`);
                if (statusEl) {
                    statusEl.textContent = this.formatPhaseStatus(phase.status);
                    statusEl.className = `slds-text-body_small phase-status phase-status_${phase.status}`;
                }
            }
        });
    }
    
    formatPhaseStatus(status) {
        const statusMap = {
            'pending': 'Pending',
            'in_progress': 'In Progress',
            'completed': 'Completed',
            'failed': 'Failed'
        };
        return statusMap[status] || status;
    }
    
    updateConfigSummary(config) {
        // Update org count
        if (config.orgs) {
            document.getElementById('org-count').textContent = config.orgs.length;
        }
        
        // Update object count
        if (config.objects) {
            document.getElementById('object-count').textContent = Object.keys(config.objects).length;
        }
        
        // Update field count
        if (config.objects) {
            let totalFields = 0;
            Object.values(config.objects).forEach(obj => {
                totalFields += (obj.fields || []).length;
            });
            document.getElementById('field-count').textContent = totalFields;
        }
    }
    
    updateLiveStatus(data) {
        const liveStatusEl = document.getElementById('live-status-content');
        
        let statusHTML = '';
        
        if (data.status === 'fetching_data' && data.phases.dataFetch) {
            const fetchPhase = data.phases.dataFetch;
            statusHTML = `
                <div class="status-message">
                    <strong>Fetching Data from Salesforce</strong>
                    Progress: ${fetchPhase.progress || 0}%<br>
                    ${fetchPhase.currentObject ? `Current Object: ${fetchPhase.currentObject}` : ''}
                </div>
            `;
        } else if (data.status === 'preparing_data' && data.phases.dataPrep) {
            const prepPhase = data.phases.dataPrep;
            statusHTML = `
                <div class="status-message">
                    <strong>Converting to Parquet Format</strong>
                    Progress: ${prepPhase.progress || 0}%<br>
                    ${prepPhase.subPhase === 'duplicate_detection' ? 'Detecting duplicate foreign keys...' : 'Converting data files...'}
                </div>
            `;
        } else if (data.status === 'comparing' && data.phases.comparison) {
            const comparePhase = data.phases.comparison;
            statusHTML = `
                <div class="status-message">
                    <strong>Running Comparison Analysis</strong>
                    Progress: ${comparePhase.progress || 0}%<br>
                    ${comparePhase.currentPhase || 'Processing data...'}
                </div>
            `;
        } else if (data.status === 'generating_results') {
            statusHTML = `
                <div class="status-message">
                    <strong>Generating Excel Reports</strong>
                    Finalizing comparison results...
                </div>
            `;
        } else if (data.status === 'completed') {
            statusHTML = `
                <div class="status-message slds-text-color_success">
                    <strong>Comparison Complete!</strong>
                    All phases completed successfully
                </div>
            `;
        } else if (data.status === 'failed') {
            statusHTML = `
                <div class="status-message slds-text-color_error">
                    <strong>Comparison Failed</strong>
                    ${data.error || 'An error occurred during processing'}
                </div>
            `;
        } else {
            statusHTML = `
                <div class="status-message">
                    <strong>${this.formatStatus(data.status)}</strong>
                    Please wait...
                </div>
            `;
        }
        
        liveStatusEl.innerHTML = statusHTML;
    }
    
    updatePhaseDetails(data) {
        const detailsContainer = document.getElementById('phase-details');
        
        // Store phase details for display
        if (data.phases) {
            Object.entries(data.phases).forEach(([phaseKey, phase]) => {
                if (phase.status === 'in_progress' || phase.status === 'completed') {
                    this.phaseDetails.set(phaseKey, phase);
                }
            });
        }
        
        // Render phase detail cards
        let detailsHTML = '';
        
        this.phaseDetails.forEach((phase, phaseKey) => {
            const phaseName = this.getPhaseDisplayName(phaseKey);
            const details = this.getPhaseDetails(phaseKey, phase, data);
            
            detailsHTML += `
                <article class="slds-card phase-detail-card">
                    <div class="slds-card__header slds-grid">
                        <header class="slds-media slds-media_center slds-has-flexi-truncate">
                            <div class="slds-media__figure">
                                <span class="slds-icon_container ${this.getPhaseIconClass(phaseKey)}">
                                    <svg class="slds-icon slds-icon_small" aria-hidden="true">
                                        <use xlink:href="/shared/assets/slds/icons/${this.getPhaseIcon(phaseKey)}"></use>
                                    </svg>
                                </span>
                            </div>
                            <div class="slds-media__body">
                                <h3 class="slds-card__header-title">
                                    <span>${phaseName}</span>
                                </h3>
                            </div>
                            <div class="slds-media__figure slds-media__figure_reverse">
                                ${this.getPhaseStatusBadge(phase.status)}
                            </div>
                        </header>
                    </div>
                    <div class="slds-card__body slds-card__body_inner">
                        <div class="phase-detail-content">
                            ${details}
                        </div>
                    </div>
                </article>
            `;
        });
        
        detailsContainer.innerHTML = detailsHTML;
    }
    
    getPhaseDisplayName(phaseKey) {
        const names = {
            'dataFetch': 'Data Fetching',
            'dataPrep': 'Data Preparation',
            'comparison': 'Comparison Analysis',
            'results': 'Results Generation'
        };
        return names[phaseKey] || phaseKey;
    }
    
    getPhaseIconClass(phaseKey) {
        const classes = {
            'dataFetch': 'slds-icon-standard-data-streams',
            'dataPrep': 'slds-icon-standard-dataset',
            'comparison': 'slds-icon-standard-merge',
            'results': 'slds-icon-standard-report'
        };
        return classes[phaseKey] || 'slds-icon-standard-process';
    }
    
    getPhaseIcon(phaseKey) {
        const icons = {
            'dataFetch': 'standard-sprite/svg/symbols.svg#data_streams',
            'dataPrep': 'standard-sprite/svg/symbols.svg#dataset',
            'comparison': 'standard-sprite/svg/symbols.svg#merge',
            'results': 'standard-sprite/svg/symbols.svg#report'
        };
        return icons[phaseKey] || 'standard-sprite/svg/symbols.svg#process';
    }
    
    getPhaseStatusBadge(status) {
        if (status === 'completed') {
            return '<span class="slds-badge slds-badge_success">Complete</span>';
        } else if (status === 'in_progress') {
            return '<span class="slds-badge slds-badge_inverse">In Progress</span>';
        } else if (status === 'failed') {
            return '<span class="slds-badge slds-badge_error">Failed</span>';
        }
        return '<span class="slds-badge">Pending</span>';
    }
    
    getPhaseDetails(phaseKey, phase, data) {
        let details = '<ul>';
        
        switch (phaseKey) {
            case 'dataFetch':
                if (phase.progress !== undefined) {
                    details += `<li>Progress: ${phase.progress}%</li>`;
                }
                if (phase.currentObject) {
                    details += `<li>Current Object: <strong>${phase.currentObject}</strong></li>`;
                }
                if (data.config && data.config.orgs) {
                    details += `<li>Organizations: ${data.config.orgs.join(', ')}</li>`;
                }
                break;
                
            case 'dataPrep':
                if (phase.progress !== undefined) {
                    details += `<li>Progress: ${phase.progress}%</li>`;
                }
                if (phase.subPhase) {
                    details += `<li>Current Task: ${this.formatSubPhase(phase.subPhase)}</li>`;
                }
                if (data.duplicatesDetected) {
                    details += `<li class="slds-text-color_warning">Duplicate foreign keys detected</li>`;
                }
                break;
                
            case 'comparison':
                if (phase.progress !== undefined) {
                    details += `<li>Progress: ${phase.progress}%</li>`;
                }
                if (phase.currentPhase) {
                    details += `<li>Current Phase: ${phase.currentPhase}</li>`;
                }
                if (data.recordCount) {
                    details += `<li>Records Processed: ${data.recordCount.toLocaleString()}</li>`;
                }
                break;
                
            case 'results':
                if (phase.status === 'completed' && data.resultPath) {
                    details += `<li>Results saved successfully</li>`;
                    details += `<li>Excel report generated</li>`;
                }
                break;
        }
        
        details += '</ul>';
        return details;
    }
    
    formatSubPhase(subPhase) {
        const subPhaseMap = {
            'duplicate_detection': 'Detecting Duplicate Foreign Keys',
            'parquet_conversion': 'Converting to Parquet Format'
        };
        return subPhaseMap[subPhase] || subPhase;
    }
    
    formatStatus(status) {
        return status.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
    
    updateRecordCount(count) {
        const recordCountEl = document.getElementById('record-count');
        if (recordCountEl && count !== undefined) {
            recordCountEl.textContent = count.toLocaleString();
        }
    }
    
    handleCompletedState(data) {
        console.log('[ComparisonStatus] Comparison completed successfully');
        
        // Enable action buttons
        document.getElementById('view-results-btn').disabled = false;
        document.getElementById('download-results-btn').disabled = false;
        
        // Update record count if available
        if (data.recordCount) {
            this.updateRecordCount(data.recordCount);
        }
        
        // Stop duration updates
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }
    }
    
    handleFailedState(data) {
        console.log('[ComparisonStatus] Comparison failed:', data.error);
        
        // Show error
        this.showError(data.error || 'Comparison failed');
        
        // Stop duration updates
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }
    }
    
    showError(message) {
        const errorSection = document.getElementById('error-section');
        const errorMessage = document.getElementById('error-message');
        
        if (errorSection && errorMessage) {
            errorMessage.textContent = message;
            errorSection.style.display = 'block';
        }
    }
    
    displayWarnings(warnings) {
        console.log('[ComparisonStatus] Displaying warnings:', warnings);
        
        // Find or create warning section after progress bar
        let warningSection = document.getElementById('warning-section');
        if (!warningSection) {
            warningSection = document.createElement('div');
            warningSection.id = 'warning-section';
            warningSection.className = 'warning-section';
            
            const progressBar = document.querySelector('.slds-progress');
            if (progressBar && progressBar.parentNode) {
                progressBar.parentNode.insertBefore(warningSection, progressBar.nextSibling);
            }
        }
        
        // Clear existing warnings
        warningSection.innerHTML = '';
        
        // Display each warning
        warnings.forEach(warning => {
            if (warning.type === 'duplicate_foreign_keys' && warning.severity === 'high') {
                const warningDiv = document.createElement('div');
                warningDiv.className = 'slds-notification slds-notification_alert duplicate-fk-warning';
                warningDiv.innerHTML = `
                    <div class="slds-notification__body">
                        <span class="slds-icon_container slds-icon-utility-warning slds-m-right_x-small" title="Warning">
                            <svg class="slds-icon slds-icon_small" aria-hidden="true">
                                <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#warning"></use>
                            </svg>
                        </span>
                        <div>
                            <h2 class="slds-text-heading_small slds-m-bottom_xx-small">Duplicate Foreign Keys Detected</h2>
                            <p>${warning.message}</p>
                            ${warning.details ? this.formatDuplicateDetails(warning.details) : ''}
                        </div>
                    </div>
                `;
                warningSection.appendChild(warningDiv);
            }
        });
    }
    
    formatDuplicateDetails(details) {
        if (!details || !details.duplicates) return '';
        
        let html = '<div class="duplicate-fk-details">';
        html += '<p class="slds-text-body_small slds-m-bottom_x-small">Affected Organizations:</p>';
        html += '<ul>';
        
        for (const [orgName, orgData] of Object.entries(details.duplicates)) {
            html += `<li><strong>${orgName}</strong>: ${orgData.objects_with_duplicates} objects with duplicates`;
            
            // Show objects with duplicates
            if (orgData.objects) {
                html += '<ul>';
                for (const [objName, objData] of Object.entries(orgData.objects)) {
                    html += `<li>${objName}: ${objData.duplicate_count} duplicate ${objData.foreign_key_field} values</li>`;
                }
                html += '</ul>';
            }
            html += '</li>';
        }
        
        html += '</ul>';
        html += '<p class="slds-text-body_small slds-m-top_x-small slds-text-color_warning">⚠️ Data comparison may produce unexpected results with duplicate foreign keys.</p>';
        html += '</div>';
        
        return html;
    }
    
    getComparisonId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('comparisonId');
    }
    
    setupEventListeners() {
        // Refresh button
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.getComparisonStatus();
        });
        
        // View results button
        document.getElementById('view-results-btn')?.addEventListener('click', () => {
            this.viewResults();
        });
        
        // Download results button
        document.getElementById('download-results-btn')?.addEventListener('click', () => {
            this.downloadResults();
        });
        
        // New comparison button
        document.getElementById('new-comparison-btn')?.addEventListener('click', () => {
            window.location.href = '/data-comparison/welcome';
        });
        
        // Start duration timer
        this.durationInterval = setInterval(() => {
            if (this.startTime) {
                this.updateDuration();
            }
        }, 1000);
    }
    
    viewResults() {
        if (!this.comparisonId) {
            this.showError('No comparison ID available');
            return;
        }
        
        // Navigate to comparison viewer
        window.location.href = `/data-comparison/comparison-viewer?comparisonId=${this.comparisonId}`;
    }
    
    async downloadResults() {
        if (!this.comparisonId) {
            this.showError('No comparison ID available');
            return;
        }
        
        try {
            console.log('[ComparisonStatus] Downloading results for:', this.comparisonId);
            
            // Show loading state on button
            const downloadBtn = document.getElementById('download-results-btn');
            const originalText = downloadBtn.textContent;
            downloadBtn.textContent = 'Downloading...';
            downloadBtn.disabled = true;
            
            // Trigger download
            window.location.href = `/data-comparison/api/comparison/${this.comparisonId}/download`;
            
            // Restore button after delay
            setTimeout(() => {
                downloadBtn.textContent = originalText;
                downloadBtn.disabled = false;
            }, 2000);
            
        } catch (error) {
            console.error('[ComparisonStatus] Download error:', error);
            this.showError(`Download failed: ${error.message}`);
        }
    }
    
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }
        console.log('[ComparisonStatus] Component destroyed');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.comparisonStatusManager = new ComparisonStatusManager();
    });
} else {
    window.comparisonStatusManager = new ComparisonStatusManager();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.comparisonStatusManager) {
        window.comparisonStatusManager.destroy();
    }
});