// Permissions Config Generator Component - V3 Pattern

// Current configuration state
const configState = {
    orgs: [],
    selectedOrgs: [],
    metadata: {
        profiles: [],
        permissionSets: [],
        mutingPermissionSets: [],
        permissionSetGroups: []
    },
    selectedMetadata: {
        profiles: [],
        permissionSets: [],
        mutingPermissionSets: [],
        permissionSetGroups: []
    },
    permissionTypes: {
        objectPermissions: true,
        fieldPermissions: true,
        systemPermissions: true,
        userPermissions: true,
        setupEntityAccess: true,
        appPermissions: true,
        apexClassAccess: false,
        vfPageAccess: false,
        customPermissions: false,
        tabVisibility: false,
        recordTypeAssignments: false,
        layoutAssignments: false
    },
    currentStep: 'orgs'
};

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

function updatePath(step) {
    const steps = ['orgs', 'metadata', 'permissions', 'finalize'];
    const stepIndex = steps.indexOf(step);
    
    // Update path items
    document.querySelectorAll('.slds-path__item').forEach((item, index) => {
        item.classList.remove('slds-is-current', 'slds-is-active', 'slds-is-complete');
        if (index < stepIndex) {
            item.classList.add('slds-is-complete');
        } else if (index === stepIndex) {
            item.classList.add('slds-is-current', 'slds-is-active');
        } else {
            item.classList.add('slds-is-incomplete');
        }
    });
    
    // Show/hide step content
    document.querySelectorAll('.step-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`step-${step}`).style.display = 'block';
    
    configState.currentStep = step;
}

// Step 1: Organizations
async function loadOrganizations() {
    showLoader(true);
    
    try {
        const response = await fetch('/permissions-analyser/api/orgs');
        const result = await response.json();
        
        if (result.success && result.orgs.length > 0) {
            configState.orgs = result.orgs;
            renderOrganizations();
            document.getElementById('validateOrgsBtn').disabled = false;
        } else {
            showToast('No authenticated organizations found', 'error');
        }
    } catch (error) {
        console.error('Error loading orgs:', error);
        showToast('Failed to load organizations', 'error');
    } finally {
        showLoader(false);
    }
}

function renderOrganizations() {
    const orgsList = document.getElementById('orgsList');
    
    if (configState.orgs.length === 0) {
        orgsList.innerHTML = `
            <div class="slds-illustration slds-illustration_small">
                <svg class="slds-illustration__svg" viewBox="0 0 468 194" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/illustrations.svg#empty"></use>
                </svg>
                <div class="slds-text-longform">
                    <h3 class="slds-text-heading_medium">No Organizations Found</h3>
                    <p class="slds-text-body_regular">Please authenticate with Salesforce CLI first.</p>
                </div>
            </div>`;
        return;
    }
    
    // SLDS Data Table Pattern
    const tableHTML = `
        <table class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_col-bordered">
            <thead>
                <tr class="slds-line-height_reset">
                    <th class="slds-text-title_caps" scope="col" style="width: 3.25rem;">
                        <div class="slds-th__action slds-th__action_form">
                            <div class="slds-checkbox">
                                <input type="checkbox" name="select-all" id="select-all-orgs" />
                                <label class="slds-checkbox__label" for="select-all-orgs">
                                    <span class="slds-checkbox_faux"></span>
                                    <span class="slds-form-element__label slds-assistive-text">Select All</span>
                                </label>
                            </div>
                        </div>
                    </th>
                    <th aria-label="Alias" aria-sort="none" class="slds-is-resizable slds-is-sortable" scope="col">
                        <a class="slds-th__action slds-text-link_reset" href="javascript:void(0);" role="button" tabindex="-1">
                            <span class="slds-assistive-text">Sort by: </span>
                            <div class="slds-grid slds-grid_vertical-align-center slds-has-flexi-truncate">
                                <span class="slds-truncate" title="Alias">Alias</span>
                            </div>
                        </a>
                    </th>
                    <th aria-label="Username" aria-sort="none" class="slds-is-resizable slds-is-sortable" scope="col">
                        <a class="slds-th__action slds-text-link_reset" href="javascript:void(0);" role="button" tabindex="-1">
                            <span class="slds-assistive-text">Sort by: </span>
                            <div class="slds-grid slds-grid_vertical-align-center slds-has-flexi-truncate">
                                <span class="slds-truncate" title="Username">Username</span>
                            </div>
                        </a>
                    </th>
                    <th aria-label="Instance URL" aria-sort="none" class="slds-is-resizable" scope="col">
                        <div class="slds-truncate" title="Instance URL">Instance URL</div>
                    </th>
                    <th aria-label="Status" aria-sort="none" class="slds-is-resizable" scope="col">
                        <div class="slds-truncate" title="Status">Status</div>
                    </th>
                </tr>
            </thead>
            <tbody>
                ${configState.orgs.map(org => `
                    <tr class="slds-hint-parent">
                        <td class="slds-text-align_right" role="gridcell">
                            <div class="slds-checkbox">
                                <input type="checkbox" name="options" id="org_${org.alias.replace(/[^a-zA-Z0-9]/g, '_')}" 
                                       value="${org.username}" class="org-checkbox" />
                                <label class="slds-checkbox__label" for="org_${org.alias.replace(/[^a-zA-Z0-9]/g, '_')}">
                                    <span class="slds-checkbox_faux"></span>
                                    <span class="slds-form-element__label slds-assistive-text">Select ${org.alias}</span>
                                </label>
                            </div>
                        </td>
                        <th scope="row">
                            <div class="slds-truncate" title="${org.alias}">
                                <a href="javascript:void(0);" tabindex="-1">${org.alias}</a>
                                ${org.isDefaultUsername ? '<span class="slds-badge slds-m-left_x-small">Default</span>' : ''}
                            </div>
                        </th>
                        <td role="gridcell">
                            <div class="slds-truncate" title="${org.username}">${org.username}</div>
                        </td>
                        <td role="gridcell">
                            <div class="slds-truncate" title="${org.instanceUrl}">${org.instanceUrl}</div>
                        </td>
                        <td role="gridcell">
                            <span class="slds-badge ${org.status === 'Active' ? 'slds-badge_success' : ''}">${org.status}</span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    orgsList.innerHTML = tableHTML;
    
    // Add event listeners
    document.querySelectorAll('.org-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedOrgs);
    });
    
    // Select all functionality
    document.getElementById('select-all-orgs')?.addEventListener('change', (e) => {
        document.querySelectorAll('.org-checkbox').forEach(cb => cb.checked = e.target.checked);
        updateSelectedOrgs();
    });
}

