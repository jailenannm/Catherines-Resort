'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

const requestFields = p => JSON.stringify(['cblr-device-sync-v1', p.deviceId, p.requestId, p.observedAt, p.ackVersion, p.actual]);
const responseFields = p => JSON.stringify(['cblr-device-state-v1', p.deviceId, p.requestId, p.version, p.desired, p.serverTime, p.validForMs]);
const cottageIncluded = booking => Object.values(booking?.facilities || {}).some(f => ['cottage', 'buyout'].includes(f.value));
const checkedIn = booking => booking?.status === 'Checked In';

function createReservationDeviceSync({ store, devices, now = Date.now }) {
    if (Object.entries(devices).some(([id, device]) => !['esp1', 'esp2'].includes(id) || typeof device.key !== 'string' || device.key.length < 32)) throw Error('Invalid device registry.');
    const replay = new Map();
    async function transaction(change) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const { value, version } = await store.read();
            const root = structuredClone(value || {});
            const result = change(root);
            if (await store.compareAndSet(version, root)) return result;
        }
        throw Error('Concurrent update. Retry the same request ID.');
    }
    function reconcile(root) {
        const state = root.reservationDeviceSync ||= { version: 0, requests: {}, devices: {} };
        state.requests ||= {};
        state.devices ||= {};
        state.commands ||= {};
        const bookings = root.sharedReservations || {};
        for (const reference of Object.keys(state.requests)) {
            if (!checkedIn(bookings[reference]) || !cottageIncluded(bookings[reference])) delete state.requests[reference];
        }
        const desired = {
            pathway: Object.values(bookings).some(checkedIn),
            cottageLights: Object.entries(state.requests).some(([reference, request]) => request.on && checkedIn(bookings[reference]) && cottageIncluded(bookings[reference]))
        };
        if (!state.desired || state.desired.pathway !== desired.pathway || state.desired.cottageLights !== desired.cottageLights) {
            state.version++;
            state.desired = desired;
            state.changedAt = now();
        }
        return state;
    }
    function authorize(root, user, reference) {
        const booking = root.sharedReservations?.[reference];
        if (!user || user.admin || !booking || booking.ownerUid !== user.uid || !checkedIn(booking) || !cottageIncluded(booking)) throw Error('FORBIDDEN');
    }
    function view(state, deviceId) {
        const device = state.devices[deviceId];
        const online = Boolean(device && now() >= device.seenAt && now() - device.seenAt < 12000);
        const output = deviceId === 'esp1' ? 'pathway' : 'cottageLights';
        const desired = Boolean(state.desired[output]);
        const outputFresh = online && now() - device.seenAt < 10000;
        const acknowledged = outputFresh && device.ackVersion === state.version && device.actual === desired;
        return { desired, version: state.version, online, acknowledged, actual: outputFresh ? device.actual : null,
            lastSyncAt: device?.seenAt || null, state: !device ? 'Unknown' : !online ? 'Offline' : acknowledged ? 'Device acknowledged' : 'Command pending' };
    }
    return {
        async cottage(user, input) {
            if (!/^CBLR-\d{6}$/.test(input.reference || '') || typeof input.on !== 'boolean' || !/^[A-Za-z0-9_-]{16,100}$/.test(input.requestId || '')) throw Error('INVALID_REQUEST');
            return transaction(root => {
                authorize(root, user, input.reference);
                const state = reconcile(root);
                const prior = state.requests[input.reference];
                const receipt = state.commands[input.requestId];
                if (receipt) {
                    if (receipt.reference !== input.reference || receipt.on !== input.on || receipt.uid !== user.uid) throw Error('REQUEST_ID_REUSED');
                    return { accepted: true, reused: true, requested: input.on, ...view(state, 'esp2') };
                }
                if (prior?.requestId === input.requestId && prior.on !== input.on) throw Error('REQUEST_ID_REUSED');
                if (prior?.requestId !== input.requestId) state.requests[input.reference] = { on: input.on, requestId: input.requestId, requestedBy: user.uid, requestedAt: now() };
                state.commands[input.requestId] = { reference: input.reference, on: input.on, uid: user.uid, receivedAt: now() };
                reconcile(root);
                const device = view(state, 'esp2');
                return { accepted: true, requested: input.on, ...device };
            });
        },
        async status(user, reference) {
            return transaction(root => {
                if (!user?.admin) authorize(root, user, reference);
                const state = reconcile(root);
                return { esp1: view(state, 'esp1'), esp2: view(state, 'esp2'), policy: 'Any eligible checked-in booking requesting ON keeps the shared cottage relay ON.' };
            });
        },
        async sync(payload, signature) {
            const device = Object.hasOwn(devices, payload?.deviceId) ? devices[payload.deviceId] : null;
            const time = now();
            if (!device || !/^[A-Za-z0-9_-]{16,100}$/.test(payload?.requestId || '') ||
                !Number.isSafeInteger(payload.observedAt) || time < payload.observedAt || time - payload.observedAt > 15000 ||
                !Number.isSafeInteger(payload.ackVersion) || payload.ackVersion < -1 ||
                ![true, false, null].includes(payload.actual) || !/^[0-9a-f]{64}$/.test(signature || '')) throw Error('INVALID_DEVICE');
            const fingerprint = requestFields(payload);
            const expected = createHmac('sha256', device.key).update(fingerprint).digest();
            if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw Error('INVALID_DEVICE');
            for (const [id, event] of replay) if (time - event.time > 15000) replay.delete(id);
            const id = payload.deviceId + ':' + payload.requestId;
            const previous = replay.get(id);
            if (previous) {
                if (previous.fingerprint !== fingerprint) throw Error('INVALID_DEVICE');
                return previous.result;
            }
            if (replay.size >= 1000) throw Error('BUSY');
            const operation = transaction(root => {
                const state = reconcile(root);
                // Acknowledgement cannot claim physical sensing. It is the controller's reported output.
                const previousDevice = state.devices[payload.deviceId];
                // Only acknowledge a version previously issued to this controller.
                const delivered = previousDevice?.issuedVersion === payload.ackVersion;
                state.devices[payload.deviceId] = { seenAt: time, ackVersion: delivered ? payload.ackVersion : -1, actual: payload.actual, issuedVersion: state.version };
                const output = payload.deviceId === 'esp1' ? 'pathway' : 'cottageLights';
                const response = { deviceId: payload.deviceId, requestId: payload.requestId, version: state.version,
                    desired: Boolean(state.desired[output]), serverTime: now(), validForMs: 10000 };
                response.signature = createHmac('sha256', device.key).update(responseFields(response)).digest('hex');
                return response;
            });
            replay.set(id, { time, fingerprint, result: operation });
            try { return await operation; } catch (error) { replay.delete(id); throw error; }
        }
    };
}
module.exports = { createReservationDeviceSync, requestFields, responseFields, cottageIncluded };
