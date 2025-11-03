// Enhanced Permissions Config Generator - V3 Pattern
// Using metadata definitions and assignment counts

// Import metadata definitions
const METADATA_DEFINITIONS = {
    PermissionSet: {
        displayName: 'Permission Sets',
        apiName: 'PermissionSet'
    },
    PermissionSetGroup: {
        displayName: 'Permission Set Groups', 
        apiName: 'PermissionSetGroup'
    },
    Profile: {
        displayName: 'Profiles',
        apiName: 'Profile'
    },
    MutingPermissionSet: {
        displayName: 'Muting Permission Sets',
        apiName: 'MutingPermissionSet'
    }
};

// Current configuration state
const configState = {
    orgs: [],
    selectedOrgs: [],
    permissionTypes: ['PermissionSet', 'PermissionSetGroup', 'Profile'], // Default selection
    metadata: {}, // Will be populated from API
    selectedMetadata: {},
    selectedPermissionOptions: {}, // What to compare for each type
    objectSelection: 'ALL', // ALL or SPECIFIC
    specificObjects: [],
    apexClassSelection: 'ALL',
    specificApexClasses: [],
    pageSelection: 'ALL',
    specificPages: [],
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

function showLoader(show = true, message = 'Loading...') {
    const spinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
        if (loadingText) loadingText.textContent = message;
    }
}

