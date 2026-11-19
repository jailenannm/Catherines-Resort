'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
// Domain separation prevents diagnostic signatures from authorizing /scan.
const diagnosticFields = p => JSON.stringify(['rfid-bench-diagnostic-v1', p.readerId, p.eventId, p.kind, p.uid, p.byteCount, p.observedAt]);
function createDiagnostics({ readerKeys, now = Date.now, log = console.log }) {
    const seen = new Map();
    return (payload, signature, remoteAddress) => {
        const time = now(), key = Object.hasOwn(readerKeys, payload?.readerId) ? readerKeys[payload.readerId] : null;
        const network = payload?.kind === 'network_ready' && payload.uid === '' && payload.byteCount === 0;
        const card = payload?.kind === 'card_read' && /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(payload.uid || '') && [4, 7, 10].includes(payload.byteCount) && payload.uid.length === payload.byteCount * 2;
        if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(payload?.eventId || '') || !(network || card) || !Number.isSafeInteger(payload.observedAt) || time < payload.observedAt || time - payload.observedAt > 15000 || !/^[0-9a-f]{64}$/.test(signature || '')) throw Error('INVALID_DIAGNOSTIC');
        const fingerprint = diagnosticFields(payload);
        if (!timingSafeEqual(createHmac('sha256', key).update(fingerprint).digest(), Buffer.from(signature, 'hex'))) throw Error('INVALID_DIAGNOSTIC');
        for (const [id, event] of seen) if (time - event.time > 15000) seen.delete(id);
        const previous = seen.get(payload.eventId);
        if (previous && previous.fingerprint !== fingerprint) throw Error('INVALID_DIAGNOSTIC');
        if (previous) return { diagnosticReceived: true, reused: true, eventId: payload.eventId };
        if (seen.size >= 1000) throw Error('DIAGNOSTIC_BUSY');
        seen.set(payload.eventId, { fingerprint, time });
        log('[RFID diagnostic] ' + JSON.stringify({ receivedAt: new Date(time).toISOString(), readerId: payload.readerId, eventId: payload.eventId, kind: payload.kind, uid: payload.uid, byteCount: payload.byteCount, remoteAddress, bookingChanged: false }));
        return { diagnosticReceived: true, reused: false, eventId: payload.eventId };
    };
}
module.exports = { createDiagnostics, diagnosticFields };
