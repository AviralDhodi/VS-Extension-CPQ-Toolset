// Permissions Viewer Component - V3 Pattern

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const extractionId = urlParams.get('extractionId');
const configId = urlParams.get('configId');

let currentResults = null;

// Utility functions
function showToast(message, variant = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast_${Date.now()}`;
    
    const toastHTML = `
        <div id="${toastId}" class="slds-notify slds-notify_toast slds-theme_${variant}" role="status">
            <span class="slds-assistive-text">${variant}</span>
            <span class="slds-icon_container slds-icon-utility-${variant === 'success' ? 'success' : 'error'} slds-m-right_small">
                <svg class="slds-icon slds-icon_small">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#${variant === 'success' ? 'success' : 'error'}"></use>
                </svg>
            </span>
            <div class="slds-notify__content">
                <h2 class="slds-text-heading_small">${message}</h2>
            </div>
            <div class="slds-notify__close">
                <button class="slds-button slds-button_icon slds-button_icon-inverse" onclick="closeToast('${toastId}')">
                    <svg class="slds-button__icon slds-button__icon_large">
                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#close"></use>
                    </svg>
                    <span class="slds-assistive-text">Close</span>
                </button>
            </div>
        </div>
    `;
    
    toastContainer.innerHTML = toastHTML;
    setTimeout(() => closeToast(toastId), 5000);
}

function closeToast(toastId) {
    const toast = document.getElementById(toastId);
    if (toast) toast.remove();
}

function showLoader(show = true) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
    }
}

// Status checking
async function checkExtractionStatus() {
    const currentExtractionId = extractionId || window.extractionId;
    if (!currentExtractionId) {
        showToast('No extraction ID provided', 'error');
        return;
    }

    try {
        const response = await fetch(`/permissions-analyser/api/extraction/status/${currentExtractionId}`);
        const result = await response.json();

        if (result.success) {
            updateStatusDisplay(result.status);

            if (result.status.status === 'completed') {
                // Start comparison automatically
                startComparison();
            } else if (result.status.status === 'failed') {
                showToast('Extraction failed: ' + (result.status.error || 'Unknown error'), 'error');
            } else {
                // Check again in 5 seconds
                setTimeout(checkExtractionStatus, 5000);
            }
        } else {
            showToast('Failed to get extraction status', 'error');
        }
    } catch (error) {
        console.error('Error checking status:', error);
        showToast('Error checking extraction status', 'error');
    }
}

function updateStatusDisplay(status) {
    const statusContent = document.getElementById('statusContent');
    
    let statusHTML = `
        <div class="status-item">
            <span class="status-label">Status:</span>
            <span class="status-value">
                <span class="slds-badge ${getStatusBadgeClass(status.status)}">${status.status}</span>
            </span>
        </div>
    `;

    if (status.startTime) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">Started:</span>
                <span class="status-value">${new Date(status.startTime).toLocaleString()}</span>
            </div>
        `;
    }

    if (status.progress) {
        statusHTML += `
            <div class="status-item">
                <span class="status-label">Progress:</span>
                <span class="status-value">
                    <div class="slds-progress-bar">
                        <span class="slds-progress-bar__value" style="width: ${status.progress.progress}%">
                            <span class="slds-assistive-text">Progress: ${status.progress.progress}%</span>
                        </span>
                    </div>
                    <p class="slds-text-body_small slds-m-top_x-small">${status.progress.message}</p>
                </span>
            </div>
        `;
    }

    statusContent.innerHTML = statusHTML;
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'completed':
            return 'slds-theme_success';
        case 'failed':
            return 'slds-theme_error';
        case 'in_progress':
        case 'initializing':
            return 'slds-theme_info';
        default:
            return '';
    }
}

// Start comparison
async function startComparison() {
    showLoader(true);
    
    try {
        const currentExtractionId = extractionId || window.extractionId;
        const response = await fetch('/permissions-analyser/api/comparison/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ extractionId: currentExtractionId, configId })
        });

        const result = await response.json();

        if (result.success) {
            showToast('Comparison completed successfully');
            // Load results
            loadComparisonResults(result.comparisonId);
        } else {
            throw new Error(result.error || 'Comparison failed');
        }
    } catch (error) {
        console.error('Error starting comparison:', error);
        showToast('Failed to start comparison', 'error');
    } finally {
        showLoader(false);
    }
}

