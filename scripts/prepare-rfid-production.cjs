'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

(async () => {
    const endpointArgument = process.argv.find(argument => argument.startsWith('--endpoint='));
    let endpoint = endpointArgument ? endpointArgument.slice('--endpoint='.length) : null;
    if (endpoint) {
        const url = new URL(endpoint);
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.run.app') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Use the reviewed Cloud Run HTTPS service origin.');
    }
    await fs.mkdir('.local', { recursive: true });
    await fs.mkdir('esp32_firmware/RFID_Production', { recursive: true });
    const secretPath = '.local/rfid-production-reader.json';
    let keys;
    try { keys = JSON.parse(await fs.readFile(secretPath, 'utf8')); }
    catch (error) {
        if (error.code !== 'ENOENT') throw error;
        keys = { 'esp1-production-v1': randomBytes(32).toString('hex') };
        await fs.writeFile(secretPath, JSON.stringify(keys, null, 2), { flag: 'wx' });
    }
    const headerPath = 'esp32_firmware/RFID_Production/production-secrets.h';
    // Preserve Wi-Fi entries during endpoint configuration.
    let wifi = '#define PRODUCTION_WIFI_SSID ""\n#define PRODUCTION_WIFI_PASSWORD ""\n';
    try {
        const previous = await fs.readFile(headerPath, 'utf8');
        wifi = previous.split('\n').filter(line => /^#define PRODUCTION_WIFI_(SSID|PASSWORD) /.test(line)).join('\n') + '\n';
        if (endpoint === null) endpoint = previous.match(/^#define PRODUCTION_SERVER "([^"]*)"/m)?.[1] || '';
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    endpoint ||= '';
    if (typeof keys['esp1-production-v1'] !== 'string' || keys['esp1-production-v1'].length < 32) throw Error('Production reader key is invalid.');
    await fs.writeFile(headerPath, '#pragma once\n' + wifi + '#define PRODUCTION_SERVER "' + endpoint.replace(/\/$/, '') + '"\n#define PRODUCTION_READER_ID "esp1-production-v1"\n#define PRODUCTION_READER_KEY "' + keys['esp1-production-v1'] + '"\n');
    const stage = '.local/rfid-deploy';
    for (const file of ['production/rfid/package.json', 'production/rfid/package-lock.json', 'production/rfid/Dockerfile', 'production/rfid/server.cjs', 'production/rfid/store.cjs', 'scripts/check-in-verifier.cjs', 'scripts/signed-rfid-check-in.cjs']) {
        await fs.mkdir(path.dirname(path.join(stage, file)), { recursive: true });
        await fs.copyFile(file, path.join(stage, file));
    }
    await fs.copyFile('production/rfid/Dockerfile', path.join(stage, 'Dockerfile'));
    console.log('Private production reader pair prepared. Deployment source staged in .local/rfid-deploy. Endpoint ' + (endpoint ? 'configured from reviewed URL.' : 'awaits deployment review.'));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
