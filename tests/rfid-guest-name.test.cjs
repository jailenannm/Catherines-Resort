'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { startBenchServer } = require('../scripts/rfid-bench-server.cjs');
const { signedFields } = require('../scripts/signed-rfid-check-in.cjs');
const { displayFields } = require('../scripts/rfid-reader-display.cjs');
const { createCheckInVerifier } = require('../scripts/check-in-verifier.cjs');

(async () => {
    process.env.GCLOUD_PROJECT = 'demo-catherines-reservations';
    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19000';
    const key = 'test-reader-key-with-no-production-use-12345';
    const guestName = 'María "Luz" Santos de la Cruz';
    let root = {
        sharedReservations: {
            'CBLR-980001': { reference: 'CBLR-980001', status: 'Confirmed', rfidLinked: '00123456', guestName, createdAt: '2026-11-16T00:00:00Z', email: 'private@example.invalid' },
            'CBLR-980002': { reference: 'CBLR-980002', status: 'Pending Verification', rfidLinked: '', guestName: 'Different Guest', createdAt: '2026-11-16T00:01:00Z' }
        },
        rfidAssignments: { '00123456': 'CBLR-980001' },
        diorama: { preserved: true }
    };
    let version = 1, writes = 0, fail = false;
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
        if (!String(url).startsWith('http://127.0.0.1:19000/')) return originalFetch(url, options);
        if (options.method === 'PUT') {
            if (fail) return new Response('{}', { status: 503 });
            if (options.headers['if-match'] !== String(version)) return new Response('{}', { status: 412 });
            root = JSON.parse(options.body); version++; writes++;
        }
        return new Response(JSON.stringify(root), { headers: { etag: String(version) } });
    };
    const server = await startBenchServer({ readerKeys: { 'esp1-bench': key }, host: '127.0.0.1', port: 0 });
    const origin = 'http://127.0.0.1:' + server.address().port;
    let sequence = 0;
    const event = () => ({ readerId: 'esp1-bench', eventId: 'guest-name-test-event-' + ++sequence, observedAt: Date.now() });
    const sign = (payload, fields) => createHmac('sha256', key).update(fields(payload)).digest('hex');
    async function post(route, payload, signature, headers = {}) {
        const response = await fetch(origin + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers, 'X-Reader-Signature': signature || '' }, body: JSON.stringify(payload) });
        return { status: response.status, body: await response.json() };
    }
    try {
        const before = structuredClone(root), request = event();
        assert.equal((await post('/reader-display', request)).status, 401);
        assert.equal((await fetch(origin + '/reader-display')).status, 404);
        assert.equal((await post('/reader-display', request, sign(request, displayFields), { Origin: 'http://localhost:5000' })).status, 403);
        const snapshot = await post('/reader-display', request, sign(request, displayFields));
        assert.equal(snapshot.status, 200);
        assert.deepEqual(snapshot.body.reservations[0], { reference: 'CBLR-980001', guestName, status: 'Confirmed', createdAt: '2026-11-16T00:00:00Z', rfidAssigned: true });
        assert.equal(snapshot.body.reservations[1].rfidAssigned, false);
        assert.deepEqual((await post('/reader-display', request, sign(request, displayFields))).body, snapshot.body);
        const stale = { ...event(), observedAt: Date.now() - 16000 };
        assert.equal((await post('/reader-display', stale, sign(stale, displayFields))).status, 401);
        const reused = { ...request, observedAt: request.observedAt - 1 };
        assert.equal((await post('/reader-display', reused, sign(reused, displayFields))).status, 401);
        assert.deepEqual(root, before); assert.equal(writes, 0);
        const scan = { ...event(), uid: '00123456', byteCount: 4 };
        assert.equal((await post('/scan', scan, sign(scan, displayFields))).status, 401);
        assert.equal((await post('/reader-display', scan, sign(scan, signedFields))).status, 401);
        const unknown = { ...event(), uid: 'DEADBEEF', byteCount: 4 };
        assert.equal((await post('/scan', unknown, sign(unknown, signedFields))).status, 422);
        fail = true;
        assert.equal((await post('/scan', scan, sign(scan, signedFields))).status, 503);
        assert.deepEqual(root, before); assert.equal(writes, 0);
        fail = false;
        const accepted = await post('/scan', scan, sign(scan, signedFields));
        assert.equal(accepted.status, 200);
        assert.deepEqual(accepted.body, { accepted: true, reference: 'CBLR-980001', status: 'Checked In', guestName });
        assert.equal(root.sharedReservations['CBLR-980002'].status, 'Pending Verification');
        assert.deepEqual(root.diorama, before.diorama);
        assert.equal(writes, 1);
        assert.equal((await post('/scan', scan, sign(scan, signedFields))).status, 409);
        assert.equal(writes, 1);
        const later = event();
        const current = await post('/reader-display', later, sign(later, displayFields));
        assert.equal(current.body.reservations[0].status, 'Checked In');
        root.sharedReservations['CBLR-980002'].status = 'Confirmed';
        root.sharedReservations['CBLR-980002'].rfidLinked = '00123456'; // Mismatched index must remain unassigned.
        const mismatch = event();
        assert.equal((await post('/reader-display', mismatch, sign(mismatch, displayFields))).body.reservations[1].rfidAssigned, false);
        root.sharedReservations['CBLR-980002'].rfidLinked = '00AABBCC';
        root.rfidAssignments['00AABBCC'] = 'CBLR-980002';
        const assignment = event();
        const assigned = (await post('/reader-display', assignment, sign(assignment, displayFields))).body.reservations[1];
        assert.equal(assigned.rfidAssigned, true);
        assert.equal(assigned.guestName, 'Different Guest');
        assert.equal(writes, 1);
        delete root.sharedReservations['CBLR-980001'].guestName;
        delete root.verifiedCheckins;
        root.sharedReservations['CBLR-980001'].status = 'Confirmed';
        const legacy = { ...event(), uid: '00123456', byteCount: 4 };
        assert.equal((await post('/scan', legacy, sign(legacy, signedFields))).body.guestName, '');
        root.sharedReservations['CBLR-980001'].status = 'Confirmed';
        root.sharedReservations['CBLR-980001'].guestName = guestName;
        const trusted = { ...event(), uid: '00123456', byteCount: 4, receivedAt: Date.now(), authenticated: true, fullUid: true };
        const recover = createCheckInVerifier({
            allowedReaders: ['esp1-bench'], resolveTrustedScan: id => id === trusted.eventId ? trusted : null,
            store: {
                read: async () => ({ value: structuredClone(root), version: 'fixture' }),
                compareAndSet: async (_, next) => { root = next; throw Error('Lost acknowledgement'); }
            }
        });
        const recovered = await recover(trusted.eventId);
        assert.equal(recovered.reused, true);
        assert.equal(recovered.guestName, guestName);
        assert.equal((await recover(trusted.eventId)).guestName, guestName);
        console.log('PASS: exact accepted booking name including Unicode/quotes and >16 characters, legacy empty-name fallback, failure/replay/lost-ack recovery, signed read-only snapshots, index-verified assignment changes, auth/origin/staleness/signature-purpose rejection, and one transition per accepted scan.');
        console.log('Successful fixture response ' + JSON.stringify(accepted.body));
    } finally { await new Promise(resolve => server.close(resolve)); global.fetch = originalFetch; }
})().catch(error => { console.error(error); process.exitCode = 1; });
