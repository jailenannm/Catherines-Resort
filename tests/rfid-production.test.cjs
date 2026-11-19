'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const { createHmac } = require('node:crypto');
const { createHandler } = require('../production/rfid/server.cjs');
const { createProductionStore, validateTransition, DATABASE } = require('../production/rfid/store.cjs');
const { signedFields } = require('../scripts/signed-rfid-check-in.cjs');

(async () => {
    let version = 1;
    const keys = { 'fixture-production': 'production-test-key-01234567890123456789' };
    let state = { sharedReservations: {}, rfidAssignments: {}, diorama: { immutable: true } };
    for (const [reference, uid] of [['CBLR-990001', '00010203'], ['CBLR-990002', '00010204']]) {
        state.sharedReservations[reference] = { reference, status: 'Confirmed', rfidLinked: uid, ownerUid: 'guest', checkinDate: '2026-12-25', prices: { total: 16450 } };
        state.rfidAssignments[uid] = reference;
    }
    const transport = async (url, options) => {
        assert.equal(url, DATABASE + '/.json');
        assert.equal(options.headers.Authorization, 'Bearer fake-service-identity-token');
        if (options.method === 'PUT') {
            if (options.headers['if-match'] !== String(version)) return new Response('{}', { status: 412 });
            state = JSON.parse(options.body);
            version++;
        }
        return new Response(JSON.stringify(state), { status: 200, headers: { etag: String(version) } });
    };
    const store = createProductionStore({ tokenProvider: async () => 'fake-service-identity-token', allowedReferences: ['CBLR-990001'], transport });
    const disabled = http.createServer(createHandler({ store, readerKeys: keys }));
    await new Promise(resolve => disabled.listen(0, '127.0.0.1', resolve));
    assert.equal((await fetch('http://127.0.0.1:' + disabled.address().port + '/scan', { method: 'POST' })).status, 503);
    await new Promise(resolve => disabled.close(resolve));
    const server = http.createServer(createHandler({ store, readerKeys: keys, allowedReferences: ['CBLR-990001'], enabled: true }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const event = { readerId: 'fixture-production', eventId: 'production-test-event-0001', uid: '00010203', byteCount: 4, observedAt: Date.now() };
    const send = async (value, key = keys['fixture-production']) => fetch(origin + '/scan', { method: 'POST', headers: { 'X-Reader-Signature': createHmac('sha256', key).update(signedFields(value)).digest('hex') }, body: JSON.stringify(value) });
    try {
        assert.equal((await send(event, 'old-reader-key-not-accepted')).status, 401);
        assert.equal((await send({ ...event, observedAt: Date.now() - 16000 })).status, 401);
        const denied = { ...event, eventId: 'production-test-event-0002', uid: '00010204' };
        assert.equal((await send(denied)).status, 422);
        assert.equal(state.sharedReservations['CBLR-990002'].status, 'Confirmed');
        const results = await Promise.all([send(event), send(event)]);
        assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
        assert.equal(state.sharedReservations['CBLR-990001'].status, 'Checked In');
        assert.equal(state.sharedReservations['CBLR-990001'].rfidLinked, '00010203');
        assert.equal(Object.keys(state.verifiedCheckins).length, 1);
        assert.equal((await send(event)).status, 409);
        assert.equal((await send({ ...event, eventId: 'production-test-event-0003' })).status, 422);
        assert.deepEqual(state.diorama, { immutable: true });
        const changed = structuredClone(state);
        changed.sharedReservations['CBLR-990002'].status = 'Checked In';
        changed.verifiedCheckins.bad = { reference: 'CBLR-990002', uid: '00010204' };
        changed.diorama.immutable = false;
        assert.throws(() => validateTransition(state, changed, ['CBLR-990002']), /unrelated/);
        const sketch = fs.readFileSync('esp32_firmware/RFID_Production/RFID_Production.ino', 'utf8');
        assert(sketch.includes('NetworkClientSecure client;'));
        assert(sketch.includes('useBuiltinCACertBundle()'));
        assert(sketch.includes('configTime('));
        assert(sketch.includes('startsWith("https://")'));
        assert(!sketch.includes('setInsecure'));
        console.log('PASS: production disabled default, strict test-reference scope, service OAuth header/target, signed authentication/old-key rejection, freshness, concurrent/repeat delivery, one immutable receipt/status transition, unrelated data guard and TLS source configuration. All cloud transport was fake. Arduino TLS handshake remains Pending.');
    } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