function updateSelectedOrgs() {
    configState.selectedOrgs = Array.from(document.querySelectorAll('.org-checkbox:checked'))
        .map(cb => cb.value);
    
    const validateBtn = document.getElementById('validateOrgsBtn');
    validateBtn.disabled = configState.selectedOrgs.length < 2;
}

async function validateOrganizations() {
    if (configState.selectedOrgs.length < 2) {
        showToast('Please select at least 2 organizations', 'error');
        return;
    }
    
    showLoader(true);
    
    try {
        const response = await fetch('/permissions-analyser/api/orgs/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgs: configState.selectedOrgs })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Store metadata info
            extractCommonMetadata(result.validOrgs);
            updatePath('metadata');
            loadMetadata();
        } else {
            showToast(result.error || 'Organization validation failed', 'error');
        }
    } catch (error) {
        console.error('Error validating orgs:', error);
        showToast('Failed to validate organizations', 'error');
    } finally {
        showLoader(false);
    }
}

function extractCommonMetadata(validOrgs) {
    // Extract profiles
    const profileSets = validOrgs.map(org => new Set(org.profiles.map(p => p.fullName)));
    if (profileSets.length > 0) {
        configState.metadata.profiles = Array.from(profileSets.reduce((common, set) => {
            if (!common) return set;
            return new Set([...common].filter(p => set.has(p)));
        })).sort();
    }
    
    // Extract permission sets
    const permSetSets = validOrgs.map(org => new Set(org.permissionSets.map(ps => ps.fullName)));
    if (permSetSets.length > 0) {
        configState.metadata.permissionSets = Array.from(permSetSets.reduce((common, set) => {
            if (!common) return set;
            return new Set([...common].filter(ps => set.has(ps)));
        })).sort();
    }
    
    // For now, we'll need to fetch muting permission sets and permission set groups separately
    // These might not be returned by the basic metadata list
    configState.metadata.mutingPermissionSets = [];
    configState.metadata.permissionSetGroups = [];
}

// Step 2: Metadata Selection
function loadMetadata() {
    renderProfiles();
    renderPermissionSets();
    renderMutingPermissionSets();
    renderPermissionSetGroups();
}

