'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

// Separate signed purpose, using the existing reader credential. No store writes.
const displayFields = payload => JSON.stringify(['rfid-lcd-display-v1', payload.readerId, payload.eventId, payload.observedAt]);

function createReaderDisplay({ readerKeys, store, now = Date.now }) {
    const requests = new Map();
    return async function readDisplay(payload, signature) {
        const time = now();
        const key = Object.hasOwn(readerKeys, payload?.readerId) ? readerKeys[payload.readerId] : null;
        if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(payload?.eventId || '') ||
            !Number.isSafeInteger(payload.observedAt) || time < payload.observedAt || time - payload.observedAt > 15000 ||
            !/^[0-9a-f]{64}$/.test(signature || '')) throw Error('INVALID_DISPLAY_REQUEST');
        const fingerprint = displayFields(payload);
        const expected = createHmac('sha256', key).update(fingerprint).digest();
        if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw Error('INVALID_DISPLAY_REQUEST');
        for (const [id, request] of requests) if (time - request.time > 15000) requests.delete(id);
        const previous = requests.get(payload.eventId);
        if (previous) {
            if (previous.fingerprint !== fingerprint) throw Error('INVALID_DISPLAY_REQUEST');
            return previous.result;
        }
        if (requests.size >= 1000) throw Error('DISPLAY_BUSY');
        const result = (async () => {
            const { value } = await store.read();
            const reservations = Object.entries(value?.sharedReservations || {})
                .filter(([reference, booking]) => /^CBLR-[0-9]{6}$/.test(reference) && booking.reference === reference &&
                    ['Pending Verification', 'Confirmed', 'Checked In'].includes(booking.status))
                .map(([reference, booking]) => ({
                    reference,
                    status: booking.status,
                    guestName: typeof booking.guestName === 'string' ? booking.guestName : '',
                    createdAt: typeof booking.createdAt === 'string' ? booking.createdAt : '',
                    rfidAssigned: Boolean(booking.rfidLinked && value.rfidAssignments?.[booking.rfidLinked] === reference)
                }))
                .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.reference.localeCompare(b.reference));
            return { reservations };
        })();
        requests.set(payload.eventId, { fingerprint, time, result });
        try { return await result; }
        catch (error) { requests.delete(payload.eventId); throw error; }
    };
}
module.exports = { createReaderDisplay, displayFields };
