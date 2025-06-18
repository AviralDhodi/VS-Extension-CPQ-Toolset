// apps/data-comparison/comparison/controller.js

const { spawn } = require('child_process');
const { createLogger } = require('../../../shared/logging/logger');
const path = require('path');
const fs = require('fs');
const pythonCommand = path.resolve(__dirname, '../../../py/python.exe');



class ComparisonController {
    constructor() {
        this.logger = createLogger({ appName: 'ComparisonController' });
    }


    async processComparisonWithPython(comparisonId, destinationDir) {
        this.logger.info(`Starting Python comparison for ${comparisonId}`);
        const scriptPath = path.join(__dirname, '../python/multi_org_comparison.py');
        const outputDir = path.join(destinationDir, 'comparison_results');

        const args = [
            scriptPath,
            destinationDir,
            '--chunk-size', '50000',
            '--output-dir', outputDir
            // You can add more dynamic args like --exclude-fields, --objects etc.
        ];
        return new Promise((resolve, reject) => {

            this.logger.info('Running Python command:', {
                command: pythonCommand,
                args: args
            }); 

            const pythonProcess = spawn(pythonCommand, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, PYTHONUNBUFFERED: '1' }
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                this.logger.info(`Python stdout: ${output.trim()}`);

                if (global.comparisonStates && global.comparisonStates[comparisonId]) {
                    if (output.includes('Completed comparison for')) {
                        global.comparisonStates[comparisonId].progress.completedObjects++;
                    }
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                this.logger.warn(`Python stderr: ${output.trim()}`);
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    this.logger.info(`Python comparison completed successfully for ${comparisonId}`);
                    resolve({ success: true, engine: 'python', stdout, stderr });
                } else {
                    this.logger.error(`Python comparison failed with code ${code} for ${comparisonId}`);
                    reject(new Error(`Python process exited with code ${code}. Stderr: ${stderr}`));
                }
            });

            pythonProcess.on('error', (error) => {
                this.logger.error(`Python process error for ${comparisonId}:`, error);
                reject(error);
            });

            setTimeout(() => {
                if (!pythonProcess.killed) {
                    pythonProcess.kill();
                    reject(new Error('Python comparison timed out'));
                }
            }, 30 * 60 * 1000);
        });
    }

    async processComparison( comparisonId,config,configPath) {
        try {
                const configDir = path.dirname(configPath);
                this.logger.info(`Resolved config directory: ${configDir}`);

                const files = fs.readdirSync(configDir);
                this.logger.info(`Files in config directory: ${files.join(', ')}`);

                const matchingFile = files.find(f => f.match(/^config_.*\.json$/));
                if (!matchingFile) {
                this.logger.info('No matching config file found (config_*.json)');
                return;
                }
                this.logger.info(`Found matching config file: ${matchingFile}`);

                const fullSourcePath = path.join(configDir, matchingFile);
                this.logger.info(`Full source path: ${fullSourcePath}`);

                const destinationDir = path.resolve(__dirname, '../data-extract', comparisonId);
                this.logger.info(`Destination directory: ${destinationDir}`);

                const destinationPath = path.join(destinationDir, matchingFile);
                this.logger.info(`Final destination path: ${destinationPath}`);

                if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
                this.logger.info(`Created destination directory: ${destinationDir}`);
            }

        fs.copyFileSync(fullSourcePath, destinationPath);
        this.logger.info(`Successfully copied config file to: ${destinationPath}`);
        await this.processComparisonWithPython(comparisonId,destinationDir);
        } 
            catch (pythonError) {
                    
                this.logger.error(`Python comparison failed, falling back:`, pythonError);
            
            }                    
        }
}


module.exports = {
  ComparisonController
};
