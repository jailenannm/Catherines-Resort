'use strict';
// Dedicated emulator suite only; never resets the running LAN dataset.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const { seedDashboardPreview } = require('../scripts/seed-dashboard-preview.cjs');
const { startServer } = require('./serve.cjs');
const { startAdminCheckoutServer } = require('../scripts/admin-checkout-server.cjs');
const { startBenchServer } = require('../scripts/rfid-bench-server.cjs');
(async () => {
    if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19000' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099') throw Error('Isolated emulators required.');
    const { references } = await seedDashboardPreview();
    const root = 'http://127.0.0.1:19000/.json?ns=demo-catherines-reservations-default-rtdb';
    const patch = await fetch(root, { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ ['sharedReservations/' + references.pool + '/status']: 'Checking Out', ['sharedReservations/' + references.pool + '/rfidLinked']: 'B2321606', 'rfidAssignments/B2321606': references.pool }) });
    if (!patch.ok) throw Error('Fixture failed.');
    const servers = [];
    try {
        servers.push(await startServer(15000, { host: '127.0.0.1', lanDemo: true, authPort: 19099, databasePort: 19000 }));
        servers.push(await startAdminCheckoutServer({ host: '127.0.0.1', webPort: 15000 }));
        servers.push(await startBenchServer({ host: '127.0.0.1', port: 18787, readerKeys: JSON.parse(await fs.readFile('.local/rfid-reader.json', 'utf8')) }));
        const status = await new Promise(resolve => {
            const child = spawn(process.execPath, ['tests/admin-checkout-lan.test.cjs'], { stdio: 'inherit', env: { ...process.env, RESUME_CHECKOUT_REFERENCE: '', CHECKOUT_TEST_HOST: '127.0.0.1', CHECKOUT_TEST_WEB_PORT: '15000', CHECKOUT_TEST_DB_PORT: '19000', CHECKOUT_TEST_SCAN_PORT: '18787', CHECKOUT_TEST_REFERENCE: references.pool } });
            child.once('exit', resolve);
        });
        if (status !== 0) throw Error('Admin checkout test failed.');
    } finally { for (const server of servers) server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
