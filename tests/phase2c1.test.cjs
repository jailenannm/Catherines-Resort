'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const { createEmulatorVerifier } = require('../scripts/emulator-check-in-verifier.cjs');
const rootPath = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:9000';
const checks = [], errors = [], forbidden = [];
async function request(route, token, method = 'GET', body) {
    const url = new URL(base + '/' + route + '.json');
    url.searchParams.set('ns', project + '-default-rtdb');
    if (token && token !== 'owner') url.searchParams.set('auth', token);
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token === 'owner' ? { Authorization: 'Bearer owner' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
async function main() {
    assert.equal(process.env.GCLOUD_PROJECT, project);
    const accounts = await seed();
    let clock = Date.now();
    const event = (name, uid, extra = {}) => ({ eventId: 'fixture-scan-' + name, readerId: 'emulator-fixture-reader', uid, byteCount: uid.length / 2, fullUid: true, authenticated: true, receivedAt: clock, ...extra });
    const cards = { valid: '0001A20F', failed: '00112233', uncertain: '00010203040506', pending: '11223344', unassigned: '55667788', race: 'ABCDEF01' };
    const events = [event('valid-0001', cards.valid), event('race-first-0001', cards.race), event('race-second-0001', cards.race), event('second-0001', cards.valid), event('unknown-0001', 'FFFFFFFF'), event('pending-0001', cards.pending), event('unassigned-0001', cards.unassigned), event('failed-0001', cards.failed), event('uncertain-0001', cards.uncertain), event('stale-0001', cards.failed, { receivedAt: clock - 15001 }), event('future-0001', cards.failed, { receivedAt: clock + 1 }), event('lossy-0001', '01A2F'), event('untrusted-0001', cards.failed, { authenticated: false }), event('bytecount-0001', cards.failed, { byteCount: 7 }), event('reader-0001', cards.failed, { readerId: 'browser' }), event('partial-0001', cards.failed, { fullUid: false })];
    const refs = { valid: 'CBLR-630001', failed: 'CBLR-630002', uncertain: 'CBLR-630003', pending: 'CBLR-630004', unassigned: 'CBLR-630005', race: 'CBLR-630006' };
    const fixture = (key, index) => ({ reference: refs[key], ownerUid: accounts['guest-a'].localId, submissionAttemptId: 'checkin-test-attempt-' + key, checkinDate: '2026-12-25', duration: '4500', adults: 2, children: 0, senior: 0, totalGuests: 2, honorific: 'Ms.', guestName: 'Emulator check-in guest', mobile: '00000000000', email: 'checkin@example.invalid', specialRequests: 'Fake emulator details only', facilities: [{ value: 'pool', name: 'Swimming Pool', price: 1200 }], prices: { subtotal: 1200, tourismTax: 250, serviceCharge: 96, total: 1546 }, status: key === 'pending' ? 'Pending Verification' : 'Confirmed', rfidLinked: key === 'unassigned' ? '' : cards[key], createdAt: new Date(clock + (key === 'valid' ? 10000 : index)).toISOString() });
    const bookings = Object.fromEntries(Object.keys(refs).map((key, index) => [refs[key], fixture(key, index)]));
    const assignments = Object.fromEntries(Object.keys(cards).map(key => [cards[key], refs[key]]));
    // Malformed pending/unassigned bindings are deliberate negative fixtures,
    // seeded only by the trusted emulator process, never by the web app.
    assert.equal((await request('', 'owner', 'PUT', { sharedReservations: bookings, rfidAssignments: assignments })).status, 200);
    const before = structuredClone(bookings);
    const verify = createEmulatorVerifier({ fixtures: events, now: () => clock });
    for (const name of ['unknown', 'pending', 'unassigned', 'stale', 'future', 'lossy', 'untrusted', 'bytecount', 'reader', 'partial']) {
        const id = events.find(e => e.eventId === 'fixture-scan-' + name + '-0001').eventId;
        await assert.rejects(verify(id));
    }
    await assert.rejects(verify('browser-forged-event-0001'));
    checks.push('Unknown, pending, unassigned, stale, future, lossy/ambiguous, unauthenticated reader, wrong byte count, incomplete and forged events rejected');
    for (const token of [null, accounts['guest-a'].idToken, accounts['guest-b'].idToken, accounts.administrator.idToken]) {
        assert([401, 403].includes((await request('sharedReservations/' + refs.valid + '/status', token, 'PUT', 'Checked In')).status));
        assert([401, 403].includes((await request('verifiedCheckins/forged', token, 'PUT', { reference: refs.valid })).status));
        assert([401, 403].includes((await request('sharedReservations/' + refs.valid + '/rfidLinked', token, 'PUT', 'DEADBEEF')).status));
    }
    assert([401, 403].includes((await request('sharedReservations/' + refs.valid, accounts['guest-b'].idToken)).status));
    assert.deepEqual((await request('sharedReservations', 'owner')).body, before);
    checks.push('Guest, other guest, unauthenticated and admin direct check-in/RFID/receipt writes denied; no rejected scan changed any booking');
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        async function session(account, target) {
            const context = await browser.newContext();
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/admin-dashboard.html') return route.fulfill({ status: 302, headers: { Location: '/admin-reservations.html' } });
                if (url.pathname.includes('diorama') || url.pathname.endsWith('/firebase-config.js')) { forbidden.push(url.href); return route.abort(); }
                if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(rootPath, 'node_modules/firebase', path.basename(url.pathname)), 'utf8') });
                if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
                if (/firebase|emailjs/.test(url.hostname) || ["identitytoolkit.googleapis.com", "securetoken.googleapis.com"].includes(url.hostname)) forbidden.push(url.href);
                return route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            await page.goto('http://127.0.0.1:5000/login.html');
            await page.locator('#email').fill(account.email);
            await page.locator('#password').fill(account.password);
            await page.locator('#loginForm').evaluate(form => form.requestSubmit());
            await page.waitForURL(url => !url.pathname.endsWith('/login.html'));
            await page.goto('http://127.0.0.1:5000/' + target);
            return page;
        }
        const guest = await session(accounts['guest-a'], 'my-reservation.html');
        const admin = await session(accounts.administrator, 'admin-reservations.html');
        const desk = await session(accounts.administrator, 'check-in.html');
        await guest.locator('#bookingStatus', { hasText: 'Confirmed' }).waitFor();
        await desk.locator('#nfcSub', { hasText: 'Live check-in is disabled' }).waitFor();
        assert.equal(await desk.locator('#simScanBtn').isDisabled(), true);
        assert.equal(await desk.locator('#simUid').isDisabled(), true);
        assert.equal(await desk.locator('#gateSwitch').isDisabled(), true);
        assert.equal(await desk.evaluate(() => Boolean(window.DioramaLink || window.ResortDB)), false);
        await desk.evaluate(() => {
            localStorage.setItem('dioramaState', JSON.stringify({ guest: { checkedIn: true }, nfc: { lastUid: '0001A20F', lastScan: Date.now() } }));
            window.dispatchEvent(new CustomEvent('nfc', { detail: { lastUid: '0001A20F', lastScan: Date.now(), checkedIn: true } }));
        });
        assert.equal((await request('sharedReservations/' + refs.valid, 'owner')).body.status, 'Confirmed');
        assert.equal(await desk.locator('#guestInfo').evaluate(el => el.classList.contains('active')), false);
        checks.push('Existing check-in UI uses named shared app, disables live/manual/simulation/gate writes and ignores forged legacy scan/checkedIn flags');
        const results = await Promise.all([verify('fixture-scan-valid-0001'), verify('fixture-scan-valid-0001')]);
        assert(results.every(r => r.success && r.status === 'Checked In' && r.reference === refs.valid));
        assert.equal(results.filter(r => !r.reused).length, 1);
        await assert.rejects(verify('fixture-scan-second-0001'));
        const replay = await verify('fixture-scan-valid-0001');
        assert.equal(replay.reused, true);
        const saved = (await request('sharedReservations/' + refs.valid, 'owner')).body;
        assert.equal(saved.rfidLinked, '0001A20F');
        assert.deepEqual(saved, { ...before[refs.valid], status: 'Checked In' });
        assert.equal(Object.keys((await request('verifiedCheckins', 'owner')).body).length, 1);
        checks.push('Exact leading-zero UID checks in once; simultaneous same-event calls reuse one atomic receipt; new-event replay cannot transition Checked In again; all details preserved');
        await guest.locator('#bookingStatus', { hasText: 'Checked In' }).waitFor();
        assert.equal(await guest.locator('[data-control], .cs-switch').count(), 0);
        await admin.locator('.reservation-row').filter({ hasText: refs.valid }).filter({ hasText: 'CHECKED IN' }).waitFor();
        await desk.locator('#scannerStatus', { hasText: 'Checked In' }).waitFor();
        assert.equal(await desk.locator('#guestRef').textContent(), refs.valid);
        assert.equal(await desk.locator('#gateRow').isVisible(), false);
        assert.equal(await guest.locator('body').innerText().then(text => text.includes(cards.valid)), false);
        await guest.reload();
        await guest.locator('#bookingStatus', { hasText: 'Checked In' }).waitFor();
        checks.push('Guest, Master Reservations and check-in desk reflect server-confirmed Checked In with same reference; reload persists; UID remains absent from guest UI; gate stays hidden');
        let fail = true;
        const failureVerifier = createEmulatorVerifier({ fixtures: events, now: () => clock, transport: async (url, options) => {
            if (options.method === 'PUT' && fail) return new Response('{}', { status: 503 });
            return fetch(url, options);
        }});
        await assert.rejects(failureVerifier('fixture-scan-failed-0001'), /not confirmed/);
        assert.deepEqual((await request('sharedReservations/' + refs.failed, 'owner')).body, before[refs.failed]);
        assert.equal((await request('verifiedCheckins/fixture-scan-failed-0001', 'owner')).body, null);
        fail = false;
        assert.equal((await failureVerifier('fixture-scan-failed-0001')).success, true);
        checks.push('Forced shared save failure leaves booking and receipt unchanged, reports failure; fresh retry succeeds');
        let lost = true;
        const uncertain = createEmulatorVerifier({ fixtures: events, now: () => clock, transport: async (url, options) => {
            const response = await fetch(url, options);
            if (options.method === 'PUT' && response.ok && lost) { lost = false; await response.json(); throw new Error('Lost acknowledgement'); }
            return response;
        }});
        assert.equal((await uncertain('fixture-scan-uncertain-0001')).reused, true);
        assert.equal((await uncertain('fixture-scan-uncertain-0001')).reused, true);
        checks.push('Lost acknowledgement recovered only from matching server receipt/status; retry performs no second transition');
        const racers = await Promise.allSettled([verify('fixture-scan-race-first-0001'), verify('fixture-scan-race-second-0001')]);
        assert.equal(racers.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(racers.filter(result => result.status === 'rejected').length, 1);
        const receipts = (await request('verifiedCheckins', 'owner')).body;
        assert.equal(Object.values(receipts).filter(receipt => receipt.reference === refs.race).length, 1);
        assert.deepEqual((await request('sharedReservations/' + refs.race, 'owner')).body, { ...before[refs.race], status: 'Checked In' });
        checks.push('Two different fresh scan events racing for one booking create exactly one transition and receipt');
        clock += 15001;
        await assert.rejects(verify('fixture-scan-valid-0001'), /Stale/);
        assert.equal((await request('diorama', 'owner')).body, null);
        assert.deepEqual(forbidden, []);
        assert.deepEqual(errors, []);
        assert.equal(await guest.evaluate(() => localStorage.getItem('currentReservation')), null);
        checks.push('Expired scan replay rejected; no local reservation promotion, diorama access, hardware/email/live-project requests or browser errors');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
