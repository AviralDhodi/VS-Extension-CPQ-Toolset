const { getInstance: getSFDXRunner } = require('./sfdxRunner');

class SFDXCommands {
    constructor(logger) {
        this.logger = logger;
        this.sfdx = getSFDXRunner();
    }
    
    async listOrgs() {
        const result = await this.sfdx.executeCommand('org list --json');
        const data = JSON.parse(result.stdout);
        return data.result?.nonScratchOrgs || [];
    }
}

module.exports = { SFDXCommands };