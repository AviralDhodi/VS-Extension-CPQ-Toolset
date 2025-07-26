// Permissions Analyser State Management
const { logger } = require("../../../shared/utils/logger");

class PermissionsAnalyserState {
    constructor() {
        this.currentComponent = 'welcome';
        this.componentStates = {};
        this.extractionJobs = new Map();
        this.comparisonJobs = new Map();
        this.activeConfig = null;
    }

    // Component state management
    getCurrentComponent() {
        return this.currentComponent;
    }

    setCurrentComponent(component) {
        logger.info(`State: Switching to component ${component}`);
        this.currentComponent = component;
    }

    getComponentState(component) {
        return this.componentStates[component] || {};
    }

    setComponentState(component, state) {
        this.componentStates[component] = state;
    }

    updateComponentState(component, updates) {
        this.componentStates[component] = {
            ...this.componentStates[component],
            ...updates
        };
    }

    // Configuration management
    setActiveConfig(config) {
        this.activeConfig = config;
    }

    getActiveConfig() {
        return this.activeConfig;
    }

    // Extraction job management
    setExtractionStatus(extractionId, status) {
        this.extractionJobs.set(extractionId, {
            ...this.extractionJobs.get(extractionId),
            ...status,
            lastUpdated: new Date().toISOString()
        });
    }

    getExtractionStatus(extractionId) {
        return this.extractionJobs.get(extractionId);
    }

    updateExtractionProgress(extractionId, progress) {
        const current = this.extractionJobs.get(extractionId) || {};
        this.extractionJobs.set(extractionId, {
            ...current,
            progress: progress,
            lastUpdated: new Date().toISOString()
        });
    }

    // Comparison job management
    setComparisonStatus(comparisonId, status) {
        this.comparisonJobs.set(comparisonId, {
            ...this.comparisonJobs.get(comparisonId),
            ...status,
            lastUpdated: new Date().toISOString()
        });
    }

    getComparisonStatus(comparisonId) {
        return this.comparisonJobs.get(comparisonId);
    }

    // Get current state snapshot
    getCurrentState() {
        return {
            currentComponent: this.currentComponent,
            componentStates: this.componentStates,
            activeConfig: this.activeConfig,
            extractionJobs: Array.from(this.extractionJobs.entries()).map(([id, job]) => ({
                id,
                ...job
            })),
            comparisonJobs: Array.from(this.comparisonJobs.entries()).map(([id, job]) => ({
                id,
                ...job
            }))
        };
    }

    // Component URLs (V3 pattern - direct routing)
    getComponentUrl(component) {
        const componentUrls = {
            'welcome': '',
            'config-generator': 'config-generator',
            'permissions-viewer': 'viewer'
        };
        const route = componentUrls[component] || '';
        return `/permissions-analyser/${route}`;
    }

    // Reset state
    reset() {
        this.currentComponent = 'welcome';
        this.componentStates = {};
        this.activeConfig = null;
        logger.info('State: Reset to initial state');
    }
}

// Create singleton instance
const state = new PermissionsAnalyserState();

module.exports = state;