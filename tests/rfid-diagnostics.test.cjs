'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { startBenchServer } = require('../scripts/rfid-bench-server.cjs');
const { diagnosticFields } = require('../scripts/rfid-bench-diagnostics.cjs');
const { signedFields } = require('../scripts/signed-rfid-check-in.cjs');
(async () => {
    process.env.GCLOUD_PROJECT = 'demo-catherines-reservations';
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19000';
    const key = 'isolated-diagnostic-test-key-0123456789', logs = [];
    const originalFetch = global.fetch;
    let databaseCalls = 0;
    global.fetch = (url, options) => {
        if (String(url).startsWith('http://127.0.0.1:19000/')) { databaseCalls++; throw Error('Diagnostics must not access database.'); }
        return originalFetch(url, options);
    };
    const server = await startBenchServer({ readerKeys: { 'esp1-bench': key }, host: '127.0.0.1', port: 0, diagnosticLog: entry => logs.push(entry) });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let sequence = 0;
    const event = (kind = 'network_ready', uid = '', byteCount = 0) => ({ readerId: 'esp1-bench', eventId: 'diagnostic-test-event-' + ++sequence, kind, uid, byteCount, observedAt: Date.now() });
    const sign = (payload, secret = key, fields = diagnosticFields) => createHmac('sha256', secret).update(fields(payload)).digest('hex');
    async function post(payload, signature = sign(payload), route = '/diagnostic', headers = {}) {
        const response = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reader-Signature': signature, ...headers }, body: JSON.stringify(payload) });
        return { status: response.status, body: await response.json() };
    }
    try {
        const health = await (await fetch(origin + '/health')).json(); assert(health.ok && health.serverTime);
        const ready = event(); assert.equal((await post(ready)).status, 200); assert.equal((await post(ready)).body.reused, true); assert.equal(logs.length, 1);
        for (const uid of ['00A21606', '00010203040506', '00010203040506070809']) assert.equal((await post(event('card_read', uid, uid.length / 2))).status, 200);
        assert(logs.some(entry => entry.includes('"uid":"00A21606"')));
        assert(logs.every(entry => entry.includes('"bookingChanged":false') && !entry.includes(key)));
        for (const invalid of [event('card_read', '1234', 4), event('unexpected'), { ...event(), readerId: 'unknown' }, { ...event(), observedAt: Date.now() - 16000 }, { ...event(), observedAt: Date.now() + 1000 }]) assert.equal((await post(invalid)).status, 401);
        assert.equal((await post(event(), '0'.repeat(64))).status, 401);
        assert.equal((await post({ ...ready, kind: 'card_read', uid: '00A21606', byteCount: 4 })).status, 401);
        assert.equal((await post(event(), undefined, '/diagnostic', { Origin: 'http://localhost:5000' })).status, 403);
        // A diagnostic signature cannot authorize check-in, nor vice versa.
        const card = event('card_read', '00A21606', 4);
        assert.equal((await post(card, sign(card), '/scan')).status, 401);
        assert.equal((await post(card, sign(card, key, signedFields))).status, 401);
        assert.equal(databaseCalls, 0); assert.equal(logs.length, 4);
        console.log('PASS: signed network/card diagnostics, 4/7/10-byte zero-preserving UIDs, duplicate acknowledgement, invalid key/reader/age/payload/origin rejection, cross-endpoint signature denial, and zero database reads or writes.');
    } finally { await new Promise(resolve => server.close(resolve)); global.fetch = originalFetch; }
    await assert.rejects(() => fetch(origin + '/health'));
    console.log('PASS: unreachable backend is distinguishable from diagnostic acknowledgement. Physical USB/battery comparison Pending.');
})().catch(error => { console.error(error); process.exitCode = 1; });
