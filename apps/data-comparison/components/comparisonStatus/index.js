// Comparison Status Component
console.log('[ComparisonStatus] Component loaded');

class ComparisonStatusManager {
    constructor() {
        this.comparisonId = null;
        this.updateInterval = null;
        this.startTime = null;
        this.logToShell = window.logToShell || console.log;
        this.changeState = window.changeState || (() => {});
        
        this.init();
    }

    init() {
        this.logToShell('info', 'Comparison Status component initialized');
        
        // Get comparison ID from URL params or local storage
        this.comparisonId = this.getComparisonId();
        
        if (this.comparisonId) {
            this.updateComparisonId(this.comparisonId);
            this.startStatusPolling();
        } else {
            this.showError('No comparison ID found. Please start a new comparison.');
        }

        this.setupEventListeners();
    }

    getComparisonId() {
        // Try to get from URL params first
        const urlParams = new URLSearchParams(window.location.search);
        let comparisonId = urlParams.get('comparisonId');
        
        // If not in URL, try localStorage
        if (!comparisonId) {
            comparisonId = localStorage.getItem('currentComparisonId');
        }
        
        return comparisonId;
    }

    setupEventListeners() {
        const refreshBtn = document.getElementById('refresh-btn');
        const downloadBtn = document.getElementById('download-btn');
        const newComparisonBtn = document.getElementById('new-comparison-btn');

        refreshBtn?.addEventListener('click', () => {
            this.refreshStatus();
        });

        downloadBtn?.addEventListener('click', () => {
            this.downloadResults();
        });

        newComparisonBtn?.addEventListener('click', () => {
            this.startNewComparison();
        });
    }

    async refreshStatus() {
        if (!this.comparisonId) return;
        
        try {
            const response = await fetch(`/data-comparison/api/comparison/status/${this.comparisonId}`);
            const data = await response.json();
            
            if (data.success) {
                this.updateUI(data.comparison);
            } else {
                this.showError(`Failed to fetch status: ${data.error}`);
            }
        } catch (error) {
            this.logToShell('error', `Status refresh failed: ${error.message}`);
            this.showError(`Failed to refresh status: ${error.message}`);
        }
    }

    startStatusPolling() {
        this.refreshStatus();
        
        // Poll every 2 seconds while running
        this.updateInterval = setInterval(() => {
            this.refreshStatus();
        }, 2000);
    }

    stopStatusPolling() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    updateUI(comparison) {
        // Update status badge
        const statusBadge = document.getElementById('status-badge');
        if (statusBadge) {
            statusBadge.textContent = comparison.status;
            statusBadge.className = `status-badge ${comparison.status}`;
        }

        // Update progress
        this.updateProgress(comparison);

        // Update phases
        this.updatePhases(comparison.progress?.phase);

        // Update details
        this.updateDetails(comparison);

        // Add log entry
        this.addLogEntry(`Status: ${comparison.status} - ${comparison.progress?.phase || 'Unknown phase'}`);

        // Handle completion
        if (comparison.status === 'completed') {
            this.stopStatusPolling();
            this.enableDownload();
            this.addLogEntry('✅ Comparison completed successfully!');
        } else if (comparison.status === 'failed') {
            this.stopStatusPolling();
            this.showError(comparison.error);
        }
    }

    updateProgress(comparison) {
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-fill');
        
        let progress = 0;
        let text = 'Starting...';

        switch (comparison.status) {
            case 'initializing':
                progress = 5;
                text = 'Initializing...';
                break;
            case 'running':
                switch (comparison.progress?.phase) {
                    case 'data_fetch':
                        progress = 25;
                        text = 'Fetching data from orgs...';
                        break;
                    case 'data_preparation':
                        progress = 50;
                        text = 'Preparing data for comparison...';
                        break;
                    case 'comparison':
                        progress = 75;
                        text = 'Running Python comparison...';
                        break;
                    default:
                        progress = 10;
                        text = 'Processing...';
                }
                break;
            case 'completed':
                progress = 100;
                text = 'Completed successfully!';
                break;
            case 'failed':
                progress = 0;
                text = 'Failed';
                break;
        }

        if (progressText) progressText.textContent = text;
        if (progressFill) progressFill.style.width = `${progress}%`;
    }