// Load comparison results
async function loadComparisonResults(comparisonId) {
    showLoader(true);
    
    try {
        const response = await fetch(`/permissions-analyser/api/comparison/${comparisonId}/results`);
        const result = await response.json();

        if (result.success) {
            currentResults = result.results;
            displayResults();
            document.getElementById('resultsSection').style.display = 'block';
        } else {
            throw new Error(result.error || 'Failed to load results');
        }
    } catch (error) {
        console.error('Error loading results:', error);
        showToast('Failed to load comparison results', 'error');
    } finally {
        showLoader(false);
    }
}

// Display results
function displayResults() {
    if (!currentResults || !currentResults.details) return;

    // Display profile results
    displayProfileResults();
    
    // Display permission set results
    displayPermissionSetResults();
    
    // Display object permission results
    displayObjectPermissionResults();
}

function displayProfileResults() {
    const profilesContent = document.getElementById('profilesContent');
    const profiles = currentResults.details.profiles;
    
    if (!profiles) {
        profilesContent.innerHTML = '<p class="slds-text-body_regular">No profile data available</p>';
        return;
    }

    let html = `
        <div class="slds-box slds-m-bottom_medium">
            <h3 class="slds-text-heading_small slds-m-bottom_small">Summary</h3>
            <ul class="slds-list_dotted">
                <li>Total Profiles: ${profiles.all_profiles ? profiles.all_profiles.size : 0}</li>
                <li>Common Profiles: ${profiles.common_profiles ? profiles.common_profiles.size : 0}</li>
                <li>Profiles with Differences: ${Object.keys(profiles.profile_differences || {}).length}</li>
            </ul>
        </div>
    `;

    // Show profile differences
    if (profiles.profile_differences && Object.keys(profiles.profile_differences).length > 0) {
        html += '<h3 class="slds-text-heading_small slds-m-bottom_medium">Profile Differences</h3>';
        
        for (const [profileName, differences] of Object.entries(profiles.profile_differences)) {
            html += `
                <div class="slds-box slds-m-bottom_medium">
                    <h4 class="slds-text-heading_small">${profileName}</h4>
                    ${renderPermissionDifferences(differences)}
                </div>
            `;
        }
    }

    profilesContent.innerHTML = html;
}

function displayPermissionSetResults() {
    const permsetsContent = document.getElementById('permsetsContent');
    const permSets = currentResults.details.permission_sets;
    
    if (!permSets) {
        permsetsContent.innerHTML = '<p class="slds-text-body_regular">No permission set data available</p>';
        return;
    }

    let html = `
        <div class="slds-box slds-m-bottom_medium">
            <h3 class="slds-text-heading_small slds-m-bottom_small">Summary</h3>
            <ul class="slds-list_dotted">
                <li>Total Permission Sets: ${permSets.all_permission_sets ? permSets.all_permission_sets.size : 0}</li>
                <li>Common Permission Sets: ${permSets.common_permission_sets ? permSets.common_permission_sets.size : 0}</li>
            </ul>
        </div>
    `;

    permsetsContent.innerHTML = html;
}

function displayObjectPermissionResults() {
    const objectsContent = document.getElementById('objectsContent');
    
    // Placeholder for object permissions
    objectsContent.innerHTML = `
        <div class="slds-box">
            <p class="slds-text-body_regular">Object permission analysis will be displayed here</p>
        </div>
    `;
}

function renderPermissionDifferences(differences) {
    let html = '';
    
    // Object permissions
    if (differences.object_permissions && Object.keys(differences.object_permissions).length > 0) {
        html += '<h5 class="slds-text-title_caps slds-m-top_medium slds-m-bottom_small">Object Permissions</h5>';
        html += '<div class="permission-matrix"><table class="slds-table slds-table_bordered slds-table_fixed-layout">';
        html += '<thead><tr><th>Object</th>';
        
        // Get org names
        const firstObj = Object.values(differences.object_permissions)[0];
        const orgs = Object.keys(firstObj);
        orgs.forEach(org => {
            html += `<th>${org}</th>`;
        });
        html += '</tr></thead><tbody>';
        
        // Render each object
        for (const [objName, orgPerms] of Object.entries(differences.object_permissions)) {
            html += `<tr><td>${objName}</td>`;
            orgs.forEach(org => {
                const perms = orgPerms[org];
                html += '<td>';
                html += renderPermissionIcons(perms);
                html += '</td>';
            });
            html += '</tr>';
        }
        
        html += '</tbody></table></div>';
    }
    
    return html;
}