function renderProfiles() {
    const profilesList = document.getElementById('profilesList');
    
    if (configState.metadata.profiles.length === 0) {
        profilesList.innerHTML = '<p class="slds-text-body_small slds-text-color_weak">No common profiles found</p>';
        return;
    }
    
    const profilesHTML = configState.metadata.profiles.map(profile => `
        <div class="slds-form-element__control">
            <div class="slds-checkbox">
                <input type="checkbox" id="profile_${profile.replace(/[^a-zA-Z0-9]/g, '_')}" value="${profile}" class="profile-checkbox">
                <label class="slds-checkbox__label" for="profile_${profile.replace(/[^a-zA-Z0-9]/g, '_')}">
                    <span class="slds-checkbox_faux"></span>
                    <span class="slds-form-element__label">${profile}</span>
                </label>
            </div>
        </div>
    `).join('');
    
    profilesList.innerHTML = profilesHTML;
}

function renderPermissionSets() {
    const permSetsList = document.getElementById('permSetsList');
    
    if (configState.metadata.permissionSets.length === 0) {
        permSetsList.innerHTML = '<p class="slds-text-body_small slds-text-color_weak">No common permission sets found</p>';
        return;
    }
    
    const permSetsHTML = configState.metadata.permissionSets.map(permSet => `
        <div class="slds-form-element__control">
            <div class="slds-checkbox">
                <input type="checkbox" id="permset_${permSet.replace(/[^a-zA-Z0-9]/g, '_')}" value="${permSet}" class="permset-checkbox">
                <label class="slds-checkbox__label" for="permset_${permSet.replace(/[^a-zA-Z0-9]/g, '_')}">
                    <span class="slds-checkbox_faux"></span>
                    <span class="slds-form-element__label">${permSet}</span>
                </label>
            </div>
        </div>
    `).join('');
    
    permSetsList.innerHTML = permSetsHTML;
}

function renderMutingPermissionSets() {
    const mutingPermSetsList = document.getElementById('mutingPermSetsList');
    mutingPermSetsList.innerHTML = '<p class="slds-text-body_small slds-text-color_weak">No muting permission sets found in selected orgs</p>';
}

function renderPermissionSetGroups() {
    const permSetGroupsList = document.getElementById('permSetGroupsList');
    permSetGroupsList.innerHTML = '<p class="slds-text-body_small slds-text-color_weak">No permission set groups found in selected orgs</p>';
}

