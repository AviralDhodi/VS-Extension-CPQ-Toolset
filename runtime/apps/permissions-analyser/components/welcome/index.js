// Permissions Analyser Welcome Component - V3 Pattern

// Toast notification utility
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

// Navigation function (V3 pattern - direct navigation)
function navigateTo(path) {
    window.location.href = path;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Upload Configuration Button
    const uploadBtn = document.getElementById('uploadConfigBtn');
    const fileInput = document.getElementById('configFileInput');
    
    uploadBtn.addEventListener('click', function() {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json')) {
            showToast('Please select a valid JSON configuration file', 'error');
            return;
        }
        
        try {
            // Upload to server
            const formData = new FormData();
            formData.append('config', file);
            
            const response = await fetch('/permissions-analyser/api/config/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                showToast('Configuration uploaded successfully! Starting extraction...');
                
                // Load the uploaded config to start extraction
                const configResponse = await fetch(`/permissions-analyser/api/config/${result.configId}`);
                const configData = await configResponse.json();
                
                if (configData.success) {
                    // Start extraction with the uploaded config
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
                        showToast('Extraction started! Redirecting...');
                        // Navigate to permissions viewer with extraction ID
                        setTimeout(() => {
                            navigateTo('/permissions-analyser/viewer?extractionId=' + extractionResult.extractionId);
                        }, 1000);
                    } else {
                        throw new Error(extractionResult.error || 'Failed to start extraction');
                    }
                } else {
                    throw new Error(configData.error || 'Failed to load configuration');
                }
            } else {
                throw new Error(result.error || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            showToast(error.message || 'Failed to upload configuration', 'error');
        } finally {
            // Reset file input
            fileInput.value = '';
        }
    });
    
    // Create Configuration Button
    const createBtn = document.getElementById('createConfigBtn');
    createBtn.addEventListener('click', function() {
        navigateTo('/permissions-analyser/config-generator');
    });
});

// Make closeToast available globally
window.closeToast = closeToast;