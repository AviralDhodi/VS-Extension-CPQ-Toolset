// apps/data-comparison/state/index.js - Fixed State Manager with Dynamic UI Generation
const path = require('path');
const fs = require('fs');

class DataComparisonStateManager {
    constructor() {
        this.currentState = {
            app: 'data-comparison',
            component: 'welcome',
            data: {},
            timestamp: new Date().toISOString()
        };
        console.log('[StateManager] DataComparisonStateManager initialized');
    }

    setState(component, data = {}) {
        console.log(`[StateManager] 🔄 Setting state: ${this.currentState.component} → ${component}`);
        
        this.currentState = {
            app: 'data-comparison',
            component: component,
            data: data,
            timestamp: new Date().toISOString()
        };
        
        console.log(`[StateManager] ✅ State updated:`, this.currentState);
        
        return this.currentState;
    }

    getState() {
        return this.currentState;
    }

    getDisplayName() {
        const names = {
            'welcome': 'Data Comparison - Welcome',
            'configGenerator': 'Data Comparison - Config Generator', 
            'orgSelection': 'Data Comparison - Org Selection',
            'objectSelection': 'Data Comparison - Object Selection',
            'filterConfiguration': 'Data Comparison - Filter Configuration',
            'comparisonStatus': 'Data Comparison - Status Monitor',
            'comparisonViewer': 'Data Comparison - Git Viewer',
            'comparison': 'Data Comparison - Running Comparison',
            'results': 'Data Comparison - Results'
        };
        return names[this.currentState.component] || `Data Comparison - ${this.currentState.component}`;
    }

    getStatus() {
        const statuses = {
            'welcome': 'idle',
            'configGenerator': 'loading',
            'orgSelection': 'loading',
            'objectSelection': 'active',
            'filterConfiguration': 'active',
            'comparisonStatus': 'loading',
            'comparisonViewer': 'active',
            'comparison': 'loading',
            'results': 'success'
        };
        return statuses[this.currentState.component] || 'idle';
    }

    // Check if improved version should be used for a component
    shouldUseImproved(component) {
        // For v3, always use improved version for configGenerator
        return component === 'configGenerator';
    }

    // Transition to a specific state
    transitionTo(state) {
        console.log(`[StateManager] Transitioning to: ${state}`);
        this.setState(state);
    }

