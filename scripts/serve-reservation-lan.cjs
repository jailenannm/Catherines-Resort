'use strict';
// Starts LAN adapters only. Existing emulator dataset/accounts are never seeded.
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const { startServer } = require('../tests/serve.cjs');
const { startBenchServer } = require('./rfid-bench-server.cjs');
const { startAdminCheckoutServer } = require('./admin-checkout-server.cjs');
const { deviceSyncConfig } = require('./device-sync-config.cjs');
const addresses = [...new Set(Object.values(os.networkInterfaces()).flat().filter(ip => ip && ip.family === 'IPv4' && !ip.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip.address)).map(ip => ip.address))];
const host = process.argv.find(arg => arg.startsWith('--host='))?.slice(7) || process.env.CATHERINES_LAN_HOST || (addresses.length === 1 ? addresses[0] : null);
if (!host || !addresses.includes(host)) throw Error('Supply the current local LAN address using --host.');
const expected = { GCLOUD_PROJECT: 'demo-catherines-reservations', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:29099', FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:29000' };
for (const [name, value] of Object.entries(expected)) {
    if (process.env[name] && process.env[name] !== value) throw Error('Unexpected emulator environment: ' + name);
    process.env[name] = value;
}
const servers = [];
async function forward(port, target) {
    const server = net.createServer(client => {
        const upstream = net.connect(target, '127.0.0.1');
        client.pipe(upstream).pipe(client);
        client.on('error', () => upstream.destroy()); upstream.on('error', () => client.destroy());
        client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    servers.push(server);
}
(async () => {
    const response = await fetch('http://127.0.0.1:24400/emulators', { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw Error('Start the existing Auth/RTDB emulators first.');
    const services = await response.json();
    if (services.auth?.port !== 29099 || services.database?.port !== 29000) throw Error('Matching Auth/RTDB emulator ports required.');
    const sync = deviceSyncConfig(host);
    await forward(9099, 29099); await forward(9000, 29000);
    servers.push(await startServer(5000, { host, lanDemo: true, authPort: 9099, databasePort: 9000, deviceSyncEnabled: Boolean(sync), facilitiesV2Enabled: Boolean(sync?.facilitiesV2) }));
    servers.push(await startBenchServer({ host, port: 8787, readerKeys: JSON.parse(fs.readFileSync('.local/rfid-reader.json', 'utf8')), deviceSync: sync }));
    servers.push(await startAdminCheckoutServer({ host, webPort: 5000 }));
    console.log('Website http://' + host + ':5000 · RFID/device API http://' + host + ':8787 · reservation device sync ' + (sync ? 'ENABLED' : 'DISABLED'));
})().catch(error => { for (const server of servers) server.close(); console.error(error.message); process.exitCode = 1; });
