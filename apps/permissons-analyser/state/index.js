// apps/upcoming-app/state/index.js
const path = require('path');
const fs = require('fs');

class UpcomingAppStateManager {
    constructor() {
        this.currentState = {
            app: 'upcoming-app',
            component: 'welcome',
            data: {
                features: [
                    { id: 'analytics', progress: 25, status: 'active' },
                    { id: 'testing', progress: 15, status: 'active' },
                    { id: 'performance', progress: 10, status: 'planned' },
                    { id: 'ai', progress: 5, status: 'planned' }
                ]
            },
            timestamp: new Date().toISOString()
        };
    }

    setState(component, data = {}) {
        this.currentState = {
            app: 'upcoming-app',
            component: component,
            data: { ...this.currentState.data, ...data },
            timestamp: new Date().toISOString()
        };
        
        console.log(`[UpcomingApp] State set to: ${component}`);
        return this.currentState;
    }

    getState() {
        return this.currentState;
    }

    getDisplayName() {
        const names = {
            'welcome': 'Upcoming App - Preview',
            'features': 'Upcoming App - Features',
            'roadmap': 'Upcoming App - Roadmap',
            'analytics': 'Upcoming App - Analytics Preview',
            'testing': 'Upcoming App - Testing Framework'
        };
        return names[this.currentState.component] || `Upcoming App - ${this.currentState.component}`;
    }

    getStatus() {
        return 'development';
    }

