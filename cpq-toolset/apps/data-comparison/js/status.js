// /apps/data-comparison/js/status.js

class ComparisonStatusTracker {
    constructor() {
        this.comparisonId = this.getComparisonIdFromURL();
        this.pollingInterval = null;
        this.pollingFrequency = 2000; // 2 seconds
        this.startTime = Date.now();
        this.logEntries = [];
        this.currentState = 'loading';
        
        if (!this.comparisonId) {
            this.showError('No comparison ID provided');
            return;
        }
        
        this.init();
    }

    getComparisonIdFromURL() {
        const params = new URLSearchParams(window.location.search);
        return params.get('comparisonId');
    }

    init() {
        this.setupEventListeners();
        this.startPolling();
        this.addLogEntry('Initializing comparison status tracker...', 'info');
    }

    setupEventListeners() {
        // Error state buttons
        document.getElementById('retry-btn').addEventListener('click', () => {
            this.retryComparison();
        });

        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = '/apps/data-comparison/';
        });

        // Completion state buttons
        document.getElementById('view-results-btn').addEventListener('click', () => {
            this.viewResults();
        });

        document.getElementById('download-results-btn').addEventListener('click', () => {
            this.downloadResults();
        });

        document.getElementById('new-comparison-btn').addEventListener('click', () => {
            window.location.href = '/apps/data-comparison/';
        });

        // Log toggle
        document.getElementById('toggle-log-btn').addEventListener('click', () => {
            this.toggleLog();
        });

        document.getElementById('clear-log-btn').addEventListener('click', () => {
            this.clearLog();
        });
    }

    startPolling() {
        this.pollingInterval = setInterval(() => {
            this.pollStatus();
        }, this.pollingFrequency);
        
        // Initial poll
        this.pollStatus();
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async pollStatus() {
        try {
            const response = await fetch(`/api/data-comparison/comparison/status/${this.comparisonId}`);
            const data = await response.json();

            if (data.success) {
                this.updateStatus(data.comparison);
            } else {
                throw new Error(data.error || 'Failed to get status');
            }

        } catch (error) {
            console.error('Status polling error:', error);
            this.addLogEntry(`Status polling error: ${error.message}`, 'error');
            
            // Don't show error immediately, might be temporary network issue
            setTimeout(() => {
                if (this.currentState === 'loading') {
                    this.showError('Failed to connect to comparison service');
                }
            }, 10000);
        }
    }

    updateStatus(comparison) {
        const { status, progress, engineUsed, engineInfo, warnings, error, startTime, endTime } = comparison;
        
        // Update start time if available
        if (startTime) {
            this.startTime = new Date(startTime).getTime();
        }

        // Handle different states
        switch (status) {
            case 'running':
                this.showProgress(progress, engineInfo, warnings);
                break;
            case 'completed':
                this.showCompleted(comparison);
                break;
            case 'failed':
                this.showError(error || 'Comparison failed');
                break;
            default:
                this.showLoading();
        }

        // Update elapsed time
        this.updateElapsedTime();
        
        // Add log entry for status updates
        this.addLogEntry(`Status: ${status} - ${progress?.currentObject || 'Initializing'}`, 'info');
    }

    showLoading() {
        this.setState('loading');
        this.addLogEntry('Waiting for comparison to start...', 'info');
    }

    showProgress(progress, engineInfo, warnings) {
        this.setState('progress');
        
        // Update main progress
        const progressPercentage = progress.totalObjects > 0 
            ? Math.round((progress.completedObjects / progress.totalObjects) * 100)
            : 0;
            
        this.updateProgressBar(progressPercentage);
        
        // Update progress text
        document.getElementById('progress-current').textContent = progress.completedObjects || 0;
        document.getElementById('progress-total').textContent = progress.totalObjects || 0;
        document.getElementById('progress-percentage').textContent = `${progressPercentage}%`;
        
        // Update title based on phase
        const phaseTitle = {
            'data_fetch': 'Fetching Data from Salesforce',
            'comparison': 'Comparing Data Across Orgs',
            'engine_selection': 'Selecting Optimal Engine'
        };
        
        document.getElementById('progress-title').textContent = 
            phaseTitle[progress.phase] || 'Processing Comparison';
        
        // Update step indicators
        this.updateStepIndicators(progress.phase);
        
        // Show engine info
        if (engineInfo) {
            this.showEngineInfo(engineInfo);
        }
        
        // Show warnings
        if (warnings && warnings.length > 0) {
            this.showWarnings(warnings);
        }
        
        // Update object list (placeholder for now)
        this.updateObjectList(progress);
        
        // Show comparison details if in comparison phase
        if (progress.phase === 'comparison') {
            this.showComparisonDetails();
        }
    }

    showCompleted(comparison) {
        this.setState('completed');
        this.stopPolling();
        
        // Calculate final stats
        const results = comparison.results || {};
        const totalObjects = Object.keys(results).length;
        const totalRecords = Object.values(results).reduce((sum, obj) => sum + (obj.total_records || 0), 0);
        const totalDifferences = Object.values(results).reduce((sum, obj) => sum + (obj.field_differences || 0), 0);
        
        // Calculate duration
        const duration = this.calculateDuration(comparison.startTime, comparison.endTime);
        
        // Update completion stats
        document.getElementById('final-objects').textContent = totalObjects;
        document.getElementById('final-records').textContent = totalRecords.toLocaleString();
        document.getElementById('final-differences').textContent = totalDifferences.toLocaleString();
        document.getElementById('final-duration').textContent = duration;
        
        this.addLogEntry('Comparison completed successfully!', 'success');
    }

    showError(errorMessage) {
        this.setState('error');
        this.stopPolling();
        
        document.getElementById('error-message').textContent = errorMessage;
        this.addLogEntry(`Error: ${errorMessage}`, 'error');
    }

    setState(state) {
        this.currentState = state;
        
        // Hide all containers
        document.querySelectorAll('.status-container').forEach(container => {
            container.classList.add('hidden');
        });
        
        // Show current state
        const stateMap = {
            'loading': 'loading-state',
            'progress': 'progress-state',
            'completed': 'completed-state',
            'error': 'error-state'
        };
        
        const currentContainer = document.getElementById(stateMap[state]);
        if (currentContainer) {
            currentContainer.classList.remove('hidden');
        }
    }

    updateProgressBar(percentage) {
        const progressFill = document.getElementById('main-progress-fill');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
    }

    updateStepIndicators(phase) {
        const steps = document.querySelectorAll('.step');
        steps.forEach(step => step.classList.remove('active', 'completed'));
        
        // Mark completed steps
        document.querySelector('.step').classList.add('completed'); // Configuration always completed
        
        if (phase === 'data_fetch') {
            document.getElementById('step-data-fetch').classList.add('active');
        } else if (phase === 'comparison') {
            document.getElementById('step-data-fetch').classList.add('completed');
            document.getElementById('step-comparison').classList.add('active');
        } else if (phase === 'completed') {
            document.getElementById('step-data-fetch').classList.add('completed');
            document.getElementById('step-comparison').classList.add('completed');
            document.getElementById('step-results').classList.add('active');
        }
    }

    showEngineInfo(engineInfo) {
        const engineContainer = document.getElementById('engine-info');
        const engineName = document.getElementById('engine-name');
        const engineReason = document.getElementById('engine-reason');
        
        const engineDisplayNames = {
            'python': 'Python Engine (High Performance)',
            'nodejs-sqlite': 'Node.js SQLite Engine',
            'file': 'File-based Engine'
        };
        
        engineName.textContent = engineDisplayNames[engineInfo.engine] || engineInfo.engine;
        engineReason.textContent = engineInfo.reason || 'Engine selected automatically';
        
        engineContainer.style.display = 'block';
    }

    showWarnings(warnings) {
        const warningsSection = document.getElementById('warnings-section');
        const warningsList = document.getElementById('warnings-list');
        
        warningsList.innerHTML = '';
        
        warnings.forEach(warning => {
            const warningItem = document.createElement('div');
            warningItem.className = 'warning-item';
            warningItem.innerHTML = `
                <i data-lucide="alert-triangle" class="warning-icon"></i>
                <span class="warning-text">${warning}</span>
            `;
            warningsList.appendChild(warningItem);
        });
        
        warningsSection.style.display = 'block';
        lucide.createIcons({ parent: warningsSection });
    }

    updateObjectList(progress) {
        const objectList = document.getElementById('object-list');
        
        // Simple placeholder for now
        if (progress.currentObject) {
            objectList.innerHTML = `
                <div class="object-item processing">
                    <i data-lucide="database" class="object-icon"></i>
                    <span class="object-name">${progress.currentObject}</span>
                    <span class="object-status">Processing...</span>
                </div>
            `;
            lucide.createIcons({ parent: objectList });
        }
    }

    showComparisonDetails() {
        const detailsContainer = document.getElementById('comparison-details');
        detailsContainer.style.display = 'block';
        
        // Update placeholder values (in real implementation, these would come from status)
        document.getElementById('records-processed').textContent = '---';
        document.getElementById('differences-found').textContent = '---';
        document.getElementById('missing-records').textContent = '---';
    }

    updateElapsedTime() {
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        const elapsedElement = document.getElementById('elapsed-time');
        if (elapsedElement) {
            elapsedElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    calculateDuration(startTime, endTime) {
        if (!startTime || !endTime) return '---';
        
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const duration = end - start;
        
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        
        return `${minutes}m ${seconds}s`;
    }

    toggleLog() {
        const logContainer = document.getElementById('log-container');
        const toggleBtn = document.getElementById('toggle-log-btn');
        const toggleIcon = toggleBtn.querySelector('.toggle-icon');
        const toggleText = toggleBtn.querySelector('span');
        
        const isHidden = logContainer.classList.contains('hidden');
        
        if (isHidden) {
            logContainer.classList.remove('hidden');
            toggleText.textContent = 'Hide Live Log';
            toggleIcon.style.transform = 'rotate(180deg)';
        } else {
            logContainer.classList.add('hidden');
            toggleText.textContent = 'Show Live Log';
            toggleIcon.style.transform = 'rotate(0deg)';
        }
    }

    addLogEntry(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message,
            type
        };
        
        this.logEntries.push(logEntry);
        
        // Limit log entries to prevent memory issues
        if (this.logEntries.length > 100) {
            this.logEntries = this.logEntries.slice(-50);
        }
        
        this.updateLogDisplay();
    }

    updateLogDisplay() {
        const logContent = document.getElementById('log-content');
        
        // Only update if log is visible
        if (logContent.parentElement.classList.contains('hidden')) return;
        
        const logHtml = this.logEntries.map(entry => `
            <div class="log-entry log-${entry.type}">
                <span class="log-timestamp">${entry.timestamp}</span>
                <span class="log-message">${entry.message}</span>
            </div>
        `).join('');
        
        logContent.innerHTML = logHtml;
        
        // Auto-scroll to bottom
        logContent.scrollTop = logContent.scrollHeight;
    }

    clearLog() {
        this.logEntries = [];
        this.updateLogDisplay();
    }

    async retryComparison() {
        // Reload the page to restart the process
        window.location.reload();
    }

    async viewResults() {
        window.location.href = `/apps/data-comparison/results?comparisonId=${this.comparisonId}`;
    }

    async downloadResults() {
        try {
            const response = await fetch(`/api/data-comparison/comparison/${this.comparisonId}/download`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `comparison-results-${this.comparisonId}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                throw new Error('Download failed');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.addLogEntry(`Download failed: ${error.message}`, 'error');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ComparisonStatusTracker();
});