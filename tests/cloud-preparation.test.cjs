'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { startServer } = require('./serve.cjs');
const { TARGET_PROJECT, verifyEnvironment, prepareAdminClaim } = require('../scripts/reservations-admin-claim.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
    const configSource = await fs.readFile(path.join(root, 'js/shared-reservations-config.js'), 'utf8');
    const adapterSource = await fs.readFile(path.join(root, 'js/shared-reservations.js'), 'utf8');
    for (const [hostname, port, expected] of [
        ['127.0.0.1', '5000', 'emulator'], ['localhost', '5000', 'emulator'],
        ['[::1]', '5000', 'emulator'], ['127.0.0.1', '5001', 'production'],
        ['localhost', '5001', 'production'], ['reservations.example.test', '443', 'production']
    ]) {
        let used, authCalls = 0, dbCalls = 0, emulatorCalls = 0;
        const auth = {
            currentUser: { uid: 'offline-fixture', isAnonymous: false, async getIdTokenResult() { return { claims: {} }; } },
            onAuthStateChanged(callback) { queueMicrotask(callback); return () => {}; },
            useEmulator() { emulatorCalls++; }
        };
        const db = { useEmulator() { emulatorCalls++; } };
        const context = vm.createContext({ URL, window: { location: { hostname, port }, firebase: {
            initializeApp(options, name) { used = { options, name }; return { auth() { authCalls++; return auth; }, database() { dbCalls++; return db; } }; }
        } } });
        vm.runInContext(configSource, context);
        vm.runInContext(adapterSource, context);
        await context.window.SharedReservations.identity();
        assert.equal(context.window.SHARED_RESERVATIONS_CONFIG.mode, expected);
        assert.equal(used.name, 'shared-reservations');
        assert.equal(used.options.projectId, expected === 'production' ? TARGET_PROJECT : 'demo-catherines-reservations');
        assert.equal(authCalls, 1); assert.equal(dbCalls, 1);
        assert.equal(emulatorCalls, expected === 'emulator' ? 2 : 0);
        assert.equal(context.window.SharedReservations.emailEnabled, false);
    }
    const server = await startServer(0, { cloudTest: true });
    try {
        const origin = 'http://127.0.0.1:' + server.address().port;
        for (const route of ['/login.html', '/register.html', '/reservation.html', '/my-reservation.html', '/admin-reservations.html', '/js/shared-reservations.js']) {
            assert.equal((await fetch(origin + route)).status, 200, route);
        }
        const redirect = await fetch(origin + '/admin-dashboard.html', { redirect: 'manual' });
        assert.equal(redirect.status, 302);
        assert.equal(redirect.headers.get('location'), '/admin-reservations.html');
        for (const route of ['/js/diorama-link.js', '/js/firebase-config.js', '/check-in.html', '/checkout.html', '/cottage.html', '/pool.html', '/ktv.html', '/manual-override.html', '/esp32_firmware/test', '/scripts/reservations-admin-claim.cjs', '/shared-reservations.rules.json']) {
            assert.equal((await fetch(origin + route)).status, 403, route);
        }
    } finally { await new Promise(resolve => server.close(resolve)); }
    const uid = 'offline-test-admin-uid', email = 'offline-admin@example.test';
    let claims = { support: true, nested: { scope: 'existing' } }, reads = 0, writes = 0;
    const auth = {
        async getUser(requested) { assert.equal(requested, uid); reads++; return { uid, email, disabled: false, customClaims: structuredClone(claims) }; },
        async setCustomUserClaims(requested, next) { assert.equal(requested, uid); writes++; claims = structuredClone(next); }
    };
    const base = { auth, projectId: TARGET_PROJECT, uid, expectedEmail: email, log() {} };
    await prepareAdminClaim(base);
    assert.equal(reads, 1); assert.equal(writes, 0);
    await assert.rejects(prepareAdminClaim({ ...base, projectId: 'catherines-diorama' }));
    await assert.rejects(prepareAdminClaim({ ...base, uid: '[paste UID]' }));
    await assert.rejects(prepareAdminClaim({ ...base, expectedEmail: 'wrong@example.test' }));
    await assert.rejects(prepareAdminClaim({ ...base, apply: true, confirm: async () => 'no' }));
    assert.equal(writes, 0);
    await prepareAdminClaim({ ...base, apply: true, confirm: async expected => expected });
    assert.equal(writes, 1);
    assert.deepEqual(claims, { support: true, nested: { scope: 'existing' }, admin: true });
    assert.throws(() => verifyEnvironment({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }));
    assert.throws(() => verifyEnvironment({ GCLOUD_PROJECT: 'catherines-diorama' }));
    verifyEnvironment({});
    console.log('PASS: mode selection, named Auth/RTDB app, email disabled, cloud-test route isolation, claim dry-run/target/UID/email checks, merged claims, and rejected emulator environment. No cloud requests or real credentials used.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
