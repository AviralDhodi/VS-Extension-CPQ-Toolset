// Organization Selection Component Logic - CPQ Toolset v3
(function() {
    'use strict';

    // Component state
    let organizations = [];
    let filteredOrganizations = [];
    let selectedOrganizations = new Set();
    let isLoading = false;

    // DOM elements
    const loadingSection = document.getElementById('loadingSection');
    const errorSection = document.getElementById('errorSection');
    const contentSection = document.getElementById('contentSection');
    const errorMessage = document.getElementById('errorMessage');
    const retryBtn = document.getElementById('retryBtn');
    const orgSearch = document.getElementById('orgSearch');
    const showScratchOrgs = document.getElementById('showScratchOrgs');
    const showProductionOrgs = document.getElementById('showProductionOrgs');
    const sˀelectedCount = document.querySelector('.selected-count');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const orgList = document.getElementById('orgList');
    const validationMessages = document.getElementById('validationMessages');
    const backBtn = document.getElementById('backBtn');
    const continueBtn = document.getElementById('continueBtn');
    const orgDetailsModal = document.getElementById('orgDetailsModal');
    const modalBody = document.getElementById('modalBody');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

    // Initialize component
    function init() {
        console.log('Organization selection component initializing...');
        
        // Bind event listeners
        bindEvents();
        
        // Load organizations
        loadOrganizations();
        
        console.log('Organization selection component initialized');
    }

    // Bind event listeners
    function bindEvents() {
        // Retry button
        retryBtn.addEventListener('click', loadOrganizations);
        
        // Search input
        orgSearch.addEventListener('input', debounce(filterOrganizations, 300));
        
        // Filter checkboxes
        showScratchOrgs.addEventListener('change', filterOrganizations);
        showProductionOrgs.addEventListener('change', filterOrganizations);
        
        // Selection controls
        selectAllBtn.addEventListener('click', selectAll);
        clearAllBtn.addEventListener('click', clearAll);
        
        // Navigation buttons
        backBtn.addEventListener('click', goBack);
        continueBtn.addEventListener('click', continueToNext);
        
        // Modal controls
        closeModalBtn.addEventListener('click', closeModal);
        modalCloseBtn.addEventListener('click', closeModal);
        orgDetailsModal.addEventListener('click', (e) => {
            if (e.target === orgDetailsModal) {
                closeModal();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);
    }

    // Load organizations from API
    async function loadOrganizations() {
        if (isLoading) return;
        
        isLoading = true;
        showLoadingState();
        
        try {
            console.log('Loading authenticated organizations...');
            
            const response = await fetch('/data-comparison/api/orgs');
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message || 'Failed to load organizations');
            }
            
            organizations = result.orgs || [];
            console.log(`Loaded ${organizations.length} organizations`);
            
            if (organizations.length === 0) {
                throw new Error('No authenticated organizations found. Please authenticate with Salesforce CLI first.');
            }
            
            // Filter and render organizations
            filterOrganizations();
            showContentState();
            
        } catch (error) {
            console.error('Failed to load organizations:', error);
            showErrorState(error.message);
        } finally {
            isLoading = false;
        }
    }

    // Filter organizations based on search and filters
    function filterOrganizations() {
        const searchTerm = orgSearch.value.toLowerCase().trim();
        const showScratch = showScratchOrgs.checked;
        const showProduction = showProductionOrgs.checked;
        
        filteredOrganizations = organizations.filter(org => {
            // Text search
            const matchesSearch = !searchTerm || 
                org.username.toLowerCase().includes(searchTerm) ||
                (org.alias && org.alias.toLowerCase().includes(searchTerm));
            
            // Type filter
            const matchesType = (showScratch && org.isScratch) || 
                              (showProduction && !org.isScratch);
            
            return matchesSearch && matchesType;
        });
        
        console.log(`Filtered to ${filteredOrganizations.length} organizations`);
        renderOrganizations();
        updateSelectionSummary();
    }

    // Render organizations list
    function renderOrganizations() {
        orgList.innerHTML = '';
        
        if (filteredOrganizations.length === 0) {
            orgList.innerHTML = `
                <div class="empty-state">
                    <p>No organizations match your current filters.</p>
                    <button class="btn btn-link" onclick="clearFilters()">Clear Filters</button>
                </div>
            `;
            return;
        }
        
        filteredOrganizations.forEach(org => {
            const orgItem = createOrganizationItem(org);
            orgList.appendChild(orgItem);
        });
    }

    // Create organization item element
    function createOrganizationItem(org) {
        const div = document.createElement('div');
        div.className = `org-item ${selectedOrganizations.has(org.username) ? 'selected' : ''}`;
        div.dataset.username = org.username;
        
        const badges = [];
        if (org.isScratch) {
            badges.push('<span class="org-badge scratch">Scratch</span>');
        } else {
            badges.push('<span class="org-badge production">Production</span>');
        }
        
        if (org.isDefaultUsername) {
            badges.push('<span class="org-badge default">Default</span>');
        }
        
        div.innerHTML = `
            <input type="checkbox" class="org-checkbox" 
                   ${selectedOrganizations.has(org.username) ? 'checked' : ''}
                   data-username="${org.username}">
            <div class="org-info">
                <div class="org-username">${org.username}</div>
                <div class="org-details">
                    <span class="org-alias">${org.alias || 'No alias'}</span>
                    ${badges.join('')}
                </div>
            </div>
            <div class="org-actions">
                <button class="btn-icon" title="View Details" data-action="details">
                    ℹ️
                </button>
            </div>
        `;
        
        // Bind events
        const checkbox = div.querySelector('.org-checkbox');
        checkbox.addEventListener('change', (e) => toggleOrganization(e.target.dataset.username));
        
        div.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox' && !e.target.dataset.action) {
                checkbox.checked = !checkbox.checked;
                toggleOrganization(org.username);
            }
        });
        
        const detailsBtn = div.querySelector('[data-action="details"]');
        detailsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showOrganizationDetails(org);
        });
        
        return div;
    }

    // Toggle organization selection
    function toggleOrganization(username) {
        if (selectedOrganizations.has(username)) {
            selectedOrganizations.delete(username);
        } else {
            selectedOrganizations.add(username);
        }
        
        // Update UI
        const orgItem = document.querySelector(`[data-username="${username}"]`);
        if (orgItem) {
            const checkbox = orgItem.querySelector('.org-checkbox');
            checkbox.checked = selectedOrganizations.has(username);
            orgItem.classList.toggle('selected', selectedOrganizations.has(username));
        }
        
        updateSelectionSummary();
        validateSelection();
    }

    // Select all filtered organizations
    function selectAll() {
        filteredOrganizations.forEach(org => {
            selectedOrganizations.add(org.username);
        });
        
        renderOrganizations();
        updateSelectionSummary();
        validateSelection();
    }

    // Clear all selections
    function clearAll() {
        selectedOrganizations.clear();
        renderOrganizations();
        updateSelectionSummary();
        validateSelection();
    }

    // Update selection summary
    function updateSelectionSummary() {
        const totalCount = filteredOrganizations.length;
        const selectedCountNum = selectedOrganizations.size;
        
        selectedCount.textContent = `${selectedCountNum} of ${totalCount} organizations selected`;
        
        // Update button states
        selectAllBtn.disabled = selectedCountNum === totalCount;
        clearAllBtn.disabled = selectedCountNum === 0;
    }

    // Validate selection
    function validateSelection() {
        clearValidationMessages();
        
        const selectedCount = selectedOrganizations.size;
        
        if (selectedCount < 2) {
            showValidationMessage('At least 2 organizations must be selected for comparison.', 'error');
            continueBtn.disabled = true;
        } else if (selectedCount > 10) {
            showValidationMessage('Selecting more than 10 organizations may impact performance.', 'warning');
            continueBtn.disabled = false;
        } else {
            showValidationMessage(`${selectedCount} organizations selected. Ready to continue!`, 'info');
            continueBtn.disabled = false;
        }
    }

    // Show validation message
    function showValidationMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `validation-message ${type}`;
        messageDiv.textContent = message;
        validationMessages.appendChild(messageDiv);
    }

    // Clear validation messages
    function clearValidationMessages() {
        validationMessages.innerHTML = '';
    }

    // Show organization details modal
    function showOrganizationDetails(org) {
        modalBody.innerHTML = `
            <div class="org-detail-grid">
                <div class="detail-row">
                    <span class="detail-label">Username:</span>
                    <span class="detail-value">${org.username}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Alias:</span>
                    <span class="detail-value">${org.alias || 'Not set'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Organization ID:</span>
                    <span class="detail-value">${org.orgId || 'Unknown'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Instance URL:</span>
                    <span class="detail-value">
                        <a href="${org.instanceUrl}" target="_blank">${org.instanceUrl}</a>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Type:</span>
                    <span class="detail-value">${org.isScratch ? 'Scratch Org' : 'Production/Sandbox'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value">${org.status || 'Active'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Default Username:</span>
                    <span class="detail-value">${org.isDefaultUsername ? 'Yes' : 'No'}</span>
                </div>
            </div>
        `;
        
        orgDetailsModal.style.display = 'flex';
    }

    // Close modal
    function closeModal() {
        orgDetailsModal.style.display = 'none';
    }

    // Clear filters
    function clearFilters() {
        orgSearch.value = '';
        showScratchOrgs.checked = true;
        showProductionOrgs.checked = true;
        filterOrganizations();
    }

    // Go back to welcome
    function goBack() {
        window.location.href = '/data-comparison';
    }

    // Continue to next step
    function continueToNext() {
        if (selectedOrganizations.size < 2) {
            return;
        }
        
        // Store selection in session storage
        const selectedOrgList = Array.from(selectedOrganizations);
        sessionStorage.setItem('selectedOrganizations', JSON.stringify(selectedOrgList));
        
        console.log('Continuing with organizations:', selectedOrgList);
        
        // Navigate to config generator
        window.location.href = '/data-comparison/config-generator';
    }

    // Handle keyboard shortcuts
    function handleKeyboardShortcuts(event) {
        // Ctrl/Cmd + A for select all
        if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
            event.preventDefault();
            if (!selectAllBtn.disabled) {
                selectAll();
            }
        }
        
        // Escape to clear selection
        if (event.key === 'Escape') {
            if (orgDetailsModal.style.display === 'flex') {
                closeModal();
            } else if (selectedOrganizations.size > 0) {
                clearAll();
            }
        }
        
        // Enter to continue
        if (event.key === 'Enter') {
            if (!continueBtn.disabled) {
                continueToNext();
            }
        }
    }

    // Show loading state
    function showLoadingState() {
        loadingSection.style.display = 'block';
        errorSection.style.display = 'none';
        contentSection.style.display = 'none';
    }

    // Show error state
    function showErrorState(message) {
        errorMessage.textContent = message;
        loadingSection.style.display = 'none';
        errorSection.style.display = 'block';
        contentSection.style.display = 'none';
    }

    // Show content state
    function showContentState() {
        loadingSection.style.display = 'none';
        errorSection.style.display = 'none';
        contentSection.style.display = 'block';
    }

    // Debounce function
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Initialize component when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose global functions for debugging
    window.orgSelectionComponent = {
        loadOrganizations,
        clearFilters,
        selectAll,
        clearAll,
        selectedOrganizations: () => Array.from(selectedOrganizations)
    };

})();