function updatePath(step) {
    const steps = ['orgs', 'permissionTypes', 'metadata', 'permissions', 'finalize'];
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
    showLoader(true, 'Loading authenticated organizations...');
    
    try {
        const response = await fetch('/permissions-analyser/api/orgs');
        const result = await response.json();
        
        if (result.success && result.orgs.length > 0) {
            configState.orgs = result.orgs;
            renderOrganizations();
            document.getElementById('nextToPermissionTypes').disabled = false;
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
                <div class="slds-text-longform">
                    <h3 class="slds-text-heading_medium">No Organizations Found</h3>
                    <p class="slds-text-body_regular">Please authenticate with Salesforce CLI first.</p>
                </div>
            </div>`;
        return;
    }
    
    const tableHTML = `
        <table class="slds-table slds-table_cell-buffer slds-table_bordered">
            <thead>
                <tr class="slds-line-height_reset">
                    <th class="slds-text-title_caps" scope="col" style="width: 3.25rem;">
                        <div class="slds-th__action slds-th__action_form">
                            <div class="slds-checkbox">
                                <input type="checkbox" id="selectAllOrgs" />
                                <label class="slds-checkbox__label" for="selectAllOrgs">
                                    <span class="slds-checkbox_faux"></span>
                                    <span class="slds-form-element__label slds-assistive-text">Select All</span>
                                </label>
                            </div>
                        </div>
                    </th>
                    <th scope="col"><div class="slds-truncate" title="Username">Username</div></th>
                    <th scope="col"><div class="slds-truncate" title="Alias">Alias</div></th>
                    <th scope="col"><div class="slds-truncate" title="Instance URL">Instance URL</div></th>
                    <th scope="col"><div class="slds-truncate" title="Connected Status">Status</div></th>
                </tr>
            </thead>
            <tbody>
                ${configState.orgs.map((org, index) => `
                    <tr class="slds-hint-parent">
                        <td>
                            <div class="slds-checkbox">
                                <input type="checkbox" name="orgSelection" id="org-${index}" value="${org.username}" />
                                <label class="slds-checkbox__label" for="org-${index}">
                                    <span class="slds-checkbox_faux"></span>
                                    <span class="slds-form-element__label slds-assistive-text">Select ${org.username}</span>
                                </label>
                            </div>
                        </td>
                        <td>
                            <div class="slds-truncate" title="${org.username}">${org.username}</div>
                        </td>
                        <td>
                            <div class="slds-truncate" title="${org.alias || 'N/A'}">${org.alias || 'N/A'}</div>
                        </td>
                        <td>
                            <div class="slds-truncate" title="${org.instanceUrl}">${org.instanceUrl}</div>
                        </td>
                        <td>
                            <span class="slds-badge slds-badge_success">Connected</span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    orgsList.innerHTML = tableHTML;
    
    // Add event listeners
    document.getElementById('selectAllOrgs').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('input[name="orgSelection"]');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateOrgSelection();
    });
    
    document.querySelectorAll('input[name="orgSelection"]').forEach(cb => {
        cb.addEventListener('change', updateOrgSelection);
    });
}

function updateOrgSelection() {
    const selected = Array.from(document.querySelectorAll('input[name="orgSelection"]:checked'))
        .map(cb => cb.value);
    configState.selectedOrgs = selected;
    
    const nextBtn = document.getElementById('nextToPermissionTypes');
    nextBtn.disabled = selected.length < 2;
    
    // Update button text with count
    if (selected.length >= 2) {
        nextBtn.textContent = `Next: Select Permission Types (${selected.length} orgs selected)`;
    } else {
        nextBtn.textContent = 'Next: Select Permission Types';
    }
}

// Step 2: Permission Types Selection
function renderPermissionTypes() {
    const container = document.getElementById('permissionTypesList');
    
    const html = `
        <div class="slds-form" role="list">
            ${Object.entries(METADATA_DEFINITIONS).map(([key, def]) => `
                <div class="slds-form__row">
                    <div class="slds-form__item" role="listitem">
                        <div class="slds-form-element">
                            <div class="slds-form-element__control">
                                <div class="slds-checkbox">
                                    <input type="checkbox" id="permType-${key}" value="${key}" 
                                           ${configState.permissionTypes.includes(key) ? 'checked' : ''} />
                                    <label class="slds-checkbox__label" for="permType-${key}">
                                        <span class="slds-checkbox_faux"></span>
                                        <span class="slds-form-element__label">
                                            <span class="slds-text-heading_small">${def.displayName}</span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('[id^="permType-"]').forEach(cb => {
        cb.addEventListener('change', updatePermissionTypeSelection);
    });
}

function updatePermissionTypeSelection() {
    const selected = Array.from(document.querySelectorAll('[id^="permType-"]:checked'))
        .map(cb => cb.value);
    configState.permissionTypes = selected;
    
    const nextBtn = document.getElementById('nextToMetadata');
    nextBtn.disabled = selected.length === 0;
}

// Step 3: Metadata Selection with Assignment Counts
async function loadMetadataWithCounts() {
    showLoader(true, 'Loading metadata with assignment counts...');
    
    try {
        const response = await fetch('/permissions-analyser/api/permissions/metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orgs: configState.selectedOrgs,
                permissionTypes: configState.permissionTypes
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            configState.metadata = result.metadata;
            configState.definitions = result.definitions;
            renderMetadataSelection();
        } else {
            showToast('Failed to load metadata', 'error');
        }
    } catch (error) {
        console.error('Error loading metadata:', error);
        showToast('Failed to load metadata with counts', 'error');
    } finally {
        showLoader(false);
    }
}

function renderMetadataSelection() {
    const container = document.getElementById('metadataSelectionContent');
    
    // Create tabs for each permission type
    const tabsHTML = `
        <div class="slds-tabs_default">
            <ul class="slds-tabs_default__nav" role="tablist">
                ${configState.permissionTypes.map((type, index) => `
                    <li class="slds-tabs_default__item ${index === 0 ? 'slds-is-active' : ''}" role="presentation">
                        <a class="slds-tabs_default__link" href="javascript:void(0);" role="tab" 
                           data-tab="${type}" id="tab-${type}-link">
                            <span>${METADATA_DEFINITIONS[type].displayName}</span>
                        </a>
                    </li>
                `).join('')}
            </ul>
            ${configState.permissionTypes.map((type, index) => `
                <div id="tab-${type}" class="slds-tabs_default__content ${index === 0 ? 'slds-show' : 'slds-hide'}" 
                     role="tabpanel">
                    ${renderMetadataTable(type)}
                </div>
            `).join('')}
        </div>
    `;
    
    container.innerHTML = tabsHTML;
    
    // Add tab switching
    document.querySelectorAll('.slds-tabs_default__link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = e.target.closest('a').dataset.tab;
            switchTab(tabId);
        });
    });
    
    // Add select all functionality
    document.querySelectorAll('[id^="selectAll-"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const type = e.target.dataset.type;
            const checkboxes = document.querySelectorAll(`input[name="${type}-selection"]`);
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateMetadataSelection(type);
        });
    });
    
    // Add individual selection
    document.querySelectorAll('[name$="-selection"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const type = e.target.name.replace('-selection', '');
            updateMetadataSelection(type);
        });
    });
}

function renderMetadataTable(type) {
    // Get metadata for all orgs
    const allMetadata = new Map();
    
    configState.selectedOrgs.forEach(org => {
        const orgMetadata = configState.metadata[org]?.[type] || [];
        
        orgMetadata.forEach(item => {
            if (!allMetadata.has(item.fullName)) {
                allMetadata.set(item.fullName, {
                    fullName: item.fullName,
                    label: item.label || item.fullName,
                    orgs: new Set()
                });
            }
            allMetadata.get(item.fullName).orgs.add(org);
        });
    });
    
    // Sort alphabetically by name
    const sortedMetadata = Array.from(allMetadata.values()).sort((a, b) => {
        return a.fullName.localeCompare(b.fullName);
    });
    
    return `
        <div class="slds-scrollable" style="max-height: 400px;">
            <table class="slds-table slds-table_cell-buffer slds-table_bordered slds-table_striped">
                <thead>
                    <tr class="slds-line-height_reset">
                        <th scope="col" style="width: 3.25rem;">
                            <div class="slds-th__action slds-th__action_form">
                                <div class="slds-checkbox">
                                    <input type="checkbox" id="selectAll-${type}" data-type="${type}" />
                                    <label class="slds-checkbox__label" for="selectAll-${type}">
                                        <span class="slds-checkbox_faux"></span>
                                        <span class="slds-form-element__label slds-assistive-text">Select All</span>
                                    </label>
                                </div>
                            </div>
                        </th>
                        <th scope="col">
                            <div class="slds-truncate" title="Name">Name</div>
                        </th>
                        <th scope="col">
                            <div class="slds-truncate" title="Label">Label</div>
                        </th>
                        <th scope="col">
                            <div class="slds-truncate" title="Available In">Available In</div>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedMetadata.map((item, index) => {
                        const existsInAllOrgs = item.orgs.size === configState.selectedOrgs.length;
                        const orgList = Array.from(item.orgs);
                        
                        return `
                            <tr class="slds-hint-parent ${!existsInAllOrgs ? 'slds-theme_warning' : ''}">
                                <td>
                                    <div class="slds-checkbox">
                                        <input type="checkbox" name="${type}-selection" 
                                               id="${type}-${index}" value="${item.fullName}" />
                                        <label class="slds-checkbox__label" for="${type}-${index}">
                                            <span class="slds-checkbox_faux"></span>
                                            <span class="slds-form-element__label slds-assistive-text">
                                                Select ${item.fullName}
                                            </span>
                                        </label>
                                    </div>
                                </td>
                                <td>
                                    <div class="slds-truncate" title="${item.fullName}">
                                        ${item.fullName}
                                        ${!existsInAllOrgs ? 
                                            '<span class="slds-icon_container slds-icon-utility-warning slds-m-left_x-small" title="Not in all orgs"><svg class="slds-icon slds-icon_x-small slds-icon-text-warning"><use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#warning"></use></svg></span>' 
                                            : ''}
                                    </div>
                                </td>
                                <td>
                                    <div class="slds-truncate" title="${item.label}">
                                        ${item.label}
                                    </div>
                                </td>
                                <td>
                                    ${existsInAllOrgs ? 
                                        '<span class="slds-badge slds-badge_success">All Orgs</span>' :
                                        `<span class="slds-badge">${item.orgs.size} of ${configState.selectedOrgs.length}</span>`
                                    }
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div class="slds-m-top_small slds-text-body_small slds-text-color_weak">
            <span class="slds-icon_container slds-icon-utility-info slds-m-right_x-small">
                <svg class="slds-icon slds-icon_x-small slds-icon-text-default">
                    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#info"></use>
                </svg>
            </span>
            Items highlighted in yellow are not present in all selected organizations
        </div>
    `;
}

function switchTab(tabId) {
    // Update tab navigation
    document.querySelectorAll('.slds-tabs_default__item').forEach(item => {
        item.classList.remove('slds-is-active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).closest('li').classList.add('slds-is-active');
    
    // Update tab content
    document.querySelectorAll('.slds-tabs_default__content').forEach(content => {
        content.classList.remove('slds-show');
        content.classList.add('slds-hide');
    });
    document.getElementById(`tab-${tabId}`).classList.remove('slds-hide');
    document.getElementById(`tab-${tabId}`).classList.add('slds-show');
}

function updateMetadataSelection(type) {
    const selected = Array.from(document.querySelectorAll(`input[name="${type}-selection"]:checked`))
        .map(cb => cb.value);
    
    if (!configState.selectedMetadata[type]) {
        configState.selectedMetadata[type] = [];
    }
    configState.selectedMetadata[type] = selected;
    
    // Update next button state
    const hasAnySelection = Object.values(configState.selectedMetadata).some(arr => arr.length > 0);
    document.getElementById('nextToPermissions').disabled = !hasAnySelection;
}

// Step 4: Permission Options Configuration
function renderPermissionOptions() {
    const container = document.getElementById('permissionOptionsContent');
    let html = '';
    
    // For each selected permission type, show available options
    configState.permissionTypes.forEach(permType => {
        const def = configState.definitions?.[permType];
        if (!def || !def.supportedPermissions) return;
        
        html += `
            <div class="slds-m-bottom_large">
                <h2 class="slds-text-heading_medium slds-m-bottom_medium">
                    ${def.displayName} - Permission Options
                </h2>
                <div class="slds-form">
                    ${Object.entries(def.supportedPermissions).map(([key, perm]) => `
                        <div class="slds-form__row">
                            <div class="slds-form__item">
                                <div class="slds-form-element">
                                    <div class="slds-form-element__control">
                                        <div class="slds-checkbox">
                                            <input type="checkbox" id="${permType}-${key}" 
                                                   data-type="${permType}" data-permission="${key}"
                                                   ${getDefaultPermissionState(permType, key) ? 'checked' : ''} />
                                            <label class="slds-checkbox__label" for="${permType}-${key}">
                                                <span class="slds-checkbox_faux"></span>
                                                <span class="slds-form-element__label">
                                                    <strong>${perm.label}</strong>
                                                    <span class="slds-text-body_small slds-text-color_weak slds-m-left_x-small">
                                                        ${perm.description}
                                                    </span>
                                                </span>
                                            </label>
                                        </div>
                                    </div>
                                    ${renderPermissionSubOptions(permType, key, perm)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Add event listeners for permission checkboxes
    document.querySelectorAll('[data-permission]').forEach(cb => {
        cb.addEventListener('change', updatePermissionOptions);
    });
    
    // Add event listeners for sub-options
    document.querySelectorAll('[data-selection-type]').forEach(radio => {
        radio.addEventListener('change', updateSelectionType);
    });
    
    document.querySelectorAll('[data-specific-input]').forEach(textarea => {
        textarea.addEventListener('input', updateSpecificItems);
    });
}

function renderPermissionSubOptions(permType, key, perm) {
    // Only show sub-options for permissions that require object/field/apex selection
    if (!perm.requiresObjects && !perm.requiresApexClasses && !perm.requiresPages) {
        return '';
    }
    
    let subOptionsHTML = `<div class="slds-m-left_large slds-m-top_small" id="${permType}-${key}-options" 
                               style="${getDefaultPermissionState(permType, key) ? '' : 'display: none;'}">`;
    
    if (perm.requiresObjects) {
        subOptionsHTML += `
            <div class="slds-form-element">
                <span class="slds-form-element__label">Object Selection</span>
                <div class="slds-form-element__control">
                    <div class="slds-radio_group">
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-objects-all" 
                                   name="${permType}-${key}-objects" value="ALL" 
                                   data-selection-type="objects" data-parent="${permType}-${key}"
                                   ${configState.objectSelection === 'ALL' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-objects-all">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">All Objects</span>
                            </label>
                        </div>
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-objects-common" 
                                   name="${permType}-${key}-objects" value="COMMON"
                                   data-selection-type="objects" data-parent="${permType}-${key}"
                                   ${configState.objectSelection === 'COMMON' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-objects-common">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">Common Objects Only</span>
                            </label>
                        </div>
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-objects-specific" 
                                   name="${permType}-${key}-objects" value="SPECIFIC"
                                   data-selection-type="objects" data-parent="${permType}-${key}"
                                   ${configState.objectSelection === 'SPECIFIC' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-objects-specific">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">Specific Objects</span>
                            </label>
                        </div>
                    </div>
                    <div class="slds-m-top_small" id="${permType}-${key}-objects-common-info" 
                         style="${configState.objectSelection === 'COMMON' ? '' : 'display: none;'}">
                        <div class="slds-scoped-notification slds-media slds-media_center slds-theme_info">
                            <div class="slds-media__figure">
                                <span class="slds-icon_container slds-icon-utility-info">
                                    <svg class="slds-icon slds-icon_small">
                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#info"></use>
                                    </svg>
                                </span>
                            </div>
                            <div class="slds-media__body">
                                <p>Will only include objects that exist in all selected organizations. Objects will be discovered during extraction.</p>
                            </div>
                        </div>
                    </div>
                    <div class="slds-m-top_small" id="${permType}-${key}-objects-input" 
                         style="${configState.objectSelection === 'SPECIFIC' ? '' : 'display: none;'}">
                        <textarea class="slds-textarea" placeholder="Enter object API names (one per line)&#10;Example:&#10;Account&#10;Contact&#10;MyCustomObject__c"
                                  rows="5" data-specific-input="objects" data-parent="${permType}-${key}">${configState.specificObjects.join('\n')}</textarea>
                        <div class="slds-text-body_small slds-text-color_weak slds-m-top_x-small">
                            Enter object API names, one per line. Include standard and custom objects.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (perm.requiresApexClasses) {
        subOptionsHTML += `
            <div class="slds-form-element slds-m-top_small">
                <span class="slds-form-element__label">Apex Class Selection</span>
                <div class="slds-form-element__control">
                    <div class="slds-radio_group">
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-apex-all" 
                                   name="${permType}-${key}-apex" value="ALL"
                                   data-selection-type="apex" data-parent="${permType}-${key}"
                                   ${configState.apexClassSelection === 'ALL' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-apex-all">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">All Apex Classes</span>
                            </label>
                        </div>
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-apex-common" 
                                   name="${permType}-${key}-apex" value="COMMON"
                                   data-selection-type="apex" data-parent="${permType}-${key}"
                                   ${configState.apexClassSelection === 'COMMON' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-apex-common">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">Common Apex Classes Only</span>
                            </label>
                        </div>
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-apex-specific" 
                                   name="${permType}-${key}-apex" value="SPECIFIC"
                                   data-selection-type="apex" data-parent="${permType}-${key}"
                                   ${configState.apexClassSelection === 'SPECIFIC' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-apex-specific">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">Specific Apex Classes</span>
                            </label>
                        </div>
                    </div>
                    <div class="slds-m-top_small" id="${permType}-${key}-apex-common-info" 
                         style="${configState.apexClassSelection === 'COMMON' ? '' : 'display: none;'}">
                        <div class="slds-scoped-notification slds-media slds-media_center slds-theme_info">
                            <div class="slds-media__figure">
                                <span class="slds-icon_container slds-icon-utility-info">
                                    <svg class="slds-icon slds-icon_small">
                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#info"></use>
                                    </svg>
                                </span>
                            </div>
                            <div class="slds-media__body">
                                <p>Will only include Apex classes that exist in all selected organizations.</p>
                            </div>
                        </div>
                    </div>
                    <div class="slds-m-top_small" id="${permType}-${key}-apex-input" 
                         style="${configState.apexClassSelection === 'SPECIFIC' ? '' : 'display: none;'}">
                        <textarea class="slds-textarea" placeholder="Enter Apex class names (one per line)"
                                  rows="5" data-specific-input="apex" data-parent="${permType}-${key}">${configState.specificApexClasses.join('\n')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (perm.requiresPages) {
        subOptionsHTML += `
            <div class="slds-form-element slds-m-top_small">
                <span class="slds-form-element__label">Visualforce Page Selection</span>
                <div class="slds-form-element__control">
                    <div class="slds-radio_group">
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-pages-all" 
                                   name="${permType}-${key}-pages" value="ALL"
                                   data-selection-type="pages" data-parent="${permType}-${key}"
                                   ${configState.pageSelection === 'ALL' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-pages-all">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">All Visualforce Pages</span>
                            </label>
                        </div>
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-pages-common" 
                                   name="${permType}-${key}-pages" value="COMMON"
                                   data-selection-type="pages" data-parent="${permType}-${key}"
                                   ${configState.pageSelection === 'COMMON' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-pages-common">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">Common Pages Only</span>
                            </label>
                        </div>
                        <div class="slds-radio">
                            <input type="radio" id="${permType}-${key}-pages-specific" 
                                   name="${permType}-${key}-pages" value="SPECIFIC"
                                   data-selection-type="pages" data-parent="${permType}-${key}"
                                   ${configState.pageSelection === 'SPECIFIC' ? 'checked' : ''} />
                            <label class="slds-radio__label" for="${permType}-${key}-pages-specific">
                                <span class="slds-radio_faux"></span>
                                <span class="slds-form-element__label">Specific Pages</span>
                            </label>
                        </div>
                    </div>
                    <div class="slds-m-top_small" id="${permType}-${key}-pages-common-info" 
                         style="${configState.pageSelection === 'COMMON' ? '' : 'display: none;'}">
                        <div class="slds-scoped-notification slds-media slds-media_center slds-theme_info">
                            <div class="slds-media__figure">
                                <span class="slds-icon_container slds-icon-utility-info">
                                    <svg class="slds-icon slds-icon_small">
                                        <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#info"></use>
                                    </svg>
                                </span>
                            </div>
                            <div class="slds-media__body">
                                <p>Will only include Visualforce pages that exist in all selected organizations.</p>
                            </div>
                        </div>
                    </div>
                    <div class="slds-m-top_small" id="${permType}-${key}-pages-input" 
                         style="${configState.pageSelection === 'SPECIFIC' ? '' : 'display: none;'}">
                        <textarea class="slds-textarea" placeholder="Enter Visualforce page names (one per line)"
                                  rows="5" data-specific-input="pages" data-parent="${permType}-${key}">${configState.specificPages.join('\n')}</textarea>
                    </div>
                </div>
            </div>
        `;
    }
    
    subOptionsHTML += '</div>';
    return subOptionsHTML;
}

function getDefaultPermissionState(permType, key) {
    // Default selections based on permission type
    const defaults = {
        PermissionSet: ['objectPermissions', 'fieldPermissions', 'userPermissions'],
        Profile: ['objectPermissions', 'fieldPermissions', 'userPermissions', 'tabVisibilities'],
        PermissionSetGroup: ['permissionSets', 'mutingPermissionSets'],
        MutingPermissionSet: ['objectPermissions', 'fieldPermissions']
    };
    
    return defaults[permType]?.includes(key) || false;
}

function updatePermissionOptions(e) {
    const permType = e.target.dataset.type;
    const permission = e.target.dataset.permission;
    const isChecked = e.target.checked;
    
    if (!configState.selectedPermissionOptions[permType]) {
        configState.selectedPermissionOptions[permType] = {};
    }
    
    configState.selectedPermissionOptions[permType][permission] = isChecked;
    
    // Show/hide sub-options
    const subOptions = document.getElementById(`${permType}-${permission}-options`);
    if (subOptions) {
        subOptions.style.display = isChecked ? 'block' : 'none';
    }
}

function updateSelectionType(e) {
    const type = e.target.dataset.selectionType;
    const value = e.target.value;
    
    if (type === 'objects') {
        configState.objectSelection = value;
        document.querySelectorAll('[id$="-objects-input"]').forEach(input => {
            input.style.display = value === 'SPECIFIC' ? 'block' : 'none';
        });
        document.querySelectorAll('[id$="-objects-common-info"]').forEach(info => {
            info.style.display = value === 'COMMON' ? 'block' : 'none';
        });
    } else if (type === 'apex') {
        configState.apexClassSelection = value;
        document.querySelectorAll('[id$="-apex-input"]').forEach(input => {
            input.style.display = value === 'SPECIFIC' ? 'block' : 'none';
        });
        document.querySelectorAll('[id$="-apex-common-info"]').forEach(info => {
            info.style.display = value === 'COMMON' ? 'block' : 'none';
        });
    } else if (type === 'pages') {
        configState.pageSelection = value;
        document.querySelectorAll('[id$="-pages-input"]').forEach(input => {
            input.style.display = value === 'SPECIFIC' ? 'block' : 'none';
        });
        document.querySelectorAll('[id$="-pages-common-info"]').forEach(info => {
            info.style.display = value === 'COMMON' ? 'block' : 'none';
        });
    }
}

function updateSpecificItems(e) {
    const type = e.target.dataset.specificInput;
    const value = e.target.value;
    const items = value.split('\n').filter(item => item.trim());
    
    if (type === 'objects') {
        configState.specificObjects = items;
    } else if (type === 'apex') {
        configState.specificApexClasses = items;
    } else if (type === 'pages') {
        configState.specificPages = items;
    }
}

// Navigation functions
function goToPermissionTypes() {
    if (configState.selectedOrgs.length < 2) {
        showToast('Please select at least 2 organizations', 'error');
        return;
    }
    updatePath('permissionTypes');
    renderPermissionTypes();
}

function goToMetadata() {
    if (configState.permissionTypes.length === 0) {
        showToast('Please select at least one permission type', 'error');
        return;
    }
    updatePath('metadata');
    loadMetadataWithCounts();
}

function goToPermissions() {
    // This step will show granular permission selection
    updatePath('permissions');
    renderPermissionOptions();
}

function goBackToOrgs() {
    updatePath('orgs');
}

function goBackToPermissionTypes() {
    updatePath('permissionTypes');
}

function goBackToMetadata() {
    updatePath('metadata');
}

function goBackToPermissions() {
    updatePath('permissions');
}

function goToFinalize() {
    updatePath('finalize');
    renderConfigReview();
}

// Step 5: Review and Generate
function renderConfigReview() {
    const container = document.getElementById('configReview');
    
    // Count total selections
    const totalMetadata = Object.values(configState.selectedMetadata)
        .reduce((sum, arr) => sum + arr.length, 0);
    const totalPermissions = Object.values(configState.selectedPermissionOptions)
        .reduce((sum, perms) => sum + Object.values(perms).filter(v => v).length, 0);
    
    const html = `
        <div class="slds-summary-detail slds-m-bottom_large">
            <div class="slds-summary-detail__title">
                <h3 class="slds-text-heading_small">Configuration Summary</h3>
            </div>
            <div class="slds-summary-detail__content">
                <div class="slds-grid slds-wrap">
                    <div class="slds-col slds-size_1-of-2 slds-m-bottom_small">
                        <dt class="slds-text-color_weak">Selected Organizations:</dt>
                        <dd class="slds-text-heading_small">${configState.selectedOrgs.length}</dd>
                    </div>
                    <div class="slds-col slds-size_1-of-2 slds-m-bottom_small">
                        <dt class="slds-text-color_weak">Permission Types:</dt>
                        <dd class="slds-text-heading_small">${configState.permissionTypes.length}</dd>
                    </div>
                    <div class="slds-col slds-size_1-of-2 slds-m-bottom_small">
                        <dt class="slds-text-color_weak">Total Metadata Items:</dt>
                        <dd class="slds-text-heading_small">${totalMetadata}</dd>
                    </div>
                    <div class="slds-col slds-size_1-of-2 slds-m-bottom_small">
                        <dt class="slds-text-color_weak">Permission Options:</dt>
                        <dd class="slds-text-heading_small">${totalPermissions}</dd>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Organizations -->
        <div class="slds-m-bottom_medium">
            <h3 class="slds-text-heading_small slds-m-bottom_small">Organizations</h3>
            <div class="slds-box slds-theme_shade">
                ${configState.selectedOrgs.map(org => `
                    <span class="slds-badge slds-m-right_x-small slds-m-bottom_x-small">${org}</span>
                `).join('')}
            </div>
        </div>
        
        <!-- Selected Metadata -->
        <div class="slds-m-bottom_medium">
            <h3 class="slds-text-heading_small slds-m-bottom_small">Selected Metadata</h3>
            ${configState.permissionTypes.map(type => {
                const items = configState.selectedMetadata[type] || [];
                if (items.length === 0) return '';
                
                return `
                    <div class="slds-m-bottom_small">
                        <dt class="slds-text-body_small slds-text-color_weak">${METADATA_DEFINITIONS[type].displayName}:</dt>
                        <dd class="slds-truncate">${items.length} items selected</dd>
                    </div>
                `;
            }).join('')}
        </div>
        
        <!-- Permission Options -->
        <div class="slds-m-bottom_medium">
            <h3 class="slds-text-heading_small slds-m-bottom_small">Permission Options</h3>
            ${configState.permissionTypes.map(type => {
                const options = configState.selectedPermissionOptions[type];
                if (!options) return '';
                
                const selected = Object.entries(options)
                    .filter(([key, value]) => value)
                    .map(([key]) => {
                        const def = configState.definitions?.[type]?.supportedPermissions?.[key];
                        return def?.label || key;
                    });
                
                if (selected.length === 0) return '';
                
                return `
                    <div class="slds-m-bottom_small">
                        <dt class="slds-text-body_small slds-text-color_weak">${METADATA_DEFINITIONS[type].displayName}:</dt>
                        <dd>${selected.join(', ')}</dd>
                    </div>
                `;
            }).join('')}
        </div>
        
        <!-- Object/Apex/Page Selection -->
        ${configState.objectSelection !== 'ALL' ? `
            <div class="slds-m-bottom_medium">
                <h3 class="slds-text-heading_small slds-m-bottom_small">Object Selection</h3>
                ${configState.objectSelection === 'COMMON' ? `
                    <div class="slds-box slds-theme_shade">
                        <span class="slds-badge slds-theme_info">Common Objects Only</span>
                        <p class="slds-text-body_small slds-m-top_x-small">Will only include objects that exist in all selected organizations</p>
                    </div>
                ` : configState.specificObjects.length > 0 ? `
                    <div class="slds-box slds-theme_shade">
                        ${configState.specificObjects.slice(0, 10).map(obj => `
                            <span class="slds-badge slds-m-right_x-small slds-m-bottom_x-small">${obj}</span>
                        `).join('')}
                        ${configState.specificObjects.length > 10 ? `
                            <span class="slds-text-body_small slds-text-color_weak">
                                and ${configState.specificObjects.length - 10} more...
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        ` : ''}
        
        ${configState.apexClassSelection !== 'ALL' ? `
            <div class="slds-m-bottom_medium">
                <h3 class="slds-text-heading_small slds-m-bottom_small">Apex Class Selection</h3>
                ${configState.apexClassSelection === 'COMMON' ? `
                    <div class="slds-box slds-theme_shade">
                        <span class="slds-badge slds-theme_info">Common Apex Classes Only</span>
                        <p class="slds-text-body_small slds-m-top_x-small">Will only include Apex classes that exist in all selected organizations</p>
                    </div>
                ` : configState.specificApexClasses.length > 0 ? `
                    <div class="slds-box slds-theme_shade">
                        ${configState.specificApexClasses.slice(0, 10).map(cls => `
                            <span class="slds-badge slds-m-right_x-small slds-m-bottom_x-small">${cls}</span>
                        `).join('')}
                        ${configState.specificApexClasses.length > 10 ? `
                            <span class="slds-text-body_small slds-text-color_weak">
                                and ${configState.specificApexClasses.length - 10} more...
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        ` : ''}
        
        ${configState.pageSelection !== 'ALL' ? `
            <div class="slds-m-bottom_medium">
                <h3 class="slds-text-heading_small slds-m-bottom_small">Visualforce Page Selection</h3>
                ${configState.pageSelection === 'COMMON' ? `
                    <div class="slds-box slds-theme_shade">
                        <span class="slds-badge slds-theme_info">Common Visualforce Pages Only</span>
                        <p class="slds-text-body_small slds-m-top_x-small">Will only include Visualforce pages that exist in all selected organizations</p>
                    </div>
                ` : configState.specificPages.length > 0 ? `
                    <div class="slds-box slds-theme_shade">
                        ${configState.specificPages.slice(0, 10).map(page => `
                            <span class="slds-badge slds-m-right_x-small slds-m-bottom_x-small">${page}</span>
                        `).join('')}
                        ${configState.specificPages.length > 10 ? `
                            <span class="slds-text-body_small slds-text-color_weak">
                                and ${configState.specificPages.length - 10} more...
                            </span>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        ` : ''}
    `;
    
    container.innerHTML = html;
}

async function generateConfiguration() {
    showLoader(true, 'Generating configuration...');
    
    try {
        // Build configuration object
        const config = {
            version: '3.0.0',
            createdAt: new Date().toISOString(),
            orgs: configState.selectedOrgs,
            permissions: configState.selectedMetadata,
            selectedPermissionOptions: configState.selectedPermissionOptions,
            objectSelection: configState.objectSelection,
            specificObjects: configState.specificObjects,
            apexClassSelection: configState.apexClassSelection,
            specificApexClasses: configState.specificApexClasses,
            pageSelection: configState.pageSelection,
            specificPages: configState.specificPages,
            permissionTypes: configState.permissionTypes
        };
        
        const response = await fetch('/permissions-analyser/api/config/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Configuration generated successfully!', 'success');
            
            // Download the config
            const blob = new Blob([JSON.stringify(result.config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `permissions-config-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            // Store config ID for extraction
            configState.configId = result.configId;
            document.getElementById('startExtractionBtn').disabled = false;
        } else {
            showToast('Failed to generate configuration', 'error');
        }
    } catch (error) {
        console.error('Error generating config:', error);
        showToast('Error generating configuration', 'error');
    } finally {
        showLoader(false);
    }
}

async function startExtraction() {
    if (!configState.configId) {
        showToast('Please generate configuration first', 'error');
        return;
    }
    
    showLoader(true, 'Starting permissions extraction...');
    
    try {
        // Build full config
        const fullConfig = {
            version: '3.0.0',
            createdAt: new Date().toISOString(),
            orgs: configState.selectedOrgs,
            permissions: configState.selectedMetadata,
            selectedPermissionOptions: configState.selectedPermissionOptions,
            objectSelection: configState.objectSelection,
            specificObjects: configState.specificObjects,
            apexClassSelection: configState.apexClassSelection,
            specificApexClasses: configState.specificApexClasses,
            pageSelection: configState.pageSelection,
            specificPages: configState.specificPages,
            permissionTypes: configState.permissionTypes,
            id: configState.configId
        };
        
        const response = await fetch('/permissions-analyser/api/extraction/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orgs: configState.selectedOrgs,
                metadata: configState.selectedMetadata,
                permissionTypes: configState.permissionTypes,
                config: fullConfig
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Extraction started successfully!', 'success');
            // Redirect to viewer
            window.location.href = `/permissions-analyser/viewer?extractionId=${result.extractionId}`;
        } else {
            showToast('Failed to start extraction', 'error');
        }
    } catch (error) {
        console.error('Error starting extraction:', error);
        showToast('Error starting extraction', 'error');
    } finally {
        showLoader(false);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Set up event listeners
    document.getElementById('loadOrgsBtn').addEventListener('click', loadOrganizations);
    document.getElementById('nextToPermissionTypes').addEventListener('click', goToPermissionTypes);
    document.getElementById('backToOrgs').addEventListener('click', goBackToOrgs);
    document.getElementById('nextToMetadata').addEventListener('click', goToMetadata);
    document.getElementById('backToPermissionTypes').addEventListener('click', goBackToPermissionTypes);
    document.getElementById('nextToPermissions').addEventListener('click', goToPermissions);
    document.getElementById('backToMetadata').addEventListener('click', goBackToMetadata);
    document.getElementById('nextToFinalize').addEventListener('click', goToFinalize);
    document.getElementById('backToPermissions').addEventListener('click', goBackToPermissions);
    document.getElementById('generateConfigBtn').addEventListener('click', generateConfiguration);
    document.getElementById('startExtractionBtn').addEventListener('click', startExtraction);
    
    // Load organizations on start
    loadOrganizations();
});