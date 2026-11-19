'use strict';
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs/promises');
const { startServer } = require('../tests/serve.cjs');
const { seed, project } = require('../tests/seed-emulator.cjs');
const { startBenchServer } = require('./rfid-bench-server.cjs');
const { startAdminCheckoutServer } = require('./admin-checkout-server.cjs');
const { deviceSyncConfig } = require('./device-sync-config.cjs');

async function forward(host, port, targetPort) {
    const server = net.createServer(client => {
        const upstream = net.connect(targetPort, '127.0.0.1');
        client.pipe(upstream).pipe(client);
        client.on('error', () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('close', () => upstream.destroy());
        upstream.on('close', () => client.destroy());
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    return server;
}

async function startLanDemo({ host, webPort = 5000, authPort = 9099, databasePort = 9000, rfidPort = 8787 }) {
    if (process.env.GCLOUD_PROJECT !== project) throw Error('Demo project required.');
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    if (!['127.0.0.1:29099', '127.0.0.1:19099'].includes(authHost) ||
        !['127.0.0.1:29000', '127.0.0.1:19000'].includes(databaseHost)) throw Error('Dedicated demo emulators required.');
    const servers = [];
    try {
        await seed();
        servers.push(await forward(host, authPort, Number(authHost.split(':')[1])));
        servers.push(await forward(host, databasePort, Number(databaseHost.split(':')[1])));
        const sync = deviceSyncConfig(host, webPort);
        const web = await startServer(webPort, { host, lanDemo: true, authPort, databasePort, deviceSyncEnabled: Boolean(sync) });
        servers.push(web);
        const readerKeys = JSON.parse(await fs.readFile('.local/rfid-reader.json', 'utf8'));
        const rfid = await startBenchServer({ readerKeys, host, port: rfidPort, deviceSync: sync });
        servers.push(rfid);
        let checkoutReady = false;
        try {
            const response = await fetch('http://' + host + ':8790/health', { signal: AbortSignal.timeout(1000) });
            const value = await response.json();
            checkoutReady = response.ok && value.project === project && value.databaseHost === databaseHost && value.authHost === authHost;
        } catch { /* Start the matching emulator-only service below. */ }
        if (!checkoutReady) servers.push(await startAdminCheckoutServer({ host, webPort }));
        return { servers, web, rfid };
    } catch (error) {
        for (const server of servers) server.close();
        throw error;
    }
}
module.exports = { startLanDemo };

if (require.main === module) {
    const host = process.argv.find(argument => argument.startsWith('--host='))?.slice(7);
    const localAddresses = Object.values(os.networkInterfaces()).flat().filter(Boolean).map(item => item.address);
    if (!host || !localAddresses.includes(host) || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
        console.error('Supply Laptop 1 private IPv4 address using --host=192.168.1.35');
        process.exitCode = 1;
    } else {
        startLanDemo({ host }).then(() => {
            console.log('LAN demo ready at http://' + host + ':5000');
            console.log('Admin administrator@example.test / TestPass123!');
            console.log('Guest guest-a@example.test / TestPass123!');
            console.log('Reader http://' + host + ':8787; demo Auth/RTDB only.');
        }).catch(error => { console.error(error.message); process.exitCode = 1; });
    }
}
