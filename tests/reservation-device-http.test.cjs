'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { startBenchServer } = require('../scripts/rfid-bench-server.cjs');
const { requestFields } = require('../scripts/reservation-device-sync.cjs');
(async () => {
    process.env.GCLOUD_PROJECT = 'demo-catherines-reservations';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:19099';
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19000';
    let root = { sharedReservations: { 'CBLR-810001': { reference: 'CBLR-810001', ownerUid: 'guest-a', status: 'Checked In', facilities: [{ value: 'cottage' }] } } };
    let revision = 1;
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        if (String(url).startsWith('http://127.0.0.1:19000/')) {
            if (options.method === 'PUT') {
                if (options.headers['if-match'] !== String(revision)) return new Response('{}', { status: 412 });
                root = JSON.parse(options.body); revision++;
            }
            return new Response(JSON.stringify(root), { headers: { etag: String(revision) } });
        }
        if (String(url).startsWith('http://127.0.0.1:19099/')) {
            const token = JSON.parse(options.body).idToken;
            const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
            return new Response(JSON.stringify({ users: [{ localId: claims.sub, customAttributes: claims.sub === 'admin' ? '{"admin":true}' : '{}' }] }));
        }
        return originalFetch(url, options);
    };
    const devices = { esp1: { key: 'fixture-device-one-01234567890123456789' }, esp2: { key: 'fixture-device-two-01234567890123456789' } };
    const server = await startBenchServer({ readerKeys: { 'esp1-bench': 'fixture-reader-0123456789012345678901' }, host: '127.0.0.1', port: 0,
        deviceSync: { devices, webOrigin: 'http://127.0.0.1:15000' } });
    const base = 'http://127.0.0.1:' + server.address().port;
    function token(uid, admin = false) {
        return 'header.' + Buffer.from(JSON.stringify({ sub: uid, aud: 'demo-catherines-reservations', iss: 'https://securetoken.google.com/demo-catherines-reservations', exp: Math.floor(Date.now() / 1000) + 1000, admin, firebase: { sign_in_provider: 'password' } })).toString('base64url') + '.';
    }
    async function post(path, body, extra = {}) {
        return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
    }
    try {
        const input = { reference: 'CBLR-810001', on: true, requestId: 'fixture-http-command-0001' };
        assert.equal((await post('/guest/cottages', input)).status, 403);
        assert.equal((await post('/guest/cottages', input, { Authorization: 'Bearer ' + token('guest-b') })).status, 403);
        assert.equal((await post('/guest/cottages', input, { Authorization: 'Bearer ' + token('guest-a'), Origin: 'http://evil.invalid' })).status, 403);
        const accepted = await post('/guest/cottages', input, { Authorization: 'Bearer ' + token('guest-a'), Origin: 'http://127.0.0.1:15000' });
        assert.equal(accepted.status, 200); assert.equal(accepted.headers.get('access-control-allow-origin'), 'http://127.0.0.1:15000');
        assert.equal((await accepted.json()).acknowledged, false);
        assert.equal((await fetch(base + '/admin/device-state', { headers: { Authorization: 'Bearer ' + token('guest-a') } })).status, 403);
        assert.equal((await fetch(base + '/admin/device-state', { headers: { Authorization: 'Bearer ' + token('admin', true) } })).status, 200);
        const event = { deviceId: 'esp2', requestId: 'fixture-http-device-0001', observedAt: Date.now(), ackVersion: -1, actual: null };
        assert.equal((await post('/device/sync', event, { 'X-Device-Signature': '0'.repeat(64) })).status, 403);
        const signature = createHmac('sha256', devices.esp2.key).update(requestFields(event)).digest('hex');
        const response = await post('/device/sync', event, { 'X-Device-Signature': signature });
        assert.equal(response.status, 200); assert.equal((await response.json()).desired, true);
        assert.equal(root.sharedReservations['CBLR-810001'].status, 'Checked In');
        assert.equal(root.diorama, undefined);
        console.log('PASS: real HTTP route/CORS handling, unauthenticated and other-owner denial, trusted-admin status access, signed device polling and pending feedback. Fake Auth/RTDB transport only.');
    } finally { await new Promise(resolve => server.close(resolve)); global.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