    updatePhases(currentPhase) {
        const phases = ['data_fetch', 'data_preparation', 'comparison'];
        
        phases.forEach(phase => {
            const phaseElement = document.getElementById(`phase-${phase.replace('_', '-')}`);
            if (!phaseElement) return;

            const statusElement = phaseElement.querySelector('.phase-status');
            
            // Remove all status classes
            phaseElement.classList.remove('active', 'completed', 'failed');
            
            if (phase === currentPhase) {
                phaseElement.classList.add('active');
                statusElement.textContent = 'In Progress';
            } else if (phases.indexOf(phase) < phases.indexOf(currentPhase)) {
                phaseElement.classList.add('completed');
                statusElement.textContent = 'Completed';
            } else {
                statusElement.textContent = 'Pending';
            }
        });
    }

    updateDetails(comparison) {
        const comparisonIdEl = document.getElementById('comparison-id');
        const startTimeEl = document.getElementById('start-time');
        const engineUsedEl = document.getElementById('engine-used');
        const durationEl = document.getElementById('duration');

        if (comparisonIdEl) comparisonIdEl.textContent = comparison.id || '-';
        if (engineUsedEl) engineUsedEl.textContent = comparison.engineUsed || 'Python';
        
        if (startTimeEl && comparison.startTime) {
            const startDate = new Date(comparison.startTime);
            startTimeEl.textContent = startDate.toLocaleString();
            this.startTime = startDate;
        }

        if (durationEl) {
            if (comparison.endTime && comparison.startTime) {
                const duration = new Date(comparison.endTime) - new Date(comparison.startTime);
                durationEl.textContent = this.formatDuration(duration);
            } else if (this.startTime) {
                const duration = Date.now() - this.startTime.getTime();
                durationEl.textContent = this.formatDuration(duration);
            }
        }
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    addLogEntry(message) {
        const logsContainer = document.getElementById('status-logs');
        if (!logsContainer) return;

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const timestamp = new Date().toLocaleTimeString();
        logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
        
        logsContainer.appendChild(logEntry);
        
        // Scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;
        
        // Keep only last 10 entries
        const entries = logsContainer.querySelectorAll('.log-entry');
        if (entries.length > 10) {
            entries[0].remove();
        }
    }

    updateComparisonId(comparisonId) {
        this.comparisonId = comparisonId;
        localStorage.setItem('currentComparisonId', comparisonId);
        
        const comparisonIdEl = document.getElementById('comparison-id');
        if (comparisonIdEl) {
            comparisonIdEl.textContent = comparisonId;
        }
    }

    enableDownload() {
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download Results';
        }
    }

    async downloadResults() {
        if (!this.comparisonId) return;
        
        try {
            this.logToShell('info', 'Downloading comparison results...');
            
            const response = await fetch(`/data-comparison/api/comparison/${this.comparisonId}/download`);
            
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
                
                this.logToShell('info', 'Results downloaded successfully');
                this.addLogEntry('📁 Results downloaded successfully');
            } else {
                const errorData = await response.json();
                this.showError(`Download failed: ${errorData.error}`);
            }
        } catch (error) {
            this.logToShell('error', `Download failed: ${error.message}`);
            this.showError(`Download failed: ${error.message}`);
        }
    }

    startNewComparison() {
        this.logToShell('info', 'Starting new comparison...');
        
        // Clear current comparison data
        localStorage.removeItem('currentComparisonId');
        this.stopStatusPolling();
        
        // Navigate to welcome screen
        this.changeState('welcome');
    }

    showError(message) {
        const errorSection = document.getElementById('error-section');
        const errorMessage = document.getElementById('error-message');
        
        if (errorSection && errorMessage) {
            errorMessage.textContent = message;
            errorSection.style.display = 'block';
        }
        
        this.logToShell('error', message);
        this.addLogEntry(`❌ Error: ${message}`);
    }

    destroy() {
        this.stopStatusPolling();
        this.logToShell('info', 'Comparison Status component destroyed');
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

// Cleanup on beforeunload
window.addEventListener('beforeunload', () => {
    if (window.comparisonStatusManager) {
        window.comparisonStatusManager.destroy();
    }
});