// Select all handlers
function setupSelectAllHandlers() {
    document.getElementById('selectAllProfiles').addEventListener('change', (e) => {
        document.querySelectorAll('.profile-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
    
    document.getElementById('selectAllPermSets').addEventListener('change', (e) => {
        document.querySelectorAll('.permset-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
    
    document.getElementById('selectAllMutingPermSets').addEventListener('change', (e) => {
        document.querySelectorAll('.muting-permset-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
    
    document.getElementById('selectAllPermSetGroups').addEventListener('change', (e) => {
        document.querySelectorAll('.permset-group-checkbox').forEach(cb => cb.checked = e.target.checked);
    });
}

// Collect selected metadata
function collectSelectedMetadata() {
    configState.selectedMetadata.profiles = Array.from(document.querySelectorAll('.profile-checkbox:checked'))
        .map(cb => cb.value);
    
    configState.selectedMetadata.permissionSets = Array.from(document.querySelectorAll('.permset-checkbox:checked'))
        .map(cb => cb.value);
    
    configState.selectedMetadata.mutingPermissionSets = Array.from(document.querySelectorAll('.muting-permset-checkbox:checked'))
        .map(cb => cb.value);
    
    configState.selectedMetadata.permissionSetGroups = Array.from(document.querySelectorAll('.permset-group-checkbox:checked'))
        .map(cb => cb.value);
}

// Step 3: Permission Types
function collectPermissionTypes() {
    Object.keys(configState.permissionTypes).forEach(type => {
        const checkbox = document.getElementById(type);
        if (checkbox) {
            configState.permissionTypes[type] = checkbox.checked;
        }
    });
}

// Step 4: Finalize
function renderSummary() {
    const summaryDiv = document.getElementById('configSummary');
    
    const summaryHTML = `
        <dl class="slds-dl_horizontal">
            <dt class="slds-dl_horizontal__label">
                <span class="slds-text-heading_small">Organizations</span>
            </dt>
            <dd class="slds-dl_horizontal__detail">
                <span class="slds-badge slds-badge_inverse">${configState.selectedOrgs.length} Selected</span>
                <ul class="slds-list_dotted slds-m-top_x-small">
                    ${configState.selectedOrgs.map(org => `<li>${org}</li>`).join('')}
                </ul>
            </dd>
            
            <dt class="slds-dl_horizontal__label">
                <span class="slds-text-heading_small">Metadata</span>
            </dt>
            <dd class="slds-dl_horizontal__detail">
                <div class="slds-grid slds-grid_vertical">
                    ${configState.selectedMetadata.profiles.length > 0 ? `
                        <div class="slds-col">
                            <span class="slds-badge">${configState.selectedMetadata.profiles.length} Profiles</span>
                        </div>` : ''}
                    ${configState.selectedMetadata.permissionSets.length > 0 ? `
                        <div class="slds-col">
                            <span class="slds-badge">${configState.selectedMetadata.permissionSets.length} Permission Sets</span>
                        </div>` : ''}
                    ${configState.selectedMetadata.mutingPermissionSets.length > 0 ? `
                        <div class="slds-col">
                            <span class="slds-badge">${configState.selectedMetadata.mutingPermissionSets.length} Muting Permission Sets</span>
                        </div>` : ''}
                    ${configState.selectedMetadata.permissionSetGroups.length > 0 ? `
                        <div class="slds-col">
                            <span class="slds-badge">${configState.selectedMetadata.permissionSetGroups.length} Permission Set Groups</span>
                        </div>` : ''}
                </div>
            </dd>
            
            <dt class="slds-dl_horizontal__label">
                <span class="slds-text-heading_small">Permission Types</span>
            </dt>
            <dd class="slds-dl_horizontal__detail">
                <div class="slds-grid slds-wrap">
                    ${Object.entries(configState.permissionTypes)
                        .filter(([_, enabled]) => enabled)
                        .map(([type, _]) => `
                            <span class="slds-badge slds-m-right_x-small slds-m-bottom_x-small">
                                ${type.replace(/([A-Z])/g, ' $1').trim()}
                            </span>`)
                        .join('')}
                </div>
            </dd>
        </dl>
    `;
    
    summaryDiv.innerHTML = summaryHTML;
}

// Modal management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    const backdrop = document.getElementById(modalId.replace('Modal', 'Backdrop'));
    if (modal && backdrop) {
        modal.classList.add('slds-fade-in-open');
        backdrop.classList.add('slds-backdrop_open');
        // Focus management
        const firstInput = modal.querySelector('input, textarea, button');
        if (firstInput) firstInput.focus();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const backdrop = document.getElementById(modalId.replace('Modal', 'Backdrop'));
    if (modal && backdrop) {
        modal.classList.remove('slds-fade-in-open');
        backdrop.classList.remove('slds-backdrop_open');
    }
}

// Save configuration
function saveConfiguration() {
    openModal('saveConfigModal');
}

// Confirm save configuration
async function confirmSaveConfiguration() {
    const configName = document.getElementById('configName').value || `permissions-config-${Date.now()}`;
    const configDescription = document.getElementById('configDescription').value;
    
    showLoader(true);
    closeModal('saveConfigModal');
    
    try {
        const config = {
            name: configName,
            description: configDescription,
            version: '3.0.0',
            createdAt: new Date().toISOString(),
            orgs: configState.selectedOrgs,
            metadata: configState.selectedMetadata,
            permissionTypes: configState.permissionTypes
        };
        
        const response = await fetch('/permissions-analyser/api/config/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config: config })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Configuration saved successfully');
            // Download the config file
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${configName}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            showToast('Failed to save configuration', 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showToast('Failed to save configuration', 'error');
    } finally {
        showLoader(false);
        // Clear form
        document.getElementById('configName').value = '';
        document.getElementById('configDescription').value = '';
    }
}

// Start extraction
async function startExtraction() {
    if (configState.selectedMetadata.profiles.length === 0 && 
        configState.selectedMetadata.permissionSets.length === 0 &&
        configState.selectedMetadata.mutingPermissionSets.length === 0 &&
        configState.selectedMetadata.permissionSetGroups.length === 0) {
        showToast('Please select at least one profile or permission set', 'error');
        return;
    }
    
    showLoader(true);
    
    try {
        const response = await fetch('/permissions-analyser/api/extraction/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orgs: configState.selectedOrgs,
                metadata: configState.selectedMetadata,
                permissionTypes: configState.permissionTypes
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Metadata extraction started successfully');
            // Redirect to viewer
            setTimeout(() => {
                window.location.href = `/permissions-analyser/viewer?extractionId=${result.extractionId}`;
            }, 2000);
        } else {
            showToast(result.error || 'Failed to start extraction', 'error');
        }
    } catch (error) {
        console.error('Error starting extraction:', error);
        showToast('Failed to start metadata extraction', 'error');
    } finally {
        showLoader(false);
    }
}

// Navigation handlers
function setupNavigation() {
    // Organization step
    document.getElementById('loadOrgsBtn').addEventListener('click', loadOrganizations);
    document.getElementById('validateOrgsBtn').addEventListener('click', validateOrganizations);
    
    // Metadata step
    document.getElementById('backToOrgsBtn').addEventListener('click', () => updatePath('orgs'));
    document.getElementById('nextToPermTypesBtn').addEventListener('click', () => {
        if (validateStep('metadata')) {
            updatePath('permissions');
        }
    });
    
    // Permission types step
    document.getElementById('backToMetadataBtn').addEventListener('click', () => updatePath('metadata'));
    document.getElementById('nextToFinalizeBtn').addEventListener('click', () => {
        collectPermissionTypes();
        renderSummary();
        updatePath('finalize');
    });
    
    // Finalize step
    document.getElementById('backToPermTypesBtn').addEventListener('click', () => updatePath('permissions'));
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfiguration);
    document.getElementById('startExtractionBtn').addEventListener('click', startExtraction);
}

// Tab switching functionality
function setupTabs() {
    const tabItems = document.querySelectorAll('.slds-tabs_default__link');
    
    tabItems.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active states
            document.querySelectorAll('.slds-tabs_default__item').forEach(item => {
                item.classList.remove('slds-is-active');
            });
            document.querySelectorAll('.slds-tabs_default__link').forEach(link => {
                link.setAttribute('aria-selected', 'false');
                link.setAttribute('tabindex', '-1');
            });
            document.querySelectorAll('.slds-tabs_default__content').forEach(content => {
                content.classList.add('slds-hide');
                content.classList.remove('slds-show');
            });
            
            // Add active states
            const tabItem = e.target.closest('.slds-tabs_default__item');
            const tabLink = e.target.closest('.slds-tabs_default__link');
            const targetId = tabLink.getAttribute('aria-controls');
            
            tabItem.classList.add('slds-is-active');
            tabLink.setAttribute('aria-selected', 'true');
            tabLink.setAttribute('tabindex', '0');
            document.getElementById(targetId).classList.remove('slds-hide');
            document.getElementById(targetId).classList.add('slds-show');
        });
    });
}

// Form validation with SLDS patterns
function validateStep(step) {
    let isValid = true;
    let errors = [];
    
    switch(step) {
        case 'orgs':
            if (configState.selectedOrgs.length < 2) {
                errors.push('Please select at least 2 organizations');
                isValid = false;
            }
            break;
            
        case 'metadata':
            collectSelectedMetadata();
            if (configState.selectedMetadata.profiles.length === 0 && 
                configState.selectedMetadata.permissionSets.length === 0 &&
                configState.selectedMetadata.mutingPermissionSets.length === 0 &&
                configState.selectedMetadata.permissionSetGroups.length === 0) {
                errors.push('Please select at least one profile or permission set');
                isValid = false;
            }
            break;
            
        case 'permissions':
            collectPermissionTypes();
            const hasSelectedType = Object.values(configState.permissionTypes).some(v => v);
            if (!hasSelectedType) {
                errors.push('Please select at least one permission type');
                isValid = false;
            }
            break;
    }
    
    if (!isValid) {
        showValidationErrors(errors);
    }
    
    return isValid;
}

// Show validation errors using SLDS pattern
function showValidationErrors(errors) {
    const errorHTML = `
        <div class="slds-notify slds-notify_alert slds-theme_alert-texture slds-theme_error" role="alert">
            <span class="slds-assistive-text">error</span>
            <span class="slds-icon_container slds-icon-utility-error slds-m-right_x-small">
                <svg class="slds-icon slds-icon_x-small" aria-hidden="true">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#error"></use>
                </svg>
            </span>
            <h2>${errors.join('<br>')}</h2>
        </div>
    `;
    
    const container = document.getElementById('toastContainer');
    const alertId = `alert_${Date.now()}`;
    const alertDiv = document.createElement('div');
    alertDiv.id = alertId;
    alertDiv.innerHTML = errorHTML;
    container.appendChild(alertDiv);
    
    setTimeout(() => {
        document.getElementById(alertId)?.remove();
    }, 5000);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupNavigation();
    setupSelectAllHandlers();
    setupTabs();
    
    // Make functions available globally
    window.closeToast = closeToast;
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.confirmSaveConfiguration = confirmSaveConfiguration;
});