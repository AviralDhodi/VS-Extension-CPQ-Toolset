// scripts/check-dependencies.js
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

class DependencyChecker {
    constructor() {
        this.results = {
            node: { required: true, status: 'unknown' },
            npm: { required: true, status: 'unknown' },
            python: { required: false, status: 'unknown' },
            sfdx: { required: true, status: 'unknown' }
        };
    }

    async checkNode() {
        try {
            const { stdout } = await execAsync('node --version');
            const version = stdout.trim();
            this.results.node = {
                required: true,
                status: 'available',
                version: version,
                message: `Node.js ${version} is available`
            };
        } catch (error) {
            this.results.node = {
                required: true,
                status: 'missing',
                message: 'Node.js is not installed or not in PATH'
            };
        }
    }

    async checkNpm() {
        try {
            const { stdout } = await execAsync('npm --version');
            const version = stdout.trim();
            this.results.npm = {
                required: true,
                status: 'available',
                version: version,
                message: `npm ${version} is available`
            };
        } catch (error) {
            this.results.npm = {
                required: true,
                status: 'missing',
                message: 'npm is not installed or not in PATH'
            };
        }
    }

    async checkPython() {
        try {
            // Try python3 first, then python
            const commands = ['python3 --version', 'python --version'];
            
            for (const cmd of commands) {
                try {
                    const { stdout } = await execAsync(cmd);
                    if (stdout.includes('Python 3.')) {
                        const version = stdout.trim();
                        const pythonCmd = cmd.split(' ')[0];
                        this.results.python = {
                            required: false,
                            status: 'available',
                            version: version,
                            command: pythonCmd,
                            message: `${version} is available via '${pythonCmd}' command`
                        };
                        return;
                    }
                } catch (cmdError) {
                    continue;
                }
            }
            
            this.results.python = {
                required: false,
                status: 'missing',
                message: 'Python 3 not found in PATH. Large dataset comparisons will use Node.js engine (slower performance)'
            };
            
        } catch (error) {
            this.results.python = {
                required: false,
                status: 'missing',
                message: 'Python 3 not available. Large dataset comparisons will use Node.js engine (slower performance)'
            };
        }
    }

    async checkSFDX() {
        try {
            // Try sf first (new CLI), then sfdx (legacy)
            const commands = ['sf --version', 'sfdx --version'];
            
            for (const cmd of commands) {
                try {
                    const { stdout } = await execAsync(cmd);
                    const version = stdout.trim();
                    const sfdxCmd = cmd.split(' ')[0];
                    this.results.sfdx = {
                        required: true,
                        status: 'available',
                        version: version,
                        command: sfdxCmd,
                        message: `Salesforce CLI is available via '${sfdxCmd}' command`
                    };
                    return;
                } catch (cmdError) {
                    continue;
                }
            }
            
            this.results.sfdx = {
                required: true,
                status: 'missing',
                message: 'Salesforce CLI (sf/sfdx) not found in PATH. Please install Salesforce CLI.'
            };
            
        } catch (error) {
            this.results.sfdx = {
                required: true,
                status: 'missing',
                message: 'Salesforce CLI not available. Please install Salesforce CLI.'
            };
        }
    }

    async checkAll() {
        console.log('🔍 Checking system dependencies...\n');
        
        await Promise.all([
            this.checkNode(),
            this.checkNpm(),
            this.checkPython(),
            this.checkSFDX()
        ]);
        
        return this.results;
    }

    printResults() {
        console.log('📋 Dependency Check Results:\n');
        
        let hasErrors = false;
        let hasWarnings = false;
        
        Object.entries(this.results).forEach(([dep, result]) => {
            const icon = result.status === 'available' ? '✅' : 
                        result.required ? '❌' : '⚠️';
            
            const status = result.status === 'available' ? 'AVAILABLE' :
                          result.required ? 'MISSING' : 'OPTIONAL';
            
            console.log(`${icon} ${dep.toUpperCase()}: ${status}`);
            console.log(`   ${result.message}`);
            if (result.version) {
                console.log(`   Version: ${result.version}`);
            }
            console.log('');
            
            if (result.required && result.status !== 'available') {
                hasErrors = true;
            } else if (!result.required && result.status !== 'available') {
                hasWarnings = true;
            }
        });
        
        if (hasErrors) {
            console.log('❌ ERRORS: Some required dependencies are missing.');
            console.log('   Please install missing dependencies before running the extension.\n');
            return false;
        } else if (hasWarnings) {
            console.log('⚠️  WARNINGS: Some optional dependencies are missing.');
            console.log('   The extension will work but with reduced functionality.\n');
            return true;
        } else {
            console.log('✅ SUCCESS: All dependencies are available!\n');
            return true;
        }
    }

    async saveResults() {
        try {
            const resultPath = path.join(__dirname, '..', 'tmp', 'dependency-check.json');
            
            // Ensure tmp directory exists
            const tmpDir = path.dirname(resultPath);
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }
            
            const output = {
                timestamp: new Date().toISOString(),
                results: this.results,
                summary: {
                    requiredMissing: Object.values(this.results).filter(r => r.required && r.status !== 'available').length,
                    optionalMissing: Object.values(this.results).filter(r => !r.required && r.status !== 'available').length,
                    allAvailable: Object.values(this.results).every(r => r.status === 'available'),
                    canRun: Object.values(this.results).every(r => !r.required || r.status === 'available')
                }
            };
            
            fs.writeFileSync(resultPath, JSON.stringify(output, null, 2));
            console.log(`💾 Results saved to: ${resultPath}\n`);
            
        } catch (error) {
            console.log(`⚠️  Could not save results: ${error.message}\n`);
        }
    }
}

async function main() {
    const checker = new DependencyChecker();
    
    try {
        await checker.checkAll();
        const success = checker.printResults();
        await checker.saveResults();
        
        // Exit with appropriate code
        if (!success && process.argv.includes('--strict')) {
            process.exit(1);
        } else {
            process.exit(0);
        }
        
    } catch (error) {
        console.error('❌ Dependency check failed:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = DependencyChecker;