function renderPermissionIcons(perms) {
    const icons = [];
    
    if (perms.read) icons.push('<span class="permission-icon permission-granted" title="Read">R</span>');
    else icons.push('<span class="permission-icon permission-denied" title="No Read">-</span>');
    
    if (perms.create) icons.push('<span class="permission-icon permission-granted" title="Create">C</span>');
    else icons.push('<span class="permission-icon permission-denied" title="No Create">-</span>');
    
    if (perms.edit) icons.push('<span class="permission-icon permission-granted" title="Edit">E</span>');
    else icons.push('<span class="permission-icon permission-denied" title="No Edit">-</span>');
    
    if (perms.delete) icons.push('<span class="permission-icon permission-granted" title="Delete">D</span>');
    else icons.push('<span class="permission-icon permission-denied" title="No Delete">-</span>');
    
    return icons.join(' ');
}

// Download results
function downloadResults() {
    if (!currentResults || !currentResults.comparison_id) {
        showToast('No results to download', 'error');
        return;
    }

    // Use the download endpoint to get Excel file
    const downloadUrl = `/permissions-analyser/api/comparison/${currentResults.comparison_id}/download`;
    
    // Create a temporary link and click it
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `permissions-comparison-${currentResults.comparison_id}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast('Download started...', 'success');
}

// Start extraction from config ID
async function startExtractionFromConfig(configId) {
    try {
        // Load the config
        const configResponse = await fetch(`/permissions-analyser/api/config/${configId}`);
        const configData = await configResponse.json();
        
        if (!configData.success) {
            throw new Error(configData.error || 'Failed to load configuration');
        }
        
        // Start extraction with the config
        const extractionResponse = await fetch('/permissions-analyser/api/extraction/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orgs: configData.config.orgs,
                metadata: configData.config.permissions,
                permissionTypes: configData.config.permissionTypes,
                config: configData.config
            })
        });
        
        const extractionResult = await extractionResponse.json();
        
        if (extractionResult.success) {
            showToast('Extraction started successfully');
            // Update URL with extraction ID
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('extractionId', extractionResult.extractionId);
            newUrl.searchParams.delete('configId');
            window.history.replaceState({}, '', newUrl);
            
            // Store extraction ID
            window.extractionId = extractionResult.extractionId;
            
            // Start checking status
            checkExtractionStatus();
        } else {
            throw new Error(extractionResult.error || 'Failed to start extraction');
        }
        
    } catch (error) {
        console.error('Error starting extraction from config:', error);
        showToast('Failed to start extraction: ' + error.message, 'error');
    }
}

// Tab switching with SLDS 2.0 accessibility
function setupTabs() {
    const tabs = document.querySelectorAll('.slds-tabs_card__link');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const clickedTab = e.target.closest('.slds-tabs_card__link');
            
            // Update all tabs
            document.querySelectorAll('.slds-tabs_card__link').forEach(link => {
                const item = link.closest('.slds-tabs_card__item');
                const isActive = link === clickedTab;
                
                // Update tab item
                item.classList.toggle('slds-is-active', isActive);
                
                // Update ARIA attributes
                link.setAttribute('aria-selected', isActive ? 'true' : 'false');
                link.setAttribute('tabindex', isActive ? '0' : '-1');
            });
            
            // Update content panels
            document.querySelectorAll('.slds-tabs_card__content-item').forEach(content => {
                const tabId = clickedTab.getAttribute('data-tab');
                const isVisible = content.id === `tab-${tabId}`;
                
                // Use slds-show and slds-hide classes
                content.classList.toggle('slds-show', isVisible);
                content.classList.toggle('slds-hide', !isVisible);
            });
        });
        
        // Keyboard navigation
        tab.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                const allTabs = Array.from(document.querySelectorAll('.slds-tabs_card__link'));
                const currentIndex = allTabs.indexOf(e.target);
                let newIndex;
                
                if (e.key === 'ArrowLeft') {
                    newIndex = currentIndex > 0 ? currentIndex - 1 : allTabs.length - 1;
                } else {
                    newIndex = currentIndex < allTabs.length - 1 ? currentIndex + 1 : 0;
                }
                
                allTabs[newIndex].focus();
                allTabs[newIndex].click();
            }
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupTabs();
    
    // Download button
    document.getElementById('downloadResultsBtn').addEventListener('click', downloadResults);
    
    // Start checking extraction status
    if (extractionId) {
        checkExtractionStatus();
    } else if (configId) {
        // If we have a config ID but no extraction ID, start extraction
        showToast('Configuration loaded. Starting extraction...', 'info');
        startExtractionFromConfig(configId);
    } else {
        showToast('No extraction or configuration ID provided', 'error');
    }
});

// Make closeToast available globally
window.closeToast = closeToast;