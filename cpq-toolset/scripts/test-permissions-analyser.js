
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { EnhancedPermissionsComparison } = require('../apps/permissions-analyser/python/permissions_comparison_enhanced');

describe('Permissions Analyser', function() {
    this.timeout(60000); // 60 seconds timeout for the whole suite

    const comparisonId = `test-${Date.now()}`;
    const dataPath = path.join(__dirname, '..', 'apps', 'permissions-analyser', 'storage', 'data-extract', comparisonId);
    const outputPath = path.join(__dirname, '..', 'apps', 'permissions-analyser', 'storage', 'results', `${comparisonId}.json`);
    const configPath = path.join(dataPath, 'config.json');

    before(function() {
        // Create dummy data for testing
        fs.mkdirSync(dataPath, { recursive: true });
        fs.mkdirSync(path.join(dataPath, 'org1', 'unpackaged', 'profiles'), { recursive: true });
        fs.mkdirSync(path.join(dataPath, 'org2', 'unpackaged', 'profiles'), { recursive: true });

        // Create dummy config
        const config = {
            "selectedPermissionOptions": {
                "Profile": {
                    "objectPermissions": true,
                    "fieldPermissions": true
                }
            }
        };
        fs.writeFileSync(configPath, JSON.stringify(config));

        // Create dummy profile files
        const profile1Org1 = `
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <object>Account</object>
        <allowCreate>true</allowCreate>
        <allowRead>true</allowRead>
    </objectPermissions>
    <fieldPermissions>
        <field>Account.Name</field>
        <editable>true</editable>
        <readable>true</readable>
    </fieldPermissions>
</Profile>
        `;
        const profile1Org2 = `
<Profile xmlns="http://soap.sforce.com/2006/04/metadata">
    <objectPermissions>
        <object>Account</object>
        <allowCreate>false</allowCreate>
        <allowRead>true</allowRead>
    </objectPermissions>
    <fieldPermissions>
        <field>Account.Name</field>
        <editable>false</editable>
        <readable>true</readable>
    </fieldPermissions>
</Profile>
        `;
        fs.writeFileSync(path.join(dataPath, 'org1', 'unpackaged', 'profiles', 'Admin.profile-meta.xml'), profile1Org1);
        fs.writeFileSync(path.join(dataPath, 'org2', 'unpackaged', 'profiles', 'Admin.profile-meta.xml'), profile1Org2);
    });

    after(function() {
        // Clean up dummy data
        fs.rmdirSync(dataPath, { recursive: true });
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
    });

    it('should correctly compare profile permissions', async function() {
        const comparison = new EnhancedPermissionsComparison(dataPath, outputPath, comparisonId, configPath);
        await comparison.compare_all();

        const results = JSON.parse(fs.readFileSync(outputPath, 'utf8'));

        assert.strictEqual(results.details.profiles.common_profiles[0], 'Admin');
        assert.ok(results.details.profiles.profile_differences['Admin']);
        assert.ok(results.details.profiles.profile_differences['Admin'].objectPermissions['Account']);
        assert.ok(results.details.profiles.profile_differences['Admin'].fieldPermissions['Account.Name']);
    });
});
