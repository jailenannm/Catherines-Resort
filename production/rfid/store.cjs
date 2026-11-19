'use strict';
const { isDeepStrictEqual } = require('node:util');
const PROJECT = 'atherines-resort-reservations';
const DATABASE = 'https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app';

function validateTransition(previous, next, allowedReferences) {
    const added = Object.keys(next.verifiedCheckins || {}).filter(id => !Object.hasOwn(previous.verifiedCheckins || {}, id));
    if (added.length !== 1) throw Error('Invalid receipt transition.');
    const receipt = next.verifiedCheckins[added[0]];
    const booking = previous.sharedReservations?.[receipt.reference];
    if (!allowedReferences.includes(receipt.reference) || !booking || booking.status !== 'Confirmed' ||
        booking.rfidLinked !== receipt.uid || previous.rfidAssignments?.[receipt.uid] !== receipt.reference) throw Error('Reservation is outside the approved test scope.');
    const expected = structuredClone(previous);
    expected.sharedReservations[receipt.reference].status = 'Checked In';
    expected.verifiedCheckins ||= {};
    expected.verifiedCheckins[added[0]] = receipt;
    if (!isDeepStrictEqual(expected, next)) throw Error('Check-in attempted to change unrelated data.');
}

function createProductionStore({ tokenProvider, allowedReferences, transport = fetch }) {
    if (!Array.isArray(allowedReferences) || !allowedReferences.length ||
        allowedReferences.some(reference => !/^CBLR-[0-9]{6}$/.test(reference))) throw Error('Approved test reference required.');
    return {
        async read() {
            const token = await tokenProvider();
            const response = await transport(DATABASE + '/.json', { headers: { Authorization: 'Bearer ' + token, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(8000) });
            if (!response.ok || !response.headers.get('etag')) throw Error('Cannot verify server state.');
            const value = await response.json() || {};
            return { value, version: { etag: response.headers.get('etag'), previous: value } };
        },
        async compareAndSet(version, next) {
            validateTransition(version.previous, next, allowedReferences);
            const token = await tokenProvider();
            const response = await transport(DATABASE + '/.json', { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'if-match': version.etag }, body: JSON.stringify(next), signal: AbortSignal.timeout(8000) });
            if (response.status === 412) return false;
            if (!response.ok) throw Error('Server rejected check-in.');
            await response.json();
            return true;
        }
    };
}
module.exports = { PROJECT, DATABASE, createProductionStore, validateTransition };
