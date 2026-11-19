'use strict';
const { createCheckInVerifier } = require('./check-in-verifier.cjs');
// Emulator-only privileged transport. No service key, cloud target, HTTP ingress
// or browser-provided event exists here. Fixtures are held in the Node process.
function createEmulatorVerifier({ fixtures, now, transport = fetch }) {
    if (process.env.GCLOUD_PROJECT !== 'demo-catherines-reservations' || process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9000') {
        throw new Error('Verifier harness requires the isolated demo RTDB emulator.');
    }
    const url = 'http://127.0.0.1:9000/.json?ns=demo-catherines-reservations-default-rtdb';
    const events = new Map(fixtures.map(event => [event.eventId, structuredClone(event)]));
    const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
    return createCheckInVerifier({ now, allowedReaders: ['emulator-fixture-reader'], resolveTrustedScan: id => events.get(id), store: {
        async read() {
            const response = await transport(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' } });
            if (!response.ok || !response.headers.get('ETag')) throw new Error('Cannot verify server state.');
            return { value: await response.json(), version: response.headers.get('ETag') };
        },
        async compareAndSet(version, value) {
            const response = await transport(url, { method: 'PUT', headers: { ...headers, 'if-match': version }, body: JSON.stringify(value) });
            if (response.status === 412) return false;
            if (!response.ok) throw new Error('Server rejected check-in.');
            await response.json();
            return true;
        }
    }});
}
module.exports = { createEmulatorVerifier };
