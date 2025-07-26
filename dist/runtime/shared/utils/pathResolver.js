const path = require('path');
const fs = require('fs');

class PathResolver {
  constructor() {
    // Check if we're running in bundled mode
    this.isBundled = process.argv[1]?.includes('server-bundle.js') || 
                     process.env.CPQ_BUNDLED === 'true';
    
    // Extension root can be passed via environment or detected
    this.extensionRoot = process.env.EXTENSION_ROOT || this.findExtensionRoot();
    this.runtimeDir = this.isBundled ? path.join(this.extensionRoot, 'runtime') : this.extensionRoot;
    
    console.log('[PathResolver] Initialized:', {
      isBundled: this.isBundled,
      extensionRoot: this.extensionRoot,
      runtimeDir: this.runtimeDir
    });
  }

  findExtensionRoot() {
    // Start from the current module's directory
    let dir = __dirname;
    
    // In bundled mode, start from process.cwd()
    if (this.isBundled) {
      dir = process.cwd();
    }
    
    // Look for package.json to find the root
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
          if (pkg.name === 'cpq-toolset-v3') {
            return dir;
          }
        } catch (e) {
          // Continue searching if JSON parse fails
        }
      }
      dir = path.dirname(dir);
    }
    
    // Fallback to current working directory
    return process.cwd();
  }

  // Core resolution method
  resolve(...paths) {
    return path.join(this.extensionRoot, ...paths);
  }

  // Resolve runtime paths (different in bundled vs dev mode)
  resolveRuntime(...paths) {
    if (this.isBundled) {
      return path.join(this.runtimeDir, ...paths);
    }
    return this.resolve(...paths);
  }

  // Specific resolvers for different resource types
  getAppPath(appName) {
    return this.resolveRuntime('apps', appName);
  }

  getComponentPath(app, component, file) {
    return this.resolveRuntime('apps', app, 'components', component, file);
  }

  getWorkerPath(app, workerName) {
    return this.resolveRuntime('apps', app, 'worker', workerName);
  }

  getPythonScript(app, scriptName) {
    return this.resolveRuntime('apps', app, 'python', scriptName);
  }

  getStoragePath(app, ...paths) {
    return this.resolveRuntime('apps', app, 'storage', ...paths);
  }

  getSharedModule(...paths) {
    return this.resolveRuntime('shared', ...paths);
  }

  getStaticAsset(app, ...paths) {
    return this.resolveRuntime('apps', app, 'static', ...paths);
  }

  // UI-specific paths
  getUIPath(type, ...paths) {
    return this.resolveRuntime('shared', 'UI', type, ...paths);
  }

  // Check if a path exists
  exists(resolveFn, ...args) {
    const resolvedPath = resolveFn.call(this, ...args);
    return fs.existsSync(resolvedPath);
  }

  // Get all available apps
  getAvailableApps() {
    const appsDir = this.resolveRuntime('apps');
    if (!fs.existsSync(appsDir)) {
      return [];
    }
    
    return fs.readdirSync(appsDir)
      .filter(name => {
        const appPath = path.join(appsDir, name);
        return fs.statSync(appPath).isDirectory() && 
               fs.existsSync(path.join(appPath, 'index.js'));
      });
  }

  // Create directory if it doesn't exist
  ensureDir(resolveFn, ...args) {
    const resolvedPath = resolveFn.call(this, ...args);
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    return resolvedPath;
  }

  // Read file with proper path resolution
  readFile(resolveFn, ...args) {
    const resolvedPath = resolveFn.call(this, ...args);
    return fs.readFileSync(resolvedPath, 'utf8');
  }

  // Write file with proper path resolution
  writeFile(resolveFn, pathArgs, content) {
    const resolvedPath = resolveFn.call(this, ...pathArgs);
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, content);
    return resolvedPath;
  }
}

// Singleton instance
let instance = null;

module.exports = {
  PathResolver,
  getInstance: () => {
    if (!instance) {
      instance = new PathResolver();
    }
    return instance;
  },
  // Convenience methods
  resolve: (...paths) => {
    return module.exports.getInstance().resolve(...paths);
  },
  resolveRuntime: (...paths) => {
    return module.exports.getInstance().resolveRuntime(...paths);
  }
};