    // Generate dynamic appView HTML with shell integration
    async generateAppView(component, data = {}) {
        console.log(`[StateManager] 🎨 generateAppView called for component: ${component}`);
        
        const projectRoot = process.cwd();
        const componentPath = path.join(projectRoot, 'apps', 'data-comparison', 'components', component);
        
        console.log(`[StateManager] 📂 Project root: ${projectRoot}`);
        console.log(`[StateManager] 📁 Component path: ${componentPath}`);
        console.log(`[StateManager] 📋 Component exists: ${fs.existsSync(componentPath)}`);
        
        // Read component files - use improved version for configGenerator
        const useImproved = component === 'configGenerator';
        const htmlPath = path.join(componentPath, useImproved ? 'improved-index.html' : 'index.html');
        const cssPath = path.join(componentPath, useImproved ? 'improved-index.css' : 'index.css');
        const jsPath = path.join(componentPath, useImproved ? 'improved-index.js' : 'index.js');
        
        console.log(`[StateManager] 📄 HTML: ${htmlPath} - exists: ${fs.existsSync(htmlPath)}`);
        console.log(`[StateManager] 🎨 CSS: ${cssPath} - exists: ${fs.existsSync(cssPath)}`);
        console.log(`[StateManager] ⚡ JS: ${jsPath} - exists: ${fs.existsSync(jsPath)}`);
        
        let componentHtml = '';
        let componentCss = '';
        let componentJs = '';
        
        // Extract body content from component HTML
        if (fs.existsSync(htmlPath)) {
            const fullHtml = fs.readFileSync(htmlPath, 'utf8');
            console.log(`[StateManager] 📖 Read HTML file, length: ${fullHtml.length}`);
            
            const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (bodyMatch) {
                componentHtml = bodyMatch[1];
                console.log(`[StateManager] ✂️ Extracted body content, length: ${componentHtml.length}`);
            } else {
                componentHtml = fullHtml;
                console.log(`[StateManager] 📝 No body tag found, using full HTML`);
            }
        } else {
            componentHtml = `
                <div class="component-placeholder" style="padding: 2rem; text-align: center;">
                    <h2>Data Comparison - ${component}</h2>
                    <p>Component content will be loaded here.</p>
                    <p><strong>Debug:</strong> Component files not found at ${componentPath}</p>
                    <div style="margin-top: 1rem; padding: 1rem; background: #f1f5f9; border-radius: 8px;">
                        <p>Expected files:</p>
                        <ul style="text-align: left; display: inline-block;">
                            <li>${htmlPath}</li>
                            <li>${cssPath}</li>
                            <li>${jsPath}</li>
                        </ul>
                    </div>
                </div>
            `;
            console.log(`[StateManager] ⚠️ HTML file not found, using placeholder`);
        }
        
        // Read component CSS
        if (fs.existsSync(cssPath)) {
            componentCss = fs.readFileSync(cssPath, 'utf8');
            console.log(`[StateManager] 🎨 Read CSS file, length: ${componentCss.length}`);
        } else {
            console.log(`[StateManager] ⚠️ CSS file not found`);
        }
        
        // Read component JS
        if (fs.existsSync(jsPath)) {
            componentJs = fs.readFileSync(jsPath, 'utf8');
            console.log(`[StateManager] ⚡ Read JS file, length: ${componentJs.length}`);
            
            // Remove DOMContentLoaded wrappers since we handle initialization differently
            componentJs = componentJs.replace(/\/\/ Initialize when DOM is ready[\s\S]*?window\.addEventListener\(['"]beforeunload['"][\s\S]*?\}\);?\s*$/s, '');
            console.log(`[StateManager] 🔧 Processed JS file, final length: ${componentJs.length}`);
        } else {
            console.log(`[StateManager] ⚠️ JS file not found`);
        }
        
        // Build complete appView with shell integration
        const appViewHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Data Comparison - ${component}</title>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        /* ========================================
           SHELL THEME INHERITANCE
           ======================================== */
        ${this.getShellThemeCSS()}
        
        /* ========================================
           COMPONENT-SPECIFIC CSS
           ======================================== */
        ${componentCss}
    </style>
</head>
<body data-component="${component}" data-app="data-comparison" data-theme="light" id="app-body">
    <div class="app-container">
        ${componentHtml}
    </div>
    
    <script>
        console.log('[AppView] 🚀 Component ${component} script executing');
        
        /* ========================================
           SHELL COMMUNICATION FUNCTIONS
           ======================================== */
        ${this.getShellCommunicationJS()}
        
        /* ========================================
           COMPONENT-SPECIFIC JAVASCRIPT
           ======================================== */
        ${componentJs}
        
        // ========================================
        // INITIALIZATION
        // ========================================
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[AppView] 📋 DOMContentLoaded for component: ${component}');
            
            // Setup shell communication
            setupShellCommunication('${component}');
            
            // Initialize Lucide icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
                console.log('[AppView] 🎨 Lucide icons initialized');
            }
            
            // Component-specific initialization
            if ('${component}' === 'comparisonViewer') {
                try {
                    window.comparisonViewer = new ComparisonViewer();
                    console.log('[AppView] ✅ ComparisonViewer initialized successfully');
                } catch (error) {
                    console.error('[AppView] ❌ ComparisonViewer initialization failed:', error);
                }
            } else {
                const initFunctionName = 'init' + '${component}'.charAt(0).toUpperCase() + '${component}'.slice(1);
                if (typeof window[initFunctionName] === 'function') {
                    try {
                        window[initFunctionName]();
                        console.log('[AppView] ⚡ Component init function called:', initFunctionName);
                    } catch (error) {
                        console.error('[AppView] ❌ Component init failed:', error);
                    }
                }
            }
            
            // Notify shell that app is loaded
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'APP_LOADED',
                    data: { 
                        appName: 'Data Comparison - ${component}',
                        component: '${component}',
                        app: 'data-comparison',
                        version: '2.0.0'
                    }
                }, '*');
                console.log('[AppView] 📤 Notified shell that app is loaded');
            }
        });
        
        // Cleanup on beforeunload
        window.addEventListener('beforeunload', () => {
            if ('${component}' === 'comparisonViewer' && window.comparisonViewer) {
                window.comparisonViewer.destroy();
            }
        });
    </script>
