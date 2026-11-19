'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createReservationDeviceSync, requestFields, responseFields } = require('../scripts/reservation-device-sync.cjs');

(async () => {
    let time = 100000, revision = 1, fail = false;
    const booking = (uid, status = 'Checked In', kind = 'cottage') => ({ ownerUid: uid, status, facilities: [{ value: kind }] });
    let root = { sharedReservations: {
        'CBLR-810001': booking('a'), 'CBLR-810002': booking('b'),
        'CBLR-810003': booking('a', 'Confirmed'), 'CBLR-810004': booking('a', 'Checked In', 'pool')
    }, rfidAssignments: { '00ABCDEF': 'CBLR-810001' }, verifiedCheckins: { preserved: true } };
    const original = structuredClone(root);
    const devices = { esp1: { key: 'fixture-esp1-key-012345678901234567890' }, esp2: { key: 'fixture-esp2-key-012345678901234567890' } };
    const store = {
        read: async () => ({ value: structuredClone(root), version: revision }),
        compareAndSet: async (version, next) => {
            if (fail) throw Error('Forced failure');
            if (version !== revision) return false;
            root = next; revision++; return true;
        }
    };
    const api = createReservationDeviceSync({ store, devices, now: () => time });
    let sequence = 0;
    const command = (reference, on) => ({ reference, on, requestId: 'fixture-command-' + ++sequence });
    async function sync(deviceId, ackVersion = -1, actual = null) {
        const payload = { deviceId, requestId: 'fixture-device-event-' + ++sequence, observedAt: time, ackVersion, actual };
        const signature = createHmac('sha256', devices[deviceId].key).update(requestFields(payload)).digest('hex');
        const result = await api.sync(payload, signature);
        assert.equal(result.signature, createHmac('sha256', devices[deviceId].key).update(responseFields(result)).digest('hex'));
        return { result, payload, signature };
    }
    assert.equal((await sync('esp1')).result.desired, true);
    assert.equal((await sync('esp2')).result.desired, false); // Check-in never auto-enables cottages.
    const a = { uid: 'a', admin: false }, b = { uid: 'b', admin: false };
    await assert.rejects(() => api.cottage(null, command('CBLR-810001', true)), /FORBIDDEN/);
    await assert.rejects(() => api.cottage(b, command('CBLR-810001', true)), /FORBIDDEN/);
    for (const ref of ['CBLR-810003', 'CBLR-810004']) await assert.rejects(() => api.cottage(a, command(ref, true)), /FORBIDDEN/);
    const on = command('CBLR-810001', true);
    fail = true;
    await assert.rejects(() => api.cottage(a, on), /Forced/);
    assert.equal(root.reservationDeviceSync.requests['CBLR-810001'], undefined);
    fail = false;
    const results = await Promise.all([api.cottage(a, on), api.cottage(a, on)]);
    assert(results.some(r => r.accepted));
    assert.equal(Object.keys(root.reservationDeviceSync.commands).length, 1);
    assert.equal((await api.status(a, on.reference)).esp2.acknowledged, false);
    const desired = (await sync('esp2')).result;
    assert.equal(desired.desired, true);
    await sync('esp1', desired.version + 100, true);
    assert.equal((await api.status({ admin: true })).esp1.acknowledged, false);
    await sync('esp2', desired.version, true);
    assert.equal((await api.status(a, on.reference)).esp2.acknowledged, true);
    time += 10001;
    const expiredReport = (await api.status(a, on.reference)).esp2;
    assert.equal(expiredReport.online, true);
    assert.equal(expiredReport.acknowledged, false);
    assert.equal(expiredReport.actual, null);
    await api.cottage(b, command('CBLR-810002', true));
    await api.cottage(a, command('CBLR-810001', false));
    assert.equal((await sync('esp2')).result.desired, true); // Other booking still requests ON.
    root.sharedReservations['CBLR-810002'].status = 'Checking Out';
    root.sharedReservations['CBLR-810001'].status = 'Completed';
    const off = (await sync('esp2')).result;
    assert.equal(off.desired, false);
    assert.equal((await api.status({ admin: true })).esp2.acknowledged, false);
    await assert.rejects(() => api.cottage(a, on), /FORBIDDEN/);
    for (const record of Object.values(root.sharedReservations)) record.status = 'Completed';
    assert.equal((await sync('esp1')).result.desired, false);
    root.sharedReservations['CBLR-810001'].status = 'Checked In';
    await api.cottage(a, command('CBLR-810001', false));
    await api.cottage(a, on); // Delayed retry must not resurrect the old ON.
    assert.equal((await sync('esp2')).result.desired, false);
    const replay = await sync('esp2');
    assert.deepEqual(await api.sync(replay.payload, replay.signature), replay.result);
    await assert.rejects(() => api.sync({ ...replay.payload, actual: true }, replay.signature), /INVALID_DEVICE/);
    time += 16000;
    await assert.rejects(() => api.sync(replay.payload, replay.signature), /INVALID_DEVICE/);
    assert.equal((await api.status(a, on.reference)).esp2.online, false);
    assert.deepEqual(root.rfidAssignments, original.rfidAssignments);
    assert.deepEqual(root.verifiedCheckins, original.verifiedCheckins);
    assert.equal(root.diorama, undefined);
    console.log('PASS: ownership/status/package enforcement, check-in pathway eligibility, cottages default OFF, authenticated response MAC, output acknowledgement, concurrency/idempotency, failed save, shared OR policy, checkout revocation, stale replay and offline feedback. Existing booking/index/receipt fields preserved. Fake transport only.');
})().catch(error => { console.error(error); process.exitCode = 1; });