    async generateAppView(component, data = {}) {
        const projectRoot = process.cwd();
        const componentPath = path.join(projectRoot, 'apps', 'upcoming-app', 'components', component);
        
        console.log(`[UpcomingApp] Generating appView for: ${component}`);
        
        // Read component files
        const htmlPath = path.join(componentPath, 'index.html');
        const cssPath = path.join(componentPath, 'index.css');
        const jsPath = path.join(componentPath, 'index.js');
        
        let componentHtml = '';
        let componentCss = '';
        let componentJs = '';
        
        if (fs.existsSync(htmlPath)) {
            const fullHtml = fs.readFileSync(htmlPath, 'utf8');
            const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            componentHtml = bodyMatch ? bodyMatch[1] : fullHtml;
        } else {
            componentHtml = `<div class="component-placeholder">
                <h2>Upcoming App - ${component}</h2>
                <p>This feature is in development.</p>
            </div>`;
        }
        
        if (fs.existsSync(cssPath)) {
            componentCss = fs.readFileSync(cssPath, 'utf8');
        }
        
        if (fs.existsSync(jsPath)) {
            componentJs = fs.readFileSync(jsPath, 'utf8');
            componentJs = componentJs.replace(/document\.addEventListener\(['"]DOMContentLoaded['"],.*?\}\);?/gs, '');
        }
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upcoming App - ${component}</title>
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        ${this.getShellThemeCSS()}
        ${componentCss}
    </style>
</head>
<body data-component="${component}" data-app="upcoming-app">
    <div class="app-container">
        ${componentHtml}
    </div>
    
    <script>
        ${this.getShellCommunicationJS()}
        ${componentJs}
        
        document.addEventListener('DOMContentLoaded', () => {
            console.log('Upcoming App component ${component} initialized');
            setupShellCommunication('${component}');
            
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
            
            if (typeof init${component.charAt(0).toUpperCase() + component.slice(1)} === 'function') {
                init${component.charAt(0).toUpperCase() + component.slice(1)}();
            }
            
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'APP_LOADED',
                    data: { 
                        appName: 'Upcoming App - ${component}',
                        component: '${component}',
                        version: '1.0.0-beta'
                    }
                }, '*');
            }
        });
    </script>
</body>
</html>`;
    }

    getShellThemeCSS() {
        return `
            :root {
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

            * { margin: 0; padding: 0; box-sizing: border-box; }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                background: var(--app-bg-primary);
                color: var(--app-text-primary);
                line-height: 1.6;
                transition: var(--app-transition);
            }

            .app-container {
                min-height: 100vh;
                background: var(--app-bg-primary);
                transition: var(--app-transition);
            }

            .feature-card, .action-card, .timeline-item {
                background: var(--app-bg-secondary) !important;
                border-color: var(--app-border) !important;
                color: var(--app-text-primary) !important;
            }

            .action-button, button {
                background: var(--app-accent) !important;
                color: white !important;
                transition: var(--app-transition) !important;
            }

            .action-button:hover, button:hover {
                background: var(--app-accent-hover) !important;
            }
        `;
    }

    getShellCommunicationJS() {
        return `
            function setupShellCommunication(componentName) {
                window.addEventListener('message', (event) => {
                    if (event.origin !== window.location.origin && !event.origin.startsWith('blob:')) return;
                    
                    const { type, theme, variables } = event.data;
                    
                    if (type === 'THEME_DATA' || type === 'THEME_CHANGED') {
                        applyTheme(theme, variables);
                    }
                });
                
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'REQUEST_THEME' }, '*');
                }
                
                window.logToShell = function(level, message) {
                    if (window.parent !== window) {
                        window.parent.postMessage({
                            type: 'ADD_LOG',
                            data: {
                                app: 'Upcoming App',
                                level: level,
                                message: message,
                                location: componentName,
                                timestamp: new Date().toISOString()
                            }
                        }, '*');
                    }
                };
                
                window.changeState = function(newComponent, data = {}) {
                    fetch('/upcoming-app/api/state/set', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ component: newComponent, data: data })
                    }).then(response => response.json())
                      .then(result => {
                          if (result.success) {
                              logToShell('info', \`State changed to \${newComponent}\`);
                              if (window.parent !== window) {
                                  window.parent.postMessage({
                                      type: 'REQUEST_APPVIEW_GENERATION',
                                      data: { app: 'upcoming-app', state: newComponent }
                                  }, '*');
                              }
                          }
                      });
                };
            }
            
            function applyTheme(theme, variables) {
                document.body.setAttribute('data-theme', theme);
                
                if (variables) {
                    const root = document.documentElement;
                    Object.entries(variables).forEach(([key, value]) => {
                        if (value && value.trim()) {
                            root.style.setProperty(\`--app-\${key}\`, value.trim());
                        }
                    });
                }
                
                document.body.style.display = 'none';
                document.body.offsetHeight;
                document.body.style.display = '';
            }
        `;
    }
}

module.exports = new UpcomingAppStateManager();

// apps/upcoming-app/routes/index.js - Complete routes
const express = require("express");
const path = require("path");
const fs = require("fs");
const stateManager = require("../state");

const router = express.Router();
const projectRoot = process.cwd();

// Main routes
router.get("/", async (req, res) => {
    stateManager.setState('welcome');
    const shellPath = path.join(projectRoot, "shared", "UI", "appView", "index.html");
    let shellHtml = fs.readFileSync(shellPath, 'utf8');
    shellHtml = shellHtml.replace('src="/"', 'src="/app/upcoming-app-welcome-ui"');
    res.send(shellHtml);
});

router.get("/features", async (req, res) => {
    stateManager.setState('features');
    const shellPath = path.join(projectRoot, "shared", "UI", "appView", "index.html");
    let shellHtml = fs.readFileSync(shellPath, 'utf8');
    shellHtml = shellHtml.replace('src="/"', 'src="/app/upcoming-app-features-ui"');
    res.send(shellHtml);
});

router.get("/roadmap", async (req, res) => {
    stateManager.setState('roadmap');
    const shellPath = path.join(projectRoot, "shared", "UI", "appView", "index.html");
    let shellHtml = fs.readFileSync(shellPath, 'utf8');
    shellHtml = shellHtml.replace('src="/"', 'src="/app/upcoming-app-roadmap-ui"');
    res.send(shellHtml);
});

// Dynamic appView generation
router.get("/app/:appStateUi", async (req, res) => {
    const { appStateUi } = req.params;
    const parts = appStateUi.split('-');
    
    if (parts.length !== 3 || parts[2] !== 'ui') {
        return res.status(404).send('Invalid format');
    }
    
    const [app, component] = parts;
    
    if (app !== 'upcoming') {
        return res.status(404).send('Invalid app');
    }
    
    try {
        const appViewHtml = await stateManager.generateAppView(component);
        res.setHeader('Content-Type', 'text/html');
        res.send(appViewHtml);
    } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
    }
});

// State API
router.get("/api/state", (req, res) => {
    res.json({
        success: true,
        state: stateManager.getState(),
        displayName: stateManager.getDisplayName(),
        status: stateManager.getStatus()
    });
});

router.post("/api/state/set", (req, res) => {
    const { component, data } = req.body;
    const newState = stateManager.setState(component, data);
    res.json({ success: true, state: newState });
});

router.get("/health", (req, res) => {
    res.json({
        app: "upcoming-app", 
        status: "development",
        currentState: stateManager.getState(),
        timestamp: new Date().toISOString()
    });
});

module.exports = router;