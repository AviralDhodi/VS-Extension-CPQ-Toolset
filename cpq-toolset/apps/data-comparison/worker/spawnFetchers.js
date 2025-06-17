const { fork } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../../../shared/logging/logger').createLogger({ appName: 'DataComparison-Spawn' });

function splitArrayIntoChunks(array, chunks) {
    const result = [];
    const chunkSize = Math.ceil(array.length / chunks);
    for (let i = 0; i < array.length; i += chunkSize) {
        result.push(array.slice(i, i + chunkSize));
    }
    return result;
}

function isBufferDirEmpty(bufferDir) {
    if (!fs.existsSync(bufferDir)) return true;
    const files = fs.readdirSync(bufferDir);
    return files.filter(f => f.endsWith('.jsonl') || f.endsWith('.lock')).length === 0;
}

function waitForBuffersToClear(bufferDir, timeout = 30000, interval = 500) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (isBufferDirEmpty(bufferDir)) return resolve();
            if (Date.now() - start > timeout) {
                return reject(new Error('Timeout waiting for buffers to clear'));
            }
            setTimeout(check, interval);
        };
        check();
    });
}

async function spawnFetchers(config, comparisonId, inputNumberOfProcesses) {
    const numberOfOrgs = config.orgs.length;
    const numberOfFetchers = inputNumberOfProcesses || numberOfOrgs;
    const processPerOrg = Math.floor(numberOfFetchers / numberOfOrgs);
    const objectEntries = Object.entries(config.objects);
    const fetcherScript = path.resolve(__dirname, './fetcher.js');
    const appendWriterScript = path.resolve(__dirname, './appendWriter.js');
    const bufferDir = path.resolve(__dirname, `../data-extract/${comparisonId}/.buffers`);

    const fetcherPromises = [];

    // 🌀 Start appendWriter first
    const appendWriterProcess = fork(appendWriterScript, [], {
        stdio: 'inherit',
        env: { COMPARISON_ID: comparisonId }
    });
    logger.info('📂 AppendWriter started in parallel');

    for (const org of config.orgs) {
        const username = org.username;

        const chunks = processPerOrg >= 1
            ? splitArrayIntoChunks(objectEntries, processPerOrg)
            : [objectEntries]; // all in one

        chunks.forEach((chunk, index) => {
            const payload = {
                orgUsername: username,
                comparisonId,
                objects: chunk.map(([name, config]) => ({ name, config }))
            };

            fetcherPromises.push(
                new Promise((resolve, reject) => {
                    const child = fork(fetcherScript, [], {
                        stdio: 'inherit',
                        env: { FETCHER_PAYLOAD: JSON.stringify(payload) }
                    });

                    child.on('exit', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`Fetcher exited with code ${code}`));
                    });
                })
            );

            logger.info('Spawned fetcher', {
                org: username,
                index,
                objectCount: chunk.length
            });
        });
    }

    await Promise.all(fetcherPromises);
    logger.info('✅ All fetchers completed');

    // Wait for appendWriter to finish remaining buffers
    logger.info('⏳ Waiting for .buffers/ to clear...');
    await waitForBuffersToClear(bufferDir);
    logger.info('✅ All buffers processed');

    appendWriterProcess.kill(); // graceful shutdown (you can send SIGINT too)
    logger.info('🏁 All fetchers and appendWriter completed');
}

module.exports = { spawnFetchers };
