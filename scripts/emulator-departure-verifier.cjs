'use strict';
// Server-held evidence only. Browser callers use the authenticated emulator adapter.
function createEmulatorDepartureVerifier({ fixtures, now = Date.now, transport = fetch }) {
    const project = 'demo-catherines-reservations';
    const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    if (process.env.GCLOUD_PROJECT !== project || !['127.0.0.1:9000', '127.0.0.1:19000', '127.0.0.1:29000'].includes(host)) throw Error('Departure fixtures require the demo emulator.');
    const events = new Map(fixtures.map(event => [event.eventId, structuredClone(event)]));
    const url = 'http://' + host + '/.json?ns=' + project + '-default-rtdb';
    const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
    async function read() {
        const response = await transport(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(5000) });
        if (!response.ok || !response.headers.get('ETag')) throw Error('Cannot verify departure state.');
        return { root: await response.json() || {}, etag: response.headers.get('ETag') };
    }
    return async function complete(eventId) {
        const event = events.get(eventId);
        const age = now() - event?.receivedAt;
        const adminConfirmed = event?.source === 'admin-confirmed' && typeof event.confirmedBy === 'string' && event.confirmedBy.length > 0 && event.guestDeparted === true && event.cardReadyForReuse === true;
        const verifiedFixture = event?.source !== 'admin-confirmed' && event?.exitConfirmed === true && event.gateClear === true && event.motorStopped === true && event.facilitiesReset === true;
        if (!event || !/^fixture-departure-[A-Za-z0-9_-]{8,80}$/.test(eventId) || !/^CBLR-[0-9]{6}$/.test(event.reference || '') || !Number.isSafeInteger(event.receivedAt) || age < 0 || age > 15000 || event.trusted !== true || !(adminConfirmed || verifiedFixture)) throw Error('No trusted fresh departure evidence.');
        for (let attempt = 0; attempt < 8; attempt++) {
            const { root, etag } = await read();
            const booking = root.sharedReservations?.[event.reference];
            const receipt = root.verifiedDepartures?.[eventId];
            if (receipt) {
                if (receipt.reference !== event.reference || booking?.status !== 'Completed') throw Error('Departure receipt mismatch.');
                return { reference: event.reference, status: 'Completed', reused: true, source: receipt.source };
            }
            if (booking?.status !== 'Checking Out') throw Error('Booking must be Checking Out.');
            if (now() - event.receivedAt > 15000) throw Error('Departure evidence expired.');
            const completedAt = now();
            booking.status = 'Completed';
            const departure = { reference: event.reference, receivedAt: event.receivedAt, completedAt, source: adminConfirmed ? 'admin-confirmed' : 'server-controlled-emulator-fixture' };
            if (adminConfirmed) {
                const uid = booking.rfidLinked || '';
                const cardReleased = Boolean(uid && root.rfidAssignments?.[uid] === event.reference);
                if (cardReleased) delete root.rfidAssignments[uid];
                booking.checkoutConfirmation = { source: 'admin-confirmed', confirmedBy: event.confirmedBy, confirmedAt: completedAt, eventId, cardReleased };
                Object.assign(departure, { confirmedBy: event.confirmedBy, rfidUid: uid, cardReleased });
                root.rfidReleaseHistory ||= {};
                root.rfidReleaseHistory[eventId] = { reference: event.reference, uid, released: cardReleased, releasedBy: event.confirmedBy, releasedAt: completedAt, source: 'admin-confirmed' };
            }
            root.verifiedDepartures ||= {};
            root.verifiedDepartures[eventId] = departure;
            try {
                const response = await transport(url, { method: 'PUT', headers: { ...headers, 'if-match': etag }, body: JSON.stringify(root), signal: AbortSignal.timeout(5000) });
                if (response.status === 412) continue;
                if (!response.ok) throw Error('Save rejected.');
                await response.json();
                return { reference: event.reference, status: 'Completed', reused: false, source: departure.source };
            } catch {
                const saved = (await read()).root;
                if (saved.verifiedDepartures?.[eventId]?.reference === event.reference && saved.sharedReservations?.[event.reference]?.status === 'Completed') return { reference: event.reference, status: 'Completed', reused: true, source: saved.verifiedDepartures[eventId].source };
                throw Error('Departure completion was not confirmed. Retry the same fresh fixture.');
            }
        }
        throw Error('Concurrent departure update. Retry.');
    };
}
module.exports = { createEmulatorDepartureVerifier };
