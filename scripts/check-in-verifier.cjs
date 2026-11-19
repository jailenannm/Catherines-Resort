'use strict';
// Trusted server core. NEVER load in a browser. resolveTrustedScan must resolve
// only authenticated, immutable, server-held reader events, not browser payloads.
// Adapters supply authenticated event sources and any reviewed booking policy.
function createCheckInVerifier({ store, resolveTrustedScan, allowedReaders, now = Date.now, isBookingEligible = () => true }) {
    const canonical = /^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/;
    const savedGuestName = booking => typeof booking.guestName === 'string' ? booking.guestName : '';
    return async function verifyCheckIn(eventId) {
        if (typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(eventId)) throw new Error('Unknown scan event.');
        const event = await resolveTrustedScan(eventId);
        if (!event || event.eventId !== eventId || !allowedReaders.includes(event.readerId) ||
            event.authenticated !== true || event.fullUid !== true || !canonical.test(event.uid) ||
            event.byteCount * 2 !== event.uid.length || ![4, 7, 10].includes(event.byteCount) ||
            !Number.isSafeInteger(event.receivedAt)) throw new Error('Untrusted or incomplete scan.');
        const fresh = () => {
            const age = now() - event.receivedAt;
            if (age < 0 || age > 15000) throw new Error('Stale scan. Tap the card again.');
        };
        // Root compare-and-set atomically binds receipt consumption to the status
        // transition. No browser-local cache/queue and no device side effects.
        for (let attempt = 0; attempt < 8; attempt++) {
            const { value, version } = await store.read();
            const root = value || {};
            fresh();
            const receipt = root.verifiedCheckins?.[eventId];
            if (receipt) {
                if (receipt.uid !== event.uid || receipt.readerId !== event.readerId ||
                    root.sharedReservations?.[receipt.reference]?.status !== 'Checked In' ||
                    root.sharedReservations[receipt.reference].rfidLinked !== event.uid ||
                    root.rfidAssignments?.[event.uid] !== receipt.reference) throw new Error('Invalid prior receipt.');
                return { success: true, reference: receipt.reference, status: 'Checked In', reused: true, guestName: savedGuestName(root.sharedReservations[receipt.reference]) };
            }
            fresh();
            const reference = root.rfidAssignments?.[event.uid];
            const booking = root.sharedReservations?.[reference];
            if (!/^CBLR-[0-9]{6}$/.test(reference || '') || !booking || booking.reference !== reference ||
                booking.rfidLinked !== event.uid || booking.status !== 'Confirmed' || !isBookingEligible(booking)) throw new Error('No Confirmed reservation matches this full card UID.');
            const next = structuredClone(root);
            next.sharedReservations[reference].status = 'Checked In';
            next.verifiedCheckins ||= {};
            next.verifiedCheckins[eventId] = { reference, uid: event.uid, readerId: event.readerId, receivedAt: event.receivedAt, checkedInAt: now() };
            fresh();
            try {
                if (!await store.compareAndSet(version, next)) continue;
                return { success: true, reference, status: 'Checked In', reused: false, guestName: savedGuestName(booking) };
            } catch (cause) {
                // A lost acknowledgement is success ONLY if a fresh server read
                // proves this same event committed. Otherwise retry is explicit.
                const recovered = (await store.read()).value;
                const saved = recovered?.verifiedCheckins?.[eventId];
                if (saved?.reference === reference && saved.uid === event.uid && saved.readerId === event.readerId &&
                    recovered.sharedReservations?.[reference]?.status === 'Checked In' &&
                    recovered.sharedReservations[reference].rfidLinked === event.uid && recovered.rfidAssignments?.[event.uid] === reference) {
                    return { success: true, reference, status: 'Checked In', reused: true, guestName: savedGuestName(recovered.sharedReservations[reference]) };
                }
                throw new Error('Check-in save was not confirmed. Retry the same event while fresh.');
            }
        }
        throw new Error('Check-in was not confirmed after concurrent updates. Retry while the scan is fresh.');
    };
}
module.exports = { createCheckInVerifier };
