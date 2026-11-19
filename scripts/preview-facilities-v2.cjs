'use strict';
// Explicit isolated preview: never use the running LAN emulator ports.
const { createHmac } = require('node:crypto');
const { seedDashboardPreview } = require('./seed-dashboard-preview.cjs');
const { createEmulatorVerifier } = require('./emulator-check-in-verifier.cjs');
const { startServer } = require('../tests/serve.cjs');
const { startBenchServer } = require('./rfid-bench-server.cjs');
const { requestFields, responseFields } = require('./facilities-v2.cjs');
const { loadCatalog } = require('./song-catalog.cjs');
const fs = require('node:fs');
(async () => {
    if (process.env.GCLOUD_PROJECT !== 'demo-catherines-reservations' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:19000' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:19099') throw Error('Only isolated test emulators19000/19099 are allowed.');
    const { accounts } = await seedDashboardPreview();
    const url = 'http://127.0.0.1:19000/';
    async function db(path, body) { const r = await fetch(url + path + '.json?ns=demo-catherines-reservations-default-rtdb', { method: body ? 'PUT' : 'GET', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); if (!r.ok) throw Error('Isolated fixture failed'); return r.json(); }
    const reference = 'CBLR-930001', card = '00930101';
    const sample = await db('sharedReservations/CBLR-820002');
    await db('sharedReservations/' + reference, { ...sample, reference, submissionAttemptId: 'facilities-v2-preview', guestName: 'Synthetic Facilities Preview', rfidLinked: card, status: 'Confirmed', facilities: [{ value: 'buyout', name: 'Full Resort Buyout', price: 30000 }], prices: { subtotal: 30000, tourismTax: 250, serviceCharge: 2400, total: 32650 } });
    await db('rfidAssignments/' + card, reference);
    const event = { eventId: 'facilities-v2-preview-checkin-' + Date.now(), readerId: 'emulator-fixture-reader', uid: card, byteCount: 4, authenticated: true, fullUid: true, receivedAt: Date.now() };
    await createEmulatorVerifier({ fixtures: [event] })(event.eventId);
    const synthetic = process.argv.includes('--synthetic-media');
    const catalog = synthetic ? { version: 1, indexing: 'mp3-folder', tracks: [1, 2, 3, 4, 5].map(id => ({ id, file: String(id).padStart(4, '0') + '.mp3', title: 'SIMULATION FIXTURE ' + id + ' — no audio file', artist: null, category: id === 1 ? 'welcome' : id === 3 ? 'checkout' : id === 5 ? 'event' : 'ktv', folder: 'MP3', durationMs: 20000, lyrics: id === 2 ? '0002.lrc' : null, offsetMs: 0, verified: id !== 1 && id !== 3 })) } : loadCatalog('config/sd-song-catalog.json');
    const devices = { esp1: { key: 'ISOLATED_FIXTURE_ONE_01234567890123456789' }, esp2: { key: 'ISOLATED_FIXTURE_TWO_01234567890123456789' } };
    const servers = []; let timer, running = false, prior, changedAt = Date.now();
    try {
        servers.push(await startServer(15000, { host: '127.0.0.1', lanDemo: true, authPort: 19099, databasePort: 19000, deviceSyncEnabled: true, facilitiesV2Enabled: true }));
        servers.push(await startBenchServer({ host: '127.0.0.1', port: 8787, readerKeys: { fixture: 'ISOLATED_READER_FIXTURE_012345678901234' }, deviceSync: { devices, webOrigin: 'http://127.0.0.1:15000', facilitiesV2: { onError: message => console.log('Virtual server error: '+message), catalog, simulation: true, audioPolicy: 'nonpreemptive-fifo', loadLyrics: file => synthetic ? '[00:00.00]LINE_A\n[00:05.00]LINE_B' : require('./song-catalog.cjs').readLyrics(file) } } }));
        let sequence = 0;
        async function tick() {
            if (running) return; running = true;
            try {
                const report = prior ? { outputs: Object.fromEntries(Object.entries(prior.desired).filter(([k]) => !['audio', 'lyricWindow'].includes(k))), audio: { ...prior.desired.audio, positionMs: prior.desired.audio.positionMs + (prior.desired.audio.state === 'playing' ? Date.now() - changedAt : 0) }, hall: { ready: true, ageMs: 0 } } : { hall: { ready: true, ageMs: 0 } };
                if(report.outputs?.ktv_rgb_effect==='disco')report.outputs.ktv_rgb=[0,1,2].map(i=>i===Math.floor(Date.now()/500)%3?Math.max(...prior.desired.ktv_rgb):0);
                const p = { deviceId: 'esp2', requestId: 'virtual-device-event-' + String(++sequence).padStart(10, '0'), observedAt: Date.now(), ackVersion: prior?.version ?? -1, report: JSON.stringify(report), simulation: true };
                const r = await fetch('http://127.0.0.1:8787/device/facilities/v2/sync', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Signature': createHmac('sha256', devices.esp2.key).update(requestFields(p)).digest('hex') }, body: JSON.stringify(p) });
                if (!r.ok) throw Error('HTTP '+r.status+' '+await r.text()); const response = await r.json();
                if (response.signature !== createHmac('sha256', devices.esp2.key).update(responseFields(response)).digest('hex')) throw Error();
                const desired = JSON.parse(response.desired); if (!prior || prior.desired.audio.revision !== desired.audio.revision) changedAt = Date.now(); prior = { version: response.version, desired };
            } catch (e) { console.log('Virtual device exchange unconfirmed; lease will expire: '+e.message); } finally { running = false; }
        }
        timer = setInterval(tick, 500); await tick();
        console.log('ISOLATED SIMULATION — no physical audio/GPIO. Guest: http://127.0.0.1:15000/login.html?next=my-reservation.html');
        console.log('Emulator only: guest-a@example.test / TestPass123!');
        console.log('Open http://127.0.0.1:15000/guest-dashboard.html?reservation=' + reference);
        const close = () => { clearInterval(timer); for (const server of servers) server.close(); };
        process.once('SIGINT', () => { close(); process.exit(0); }); process.once('SIGTERM', () => { close(); process.exit(0); });
    } catch (e) { clearInterval(timer); for (const server of servers) server.close(); throw e; }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
