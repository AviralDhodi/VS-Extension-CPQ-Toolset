// Report Generator Component
console.log('[ReportGenerator] Component loaded');

class ReportGenerator {
    constructor() {
        this.comparisonId = null;
        this.comparisonData = null;
        this.reportConfig = {
            type: 'comprehensive',
            sections: ['all'] // Always generate full report
        };
        
        this.init();
    }

    init() {
        // Get comparison ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.comparisonId = urlParams.get('comparisonId');
        
        if (!this.comparisonId) {
            this.showError('No comparison ID provided');
            return;
        }
        
        this.setupEventListeners();
        this.loadComparisonData();
        this.loadRecentReports();
    }

    setupEventListeners() {
        // Generate button
        document.getElementById('generate-report-btn')?.addEventListener('click', () => {
            this.generateReport();
        });
    }


    async loadComparisonData() {
        try {
            const response = await fetch(`/data-comparison/api/comparison/${this.comparisonId}/summary`);
            if (!response.ok) throw new Error('Failed to load comparison data');
            
            this.comparisonData = await response.json();
            this.updatePreview();
        } catch (error) {
            console.error('Failed to load comparison data:', error);
            this.showError('Failed to load comparison data');
        }
    }

    updatePreview() {
        const preview = document.getElementById('report-preview');
        const pagesEl = document.getElementById('estimated-pages');
        const sizeEl = document.getElementById('estimated-size');
        
        if (!this.comparisonData) {
            preview.innerHTML = `
                <div class="slds-text-align_center slds-p-around_medium">
                    <div class="slds-spinner_container">
                        <div role="status" class="slds-spinner slds-spinner_small">
                            <span class="slds-assistive-text">Loading</span>
                            <div class="slds-spinner__dot-a"></div>
                            <div class="slds-spinner__dot-b"></div>
                        </div>
                    </div>
                </div>
            `;
            return;
        }
        
        // Build preview content
        let previewHtml = '<div class="slds-p-around_small">';
        
        // Title
        previewHtml += `
            <h3 class="slds-text-heading_small slds-m-bottom_small">
                ${this.getReportTitle()}
            </h3>
        `;
        
        // Sections outline
        previewHtml += '<div class="slds-text-body_small">';
        previewHtml += '<p class="slds-m-bottom_x-small"><strong>Sections:</strong></p>';
        previewHtml += '<ul class="slds-list_dotted">';
        
        if (this.reportConfig.sections.includes('summary')) {
            previewHtml += '<li>Summary</li>';
        }
        if (this.reportConfig.sections.includes('graphs')) {
            previewHtml += '<li>Graphs & Charts</li>';
        }
        if (this.reportConfig.sections.includes('details')) {
            previewHtml += '<li>Details</li>';
        }
        if (this.reportConfig.sections.includes('recommendations')) {
            previewHtml += '<li>Recommendations</li>';
        }
        
        previewHtml += '</ul>';
        previewHtml += '</div>';
        previewHtml += '</div>';
        
        preview.innerHTML = previewHtml;
        
        // Update estimates
        const basePages = 2; // Cover + TOC
        let contentPages = 0;
        
        if (this.reportConfig.sections.includes('summary')) contentPages += 1;
        if (this.reportConfig.sections.includes('graphs')) contentPages += 2;
        if (this.reportConfig.sections.includes('details')) contentPages += Math.ceil((this.comparisonData.objectCount || 5) / 3);
        if (this.reportConfig.sections.includes('recommendations')) contentPages += 1;
        
        const totalPages = basePages + contentPages;
        pagesEl.textContent = `~${totalPages} pages`;
        
        // Estimate size (rough estimate: 100KB per page)
        const estimatedSize = totalPages * 100;
        sizeEl.textContent = this.formatFileSize(estimatedSize * 1024);
    }

    getReportTitle() {
        const titles = {
            executive: 'Executive Comparison Report',
            detailed: 'Detailed Analysis Report',
            technical: 'Technical Comparison Report'
        };
        return titles[this.reportConfig.type] || 'Comparison Report';
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    async generateReport() {
        const btn = document.getElementById('generate-report-btn');
        const originalContent = btn.innerHTML;
        
        try {
            // Show loading state
            btn.disabled = true;
            btn.innerHTML = `
                <div class="slds-spinner_container" style="position: relative; height: 1rem;">
                    <div role="status" class="slds-spinner slds-spinner_x-small slds-spinner_inverse">
                        <span class="slds-assistive-text">Generating report...</span>
                        <div class="slds-spinner__dot-a"></div>
                        <div class="slds-spinner__dot-b"></div>
                    </div>
                </div>
                Generating...
            `;
            
            // Generate report
            const response = await fetch('/data-comparison/api/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comparisonId: this.comparisonId,
                    config: this.reportConfig
                })
            });
            
            if (!response.ok) throw new Error('Failed to generate report');
            
            // Download the PDF
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `comparison-report-${this.comparisonId}-${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // Refresh recent reports
            this.loadRecentReports();
            
            // Show success
            this.showSuccess('Report generated successfully!');
            
        } catch (error) {
            console.error('Failed to generate report:', error);
            this.showError('Failed to generate report: ' + error.message);
        } finally {
            // Restore button
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }

    async loadRecentReports() {
        try {
            const response = await fetch(`/data-comparison/api/recent-reports?comparisonId=${this.comparisonId}`);
            if (!response.ok) return;
            
            const reports = await response.json();
            this.renderRecentReports(reports);
        } catch (error) {
            console.error('Failed to load recent reports:', error);
        }
    }

    renderRecentReports(reports) {
        const tbody = document.getElementById('recent-reports-list');
        if (!tbody) return;
        
        if (reports.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="slds-text-align_center slds-text-color_weak">
                        <div class="slds-p-vertical_large">
                            <svg class="slds-icon slds-icon_large slds-icon-text-default slds-m-bottom_small" aria-hidden="true">
                                <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#file"></use>
                            </svg>
                            <p>No previous reports found</p>
                            <p class="slds-text-body_small">Generate a new report using the options above</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = reports.map(report => `
            <tr>
                <td data-label="Report Name">
                    <div class="slds-truncate">${report.name}</div>
                </td>
                <td data-label="Type">
                    <div class="slds-truncate">${report.type}</div>
                </td>
                <td data-label="Generated">
                    <div class="slds-truncate">${new Date(report.created).toLocaleString()}</div>
                </td>
                <td data-label="Size">
                    <div class="slds-truncate">${this.formatFileSize(report.size)}</div>
                </td>
                <td data-label="Actions">
                    <div class="slds-button-group">
                        <button class="slds-button slds-button_icon slds-button_icon-border-filled" 
                                onclick="window.reportGenerator.downloadReport('${report.id}')"
                                title="Download">
                            <svg class="slds-button__icon" aria-hidden="true">
                                <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#download"></use>
                            </svg>
                            <span class="slds-assistive-text">Download</span>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async downloadReport(reportId) {
        try {
            const response = await fetch(`/data-comparison/api/download-report/${reportId}`);
            if (!response.ok) throw new Error('Failed to download report');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report-${reportId}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download report:', error);
            this.showError('Failed to download report');
        }
    }

    showSuccess(message) {
        // Could integrate with a toast notification system
        console.log('Success:', message);
    }

    showError(message) {
        // Could integrate with a toast notification system
        console.error('Error:', message);
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.reportGenerator = new ReportGenerator();
    });
} else {
    window.reportGenerator = new ReportGenerator();
}