</body>
</html>`;
        
        console.log(`[StateManager] ✅ Generated complete appView HTML, total length: ${appViewHtml.length}`);
        console.log(`[StateManager] 👀 HTML preview (first 200 chars):`);
        console.log(appViewHtml.substring(0, 200) + '...');
        
        return appViewHtml;
    }

    getShellThemeCSS() {
        return `
            /* Theme inheritance from shell */
            :root {
                /* Default fallback values if shell communication fails */
                --app-bg-primary: #ffffff;
                --app-bg-secondary: #f8fafc;
                --app-bg-tertiary: #f1f5f9;
                --app-text-primary: #1e293b;
                --app-text-secondary: #64748b;
                --app-text-tertiary: #94a3b8;
                --app-border: #e2e8f0;
                --app-border-hover: #cbd5e1;
                --app-accent: #3b82f6;
                --app-accent-hover: #2563eb;
                --app-success: #10b981;
                --app-warning: #f59e0b;
                --app-error: #ef4444;
                --app-transition: all 0.3s ease;
                --app-border-radius: 8px;
                --app-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                --app-shadow-lg: 0 8px 25px rgba(0, 0, 0, 0.15);
            }

            [data-theme="dark"] {
                --app-bg-primary: #0f172a;
                --app-bg-secondary: #1e293b;
                --app-bg-tertiary: #334155;
                --app-text-primary: #f8fafc;
                --app-text-secondary: #cbd5e1;
                --app-text-tertiary: #94a3b8;
                --app-border: #334155;
                --app-border-hover: #475569;
                --app-accent: #60a5fa;
                --app-accent-hover: #3b82f6;
                --app-success: #34d399;
                --app-warning: #fbbf24;
                --app-error: #f87171;
                --app-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                --app-shadow-lg: 0 8px 25px rgba(0, 0, 0, 0.4);
            }

            /* Base styles */
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                background: var(--app-bg-primary);
                color: var(--app-text-primary);
                line-height: 1.6;
                transition: var(--app-transition);
                margin: 0;
                padding: 0;
            }

            .app-container {
                min-height: 100vh;
                background: var(--app-bg-primary);
                transition: var(--app-transition);
            }

            /* Ensure component elements inherit theme */
            .option-card, .feature-card, .generator-state, .card, .summary-item {
                background: var(--app-bg-secondary) !important;
                border-color: var(--app-border) !important;
                color: var(--app-text-primary) !important;
            }

            .btn, button {
                background: var(--app-accent) !important;
                border-color: var(--app-accent) !important;
                color: white !important;
                transition: var(--app-transition) !important;
            }

            .btn:hover, button:hover {
                background: var(--app-accent-hover) !important;
                border-color: var(--app-accent-hover) !important;
            }

            .btn-secondary {
                background: var(--app-bg-secondary) !important;
                color: var(--app-text-primary) !important;
                border-color: var(--app-border) !important;
            }

            .btn-outline {
                background: transparent !important;
                color: var(--app-text-primary) !important;
                border-color: var(--app-border) !important;
            }

            input, select, textarea {
                background: var(--app-bg-primary) !important;
                border-color: var(--app-border) !important;
                color: var(--app-text-primary) !important;
            }

            .comparison-status-container, .comparison-viewer-container {
                background: var(--app-bg-primary) !important;
                color: var(--app-text-primary) !important;
            }

            .status-header, .viewer-header {
                border-color: var(--app-border) !important;
            }

            .diff-line, .diff-object {
                background: var(--app-bg-primary) !important;
                border-color: var(--app-border) !important;
                color: var(--app-text-primary) !important;
            }

            .error-section {
                background: var(--app-bg-secondary) !important;
                border-color: var(--app-error) !important;
                color: var(--app-text-primary) !important;
            }

            .error-message {
                background: var(--app-bg-tertiary) !important;
                border-color: var(--app-border) !important;
                color: var(--app-error) !important;
            }
        `;
    }

    getShellCommunicationJS() {
        return `
            // ========================================
            // SHELL COMMUNICATION SETUP
            // ========================================
            function setupShellCommunication(componentName) {
                console.log('[ShellComm] 🔗 Setting up communication for:', componentName);
                
                // Listen for theme updates from shell
                window.addEventListener('message', (event) => {
                    // Accept messages from parent (shell) or blob URLs
                    if (event.origin !== window.location.origin && !event.origin.startsWith('blob:')) {
                        return;
                    }
                    
                    const { type, theme, variables } = event.data;
                    
                    if (type === 'THEME_DATA' || type === 'THEME_CHANGED') {
                        console.log('[ShellComm] 🎨 Received theme data:', theme);
                        applyTheme(theme, variables);
                    }
                });
                
                // Request theme from shell
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'REQUEST_THEME' }, '*');
                    console.log('[ShellComm] 📤 Requested theme from shell');
                }
                
                // Global logging function for components
                window.logToShell = function(level, message) {
                    if (window.parent !== window) {
                        window.parent.postMessage({
                            type: 'ADD_LOG',
                            data: {
                                app: 'Data Comparison',
                                level: level,
                                message: message,
                                location: componentName,
                                timestamp: new Date().toISOString()
                            }
                        }, '*');
                    }
                    console.log(\`[\${level.toUpperCase()}] \${message}\`);
                };
                
                // Global state change function for components
                window.changeState = function(newComponent, data = {}) {
                    console.log('[ShellComm] 🔄 Changing state to:', newComponent);
                    
                    // Update state via API
                    fetch('/data-comparison/api/state/set', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ component: newComponent, data: data })
                    }).then(response => response.json())
                      .then(result => {
                          if (result.success) {
                              logToShell('info', \`State changed to \${newComponent}\`);
                              
                              // Navigate to new state
                              if (window.parent !== window) {
                                  window.parent.location.href = \`/data-comparison/\${newComponent === 'welcome' ? '' : newComponent}\`;
                              }
                          }
                      })
                      .catch(err => logToShell('error', \`State change failed: \${err.message}\`));
                };
                
                console.log('[ShellComm] ✅ Shell communication setup complete');
            }
            
            // ========================================
            // THEME APPLICATION
            // ========================================
            function applyTheme(theme, variables) {
                console.log('[ShellComm] 🎨 Applying theme:', theme, 'Variables:', variables);
                
                // Apply theme attribute to both html and body
                document.documentElement.setAttribute('data-theme', theme);
                document.body.setAttribute('data-theme', theme);
                
                // Apply custom CSS variables if provided
                if (variables) {
                    const root = document.documentElement;
                    let appliedCount = 0;
                    
                    Object.entries(variables).forEach(([key, value]) => {
                        if (value && value.trim()) {
                            root.style.setProperty(\`--app-\${key}\`, value.trim());
                            appliedCount++;
                        }
                    });
                    
                    console.log(\`[ShellComm] ✅ Applied \${appliedCount} theme variables\`);
                } else {
                    console.log('[ShellComm] ⚠️ No theme variables provided, using CSS defaults');
                }
                
                // Force repaint for immediate visual update
                document.body.style.display = 'none';
                document.body.offsetHeight; // Trigger reflow
                document.body.style.display = '';
                
                console.log(\`[ShellComm] 🎨 Theme \${theme} applied successfully\`);
            }
        `;
    }
}

console.log('[StateManager] 🏗️ Creating DataComparisonStateManager instance');
module.exports = new DataComparisonStateManager();