// Welcome Component Logic - CPQ Toolset v3
(function() {
    'use strict';
    
    // Prevent multiple initializations
    if (window.welcomeComponentInitialized) {
        console.log('Welcome component already initialized, skipping...');
        return;
    }
    window.welcomeComponentInitialized = true;

    // Component state
    let isUploading = false;

    // DOM elements (will be initialized after DOM is ready)
    let uploadConfigBtn;
    let configFileInput;
    let createConfigBtn;
    let loadingModal;
    let loadingBackdrop;

    // Initialize component
    function init() {
        console.log('Welcome component initializing...');
        
        // Initialize DOM elements
        uploadConfigBtn = document.getElementById('upload-config-btn');
        configFileInput = document.getElementById('config-file-input');
        createConfigBtn = document.getElementById('create-config-btn');
        loadingModal = document.getElementById('loadingModal');
        loadingBackdrop = document.getElementById('loadingBackdrop');
        
        // Bind event listeners
        bindEvents();
        
        // Load component data if available
        if (window.componentData) {
            console.log('Component data:', window.componentData);
        }
        
        console.log('Welcome component initialized');
    }

    // Bind event listeners
    function bindEvents() {
        console.log('Binding events...');
        console.log('uploadConfigBtn:', uploadConfigBtn);
        console.log('configFileInput:', configFileInput);
        console.log('createConfigBtn:', createConfigBtn);
        
        // Upload configuration button
        if (uploadConfigBtn) {
            uploadConfigBtn.addEventListener('click', handleUploadClick);
            console.log('Upload button listener attached');
        } else {
            console.error('Upload button not found!');
        }
        
        // File input change
        if (configFileInput) {
            configFileInput.addEventListener('change', handleFileSelection);
            console.log('File input listener attached');
        } else {
            console.error('File input not found!');
        }
        
        // Create configuration button
        if (createConfigBtn) {
            createConfigBtn.addEventListener('click', handleCreateConfigClick);
            console.log('Create button listener attached');
        } else {
            console.error('Create button not found!');
        }
        
        // Prevent default form submission
        document.addEventListener('submit', (e) => e.preventDefault());
    }

    // Handle upload button click
    function handleUploadClick() {
        console.log('Upload button clicked!');
        if (isUploading) {
            console.log('Already uploading, returning...');
            return;
        }
        
        console.log('Triggering file input click...');
        configFileInput.click();
    }

    // Handle file selection
    function handleFileSelection(event) {
        const file = event.target.files[0];
        
        if (!file) {
            return;
        }
        
        console.log('File selected:', file.name, file.type, file.size);
        
        // Validate file
        if (!validateFile(file)) {
            return;
        }
        
        // Upload file
        uploadConfigFile(file);
    }

    // Validate selected file
    function validateFile(file) {
        const allowedTypes = [
            'application/json',
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        const allowedExtensions = ['.json', '.csv', '.xlsx', '.xls'];
        const fileExtension = getFileExtension(file.name);
        
        // Check file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            showUploadStatus('File size must be less than 10MB', 'error');
            return false;
        }
        
        // Check file type
        if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
            showUploadStatus('Only JSON, CSV, and Excel files are allowed', 'error');
            return false;
        }
        
        return true;
    }

    // Get file extension
    function getFileExtension(filename) {
        return filename.toLowerCase().substring(filename.lastIndexOf('.'));
    }

    // Upload configuration file
    async function uploadConfigFile(file) {
        isUploading = true;
        showLoading('Uploading configuration file...');
        showUploadStatus('Processing file...', 'processing');
        
        try {
            const formData = new FormData();
            formData.append('configFile', file);
            
            const response = await fetch('/data-comparison/api/config/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                showUploadStatus('Configuration uploaded successfully!', 'success');
                
                // Start comparison with the uploaded config
                setTimeout(() => {
                    startComparison(result.configId);
                }, 1500);
            } else {
                throw new Error(result.error || result.message || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload failed:', error);
            showUploadStatus(`Upload failed: ${error.message}`, 'error');
        } finally {
            isUploading = false;
            hideLoading();
            
            // Reset file input
            configFileInput.value = '';
        }
    }

    // Handle create configuration button click
    function handleCreateConfigClick() {
        console.log('Create config button clicked!');
        console.log('Starting configuration creation...');
        showLoading('Loading configuration generator...');
        
        // Navigate to configuration generator
        setTimeout(() => {
            console.log('Navigating to config generator...');
            navigateToConfigGenerator();
        }, 500);
    }

    // Show upload status using SLDS toast
    function showUploadStatus(message, type) {
        // Toast elements not present in current HTML - using console logging instead
        console.log(`Upload Status [${type}]: ${message}`);
        
        // Alternative: Show status in loading modal for now
        if (type === 'error') {
            alert(`Error: ${message}`);
        } else if (type === 'success') {
            // Show success briefly in loading modal
            showLoading(message);
            setTimeout(() => {
                hideLoading();
            }, 2000);
        }
    }

    // Show loading overlay
    function showLoading(message = 'Loading...') {
        const loadingText = document.getElementById('loadingText');
        
        if (loadingText) {
            loadingText.textContent = message;
        }
        
        loadingModal.classList.add('slds-fade-in-open');
        loadingBackdrop.classList.add('slds-backdrop_open');
        loadingModal.setAttribute('aria-hidden', 'false');
    }

    // Hide loading overlay
    function hideLoading() {
        loadingModal.classList.remove('slds-fade-in-open');
        loadingBackdrop.classList.remove('slds-backdrop_open');
        loadingModal.setAttribute('aria-hidden', 'true');
    }

    // Start comparison with uploaded config
    async function startComparison(configId) {
        showLoading('Starting comparison process...');
        
        try {
            const response = await fetch('/data-comparison/api/comparison/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ configId })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Navigate to comparison status page
                window.location.href = `/data-comparison/comparison-status?comparisonId=${result.comparisonId}`;
            } else {
                throw new Error(result.error || 'Failed to start comparison');
            }
        } catch (error) {
            console.error('Failed to start comparison:', error);
            showUploadStatus(`Failed to start comparison: ${error.message}`, 'error');
            hideLoading();
        }
    }

    // Navigate to configuration viewer
    function navigateToConfigViewer(configPath) {
        const params = new URLSearchParams({ configPath });
        window.location.href = `/data-comparison/comparison-viewer?${params}`;
    }

    // Navigate to configuration generator
    function navigateToConfigGenerator() {
        window.location.href = '/data-comparison/config-generator';
    }

    // Check system health
    async function checkSystemHealth() {
        try {
            const response = await fetch('/health');
            const health = await response.json();
            
            console.log('System health:', health);
            
            // Update status indicator badge
            const statusBadge = document.querySelector('.status-indicator');
            const statusText = document.querySelector('.status-text');
            const statusIcon = statusBadge?.querySelector('svg use');
            
            if (statusBadge && statusText && statusIcon) {
                // Remove all theme classes
                statusBadge.classList.remove('slds-badge_success', 'slds-badge_error', 'slds-badge_warning');
                
                if (health.status === 'healthy') {
                    statusBadge.classList.add('slds-badge_success');
                    statusText.textContent = 'System Ready';
                    statusIcon.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#check');
                } else {
                    statusBadge.classList.add('slds-badge_error');
                    statusText.textContent = 'System Issues';
                    statusIcon.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#error');
                }
            }
            
        } catch (error) {
            console.warn('Health check failed:', error);
            
            const statusBadge = document.querySelector('.status-indicator');
            const statusText = document.querySelector('.status-text');
            const statusIcon = statusBadge?.querySelector('svg use');
            
            if (statusBadge && statusText && statusIcon) {
                statusBadge.classList.remove('slds-badge_success', 'slds-badge_error');
                statusBadge.classList.add('slds-badge_warning');
                statusText.textContent = 'Connection Issues';
                statusIcon.setAttribute('xlink:href', '/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#warning');
            }
        }
    }

    // Keyboard shortcuts
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Ctrl/Cmd + U for upload
            if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
                event.preventDefault();
                handleUploadClick();
            }
            
            // Ctrl/Cmd + N for new configuration
            if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
                event.preventDefault();
                handleCreateConfigClick();
            }
        });
    }

    // Initialize component when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Setup additional features
    setupKeyboardShortcuts();
    
    // Periodic health check
    checkSystemHealth();
    setInterval(checkSystemHealth, 30000); // Check every 30 seconds
    
    // Expose global functions for debugging
    window.welcomeComponent = {
        checkSystemHealth,
        navigateToConfigGenerator,
        navigateToConfigViewer
    };

})();