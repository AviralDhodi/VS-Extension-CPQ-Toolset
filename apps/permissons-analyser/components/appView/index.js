// apps/upcoming-app/state/index.js - Upcoming App State Manager
class UpcomingAppState {
    constructor() {
        this.currentComponent = 'welcome';
        this.appData = {
            features: [
                { id: 'analytics', progress: 25, status: 'active' },
                { id: 'testing', progress: 15, status: 'active' },
                { id: 'performance', progress: 10, status: 'planned' },
                { id: 'ai', progress: 5, status: 'planned' }
            ],
            developmentPhase: 'core-development'
        };
        this.listeners = [];
    }

    setState(component, data = {}) {
        const previousComponent = this.currentComponent;
        this.currentComponent = component;
        this.appData = { ...this.appData, ...data };
        
        this.notifyShell(component, data);
        
        this.listeners.forEach(listener => {
            listener({
                component,
                data,
                previousComponent,
                appData: this.appData
            });
        });
        
        console.log(`[UpcomingApp] State: ${previousComponent} → ${component}`);
    }

    notifyShell(component, data) {
        fetch('/api/shell/update-iframe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app: 'upcoming-app',
                component: component,
                data: data,
                timestamp: new Date().toISOString()
            })
        }).catch(err => console.error('Failed to notify shell:', err));
    }

    getCurrentState() {
        return {
            component: this.currentComponent,
            data: this.appData,
            displayName: this.getDisplayName(),
            status: this.getStatus()
        };
    }

    getDisplayName() {
        const names = {
            'welcome': 'Upcoming App - Preview',
            'features': 'Upcoming App - Features',
            'roadmap': 'Upcoming App - Roadmap',
            'analytics': 'Upcoming App - Analytics Preview',
            'testing': 'Upcoming App - Testing Framework'
        };
        return names[this.currentComponent] || 'Upcoming App';
    }

    getStatus() {
        return 'development'; // Always in development
    }

    // State transitions
    goToWelcome() {
        this.setState('welcome');
    }

    goToFeatures() {
        this.setState('features');
    }

    goToRoadmap() {
        this.setState('roadmap');
    }

    goToAnalytics() {
        this.setState('analytics');
    }

    goToTesting() {
        this.setState('testing');
    }

    updateFeatureProgress(featureId, progress) {
        const features = [...this.appData.features];
        const feature = features.find(f => f.id === featureId);
        if (feature) {
            feature.progress = progress;
            this.setState(this.currentComponent, { features });
        }
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            const index = this.listeners.indexOf(listener);
            if (index > -1) this.listeners.splice(index, 1);
        };
    }
}

const upcomingAppState = new UpcomingAppState();
module.exports = upcomingAppState;

// apps/upcoming-app/routes/index.js - UPDATED with state integration
const express = require("express");
const path = require("path");
const fs = require("fs");
const upcomingAppState = require("../state");

const router = express.Router();
const projectRoot = process.cwd();
const appViewPath = path.join(projectRoot, "apps", "upcoming-app", "components", "appView");

// ========================================
// STATE MANAGEMENT ROUTES
// ========================================

router.get("/api/state", (req, res) => {
    const state = upcomingAppState.getCurrentState();
    res.json({
        success: true,
        state: state,
        timestamp: new Date().toISOString()
    });
});

router.post("/api/state", (req, res) => {
    const { component, data } = req.body;
    
    try {
        upcomingAppState.setState(component, data);
        res.json({
            success: true,
            state: upcomingAppState.getCurrentState(),
            message: `State updated to ${component}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Specific transitions
router.post("/api/state/welcome", (req, res) => {
    upcomingAppState.goToWelcome();
    res.json({ success: true, state: upcomingAppState.getCurrentState() });
});

router.post("/api/state/features", (req, res) => {
    upcomingAppState.goToFeatures();
    res.json({ success: true, state: upcomingAppState.getCurrentState() });
});

router.post("/api/state/roadmap", (req, res) => {
    upcomingAppState.goToRoadmap();
    res.json({ success: true, state: upcomingAppState.getCurrentState() });
});

// ========================================
// DYNAMIC APPVIEW ROUTES
// ========================================

router.get("/", (req, res) => {
    const shellPath = path.join(projectRoot, "shared", "UI", "appView", "index.html");
    
    if (fs.existsSync(shellPath)) {
        let shellHtml = fs.readFileSync(shellPath, 'utf8');
        
        const currentState = upcomingAppState.getCurrentState();
        const iframeSrc = `/app/upcoming-app?component=${currentState.component}`;
        
        shellHtml = shellHtml.replace(
            'src="/"', 
            `src="${iframeSrc}"`
        );
        
        console.log(` Serving upcoming-app shell with iframe: ${iframeSrc}`);
        res.send(shellHtml);
    } else {
        res.status(404).send('Extension shell not found');
    }
});

router.get("/app", (req, res) => {
    const component = req.query.component || 'welcome';
    const appViewPath = path.join(projectRoot, "apps", "upcoming-app", "components", "appView", "index.html");
    
    if (fs.existsSync(appViewPath)) {
        let appViewHtml = fs.readFileSync(appViewPath, 'utf8');
        
        const currentState = upcomingAppState.getCurrentState();
        const stateScript = `
            <script>
                window.APP_STATE = ${JSON.stringify(currentState)};
                window.INITIAL_COMPONENT = '${component}';
            </script>
        `;
        
        appViewHtml = appViewHtml.replace('</head>', `${stateScript}</head>`);
        
        console.log(` Serving upcoming-app appView for: ${component}`);
        res.send(appViewHtml);
    } else {
        res.status(404).send(`AppView not found for component: ${component}`);
    }
});

router.get("/health", (req, res) => {
    const currentState = upcomingAppState.getCurrentState();
    res.json({
        app: "upcoming-app",
        status: "development",
        currentState: currentState,
        timestamp: new Date().toISOString(),
        version: "1.0.0-beta"
    });
});

module.exports = router;