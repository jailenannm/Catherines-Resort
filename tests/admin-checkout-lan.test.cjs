'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createHmac } = require('node:crypto');
const { chromium } = require('playwright');
const { createEmulatorDepartureVerifier } = require('../scripts/emulator-departure-verifier.cjs');
const { signedFields } = require('../scripts/signed-rfid-check-in.cjs');
const host = process.env.CHECKOUT_TEST_HOST || '192.168.1.35', origin = 'http://' + host + ':' + (process.env.CHECKOUT_TEST_WEB_PORT || 5000), reference = process.env.CHECKOUT_TEST_REFERENCE || 'CBLR-362342', card = 'B2321606';
const base = 'http://' + host + ':' + (process.env.CHECKOUT_TEST_DB_PORT || 9000), namespace = 'demo-catherines-reservations-default-rtdb';
async function read(route) { const response = await fetch(base + '/' + route + '.json?ns=' + namespace, { headers: { Authorization: 'Bearer owner' } }); assert.equal(response.status, 200); return response.json(); }

async function atomicChecks() {
    const event = { eventId: 'fixture-departure-admin-CBLR-950001', reference: 'CBLR-950001', receivedAt: Date.now(), trusted: true, source: 'admin-confirmed', confirmedBy: 'fixture-admin', guestDeparted: true, cardReadyForReuse: true };
    const initial = { sharedReservations: { 'CBLR-950001': { reference: 'CBLR-950001', status: 'Checking Out', rfidLinked: card } }, rfidAssignments: { [card]: 'CBLR-950001' }, verifiedCheckins: { historical: { uid: card } } };
    let state = structuredClone(initial), version = 1, failed = true;
    const transport = async (url, options) => {
        if (options.method === 'PUT') {
            if (failed) return new Response('{}', { status: 503 });
            if (options.headers['if-match'] !== String(version)) return new Response('{}', { status: 412 });
            state = JSON.parse(options.body); version++;
        }
        return new Response(JSON.stringify(state), { headers: { etag: String(version) } });
    };
    const complete = createEmulatorDepartureVerifier({ fixtures: [event], transport });
    await assert.rejects(() => complete(event.eventId), /not confirmed/);
    assert.deepEqual(state, initial);
    failed = false;
    await Promise.all([complete(event.eventId), complete(event.eventId)]);
    assert.equal(state.sharedReservations[event.reference].status, 'Completed');
    assert.equal(state.rfidAssignments[card], undefined);
    assert.equal(Object.keys(state.verifiedDepartures).length, 1);
    assert.equal(state.sharedReservations[event.reference].rfidLinked, card);
    assert.deepEqual(state.verifiedCheckins, initial.verifiedCheckins);
    state = structuredClone(initial); version++;
    state.rfidAssignments[card] = 'CBLR-950002';
    await complete(event.eventId);
    assert.equal(state.rfidAssignments[card], 'CBLR-950002');
    assert.equal(state.sharedReservations[event.reference].checkoutConfirmation.cardReleased, false);
}

(async () => {
    await atomicChecks();
    const resume = process.env.RESUME_CHECKOUT_REFERENCE;
    const before = await read('sharedReservations/' + reference), checkinsBefore = await read('verifiedCheckins');
    if (!resume) { assert.equal(before.status, 'Checking Out'); assert.equal(before.rfidLinked, card); assert.equal(await read('rfidAssignments/' + card), reference); }
    const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const errors = [], forbidden = [];
    try {
        async function session(email) {
            const context = await browser.newContext();
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.hostname === host) return route.continue();
                if (/firebase|emailjs/.test(url.hostname)) forbidden.push(url.hostname);
                return route.abort();
            });
            const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.dismiss());
            await page.goto(origin + '/login.html'); await page.locator('#email').fill(email); await page.locator('#password').fill('TestPass123!'); await page.locator('#loginForm').evaluate(form => form.requestSubmit()); await page.waitForURL(url => !url.pathname.endsWith('/login.html')); return page;
        }
        const guest = await session('guest-a@example.test'), admin = await session('administrator@example.test');
        await guest.goto(origin + '/my-reservation.html?reservation=' + reference); await guest.locator('#bookingStatus', { hasText: resume ? 'Completed' : 'Checking Out' }).waitFor();
        const guestDenied = await guest.evaluate(async reference => { try { await SharedReservations.confirmCheckout(reference, { guestDeparted: true, cardReadyForReuse: true }); return false; } catch { return true; } }, reference); assert(guestDenied);
        const token = await guest.evaluate(() => firebase.app('shared-reservations').auth().currentUser.getIdToken());
        const denied = await fetch('http://' + host + ':8790/admin/confirm-checkout', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, guestDeparted: true, cardReadyForReuse: true }) }); assert.equal(denied.status, 403);
        const anonymous = await fetch('http://' + host + ':8790/admin/confirm-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, guestDeparted: true, cardReadyForReuse: true }) }); assert.equal(anonymous.status, 403);
        const direct = await fetch(base + '/sharedReservations/' + reference + '/status.json?ns=' + namespace + '&auth=' + encodeURIComponent(token), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '"Completed"' }); assert([401, 403].includes(direct.status));
        // A real fresh guest booking is used for duplicate-card rejection and reuse.
        let nextReference = resume;
        if (!resume) {
        await guest.goto(origin + '/reservation.html'); await guest.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        await guest.locator('#checkinDate').fill('2026-12-28'); await guest.locator('#fullName').fill('Synthetic Card Reuse Guest'); await guest.locator('#mobileNumber').fill('00000000000'); await guest.locator('#emailAddress').fill('card-reuse@example.invalid'); await guest.locator('#agreeTerms').check(); await guest.locator('#confirmReservation').click(); await guest.locator('#successModal.show').waitFor();
        nextReference = (await guest.locator('#confirmationNumber').textContent()).trim();
        }
        await admin.goto(origin + '/admin-reservations.html'); await admin.locator('#showingEntriesBadge').waitFor(); await admin.locator('#searchInput').fill(nextReference);
        const nextRow = admin.locator('.reservation-row[data-ref="' + nextReference + '"]'); if (!resume) { await nextRow.locator('.approve-btn').click(); await nextRow.locator('.rfid-panel summary').click(); await nextRow.locator('.rfid-uid-input').fill(card); await nextRow.locator('.assign-rfid-btn').click(); await admin.locator('#showingEntriesBadge', { hasText: 'Card reuse or reassignment is not enabled' }).waitFor();
        assert.equal((await read('sharedReservations/' + nextReference)).rfidLinked, '');
        await admin.locator('#searchInput').fill(reference); const row = admin.locator('.reservation-row[data-ref="' + reference + '"]'); await row.locator('.confirm-checkout-btn').click();
        await admin.locator('#confirmCheckoutDialog[open]').waitFor(); assert.equal(await admin.locator('#checkoutBookingReference').textContent(), reference);
        for (const width of [1440, 390]) {
            await admin.setViewportSize({ width, height: 900 });
            assert(await admin.locator('#confirmCheckoutDialog').evaluate(dialog => { const box = dialog.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth; }));
            await admin.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'admin-checkout-' + width + '.png') });
        }
        await admin.setViewportSize({ width: 1440, height: 900 });
        await admin.locator('#confirmGuestDeparted').check(); await admin.locator('#confirmCardReady').check();
        await admin.route('**:8790/admin/confirm-checkout', route => route.request().method() === 'POST' ? route.fulfill({ status: 503, headers: { 'Access-Control-Allow-Origin': origin }, json: { error: 'Forced completion failure' } }) : route.continue());
        await admin.locator('#saveCheckoutConfirmation').click(); await admin.locator('#checkoutConfirmationFeedback', { hasText: 'Forced completion failure' }).waitFor();
        assert.equal((await read('sharedReservations/' + reference)).status, 'Checking Out'); assert.equal(await read('rfidAssignments/' + card), reference);
        await admin.unroute('**:8790/admin/confirm-checkout');
        let requests = 0; admin.on('request', request => { if (new URL(request.url()).pathname === '/admin/confirm-checkout' && request.method() === 'POST') requests++; });
        await admin.locator('#confirmCheckoutForm').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        await row.locator('.checkin-state', { hasText: 'Completed' }).waitFor(); await admin.locator('#confirmCheckoutDialog').waitFor({ state: 'hidden' }); assert.equal(requests, 1);
        await guest.goto(origin + '/my-reservation.html?reservation=' + reference); await guest.locator('#bookingStatus', { hasText: 'Completed' }).waitFor(); assert.equal(await guest.locator('#rfidAssignment').textContent(), 'Released');
        assert.match(await guest.locator('#statusInstruction').textContent(), /admin-confirmed/);
        }
        const completed = await read('sharedReservations/' + reference); const identity = await admin.evaluate(async () => (await SharedReservations.identity(true)).user.uid);
        assert.equal(completed.checkoutConfirmation.confirmedBy, identity); assert.equal(completed.checkoutConfirmation.source, 'admin-confirmed'); assert(Number.isSafeInteger(completed.checkoutConfirmation.confirmedAt)); assert.equal(completed.rfidLinked, card); assert.equal(await read('rfidAssignments/' + card), null); assert.deepEqual(await read('verifiedCheckins'), checkinsBefore);
        if (!resume) { const comparison = { ...completed }; delete comparison.checkoutConfirmation; comparison.status = before.status; assert.deepEqual(comparison, before); }
        await admin.locator('#searchInput').fill(nextReference); await nextRow.locator('.rfid-panel').evaluate(panel => { panel.open = true; }); await nextRow.locator('.rfid-uid-input').fill(card); await nextRow.locator('.assign-rfid-btn').click(); await nextRow.locator('.rfid-assignment-status', { hasText: /^Assigned$/ }).waitFor(); assert.equal(await read('rfidAssignments/' + card), nextReference);
        const repeat = await admin.evaluate(reference => SharedReservations.confirmCheckout(reference, { guestDeparted: true, cardReadyForReuse: true }), reference); assert.equal(repeat.reused, true); assert.equal(await read('rfidAssignments/' + card), nextReference);
        const keys = JSON.parse(await fs.readFile('.local/rfid-reader.json', 'utf8')); const event = { readerId: 'esp1-bench', eventId: 'checkout-reuse-fixture-' + Date.now(), uid: card, byteCount: 4, observedAt: Date.now() };
        const scan = await fetch('http://' + host + ':' + (process.env.CHECKOUT_TEST_SCAN_PORT || 8787) + '/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reader-Signature': createHmac('sha256', keys['esp1-bench']).update(signedFields(event)).digest('hex') }, body: JSON.stringify(event) }); assert.equal(scan.status, 200); assert.equal((await scan.json()).reference, nextReference);
        assert.equal((await read('sharedReservations/' + reference)).status, 'Completed'); assert.equal((await read('sharedReservations/' + nextReference)).status, 'Checked In');
        await guest.goto(origin + '/my-reservation.html?reservation=' + nextReference); await guest.locator('#bookingStatus', { hasText: 'Checked In' }).waitFor(); await nextRow.locator('.checkin-state', { hasText: 'Checked In' }).waitFor();
        assert.equal(await read('diorama'), null); assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
        console.log(JSON.stringify({ passed: true, completedReference: reference, newReference: nextReference, card, departureSource: 'admin-confirmed', oldStatus: 'Completed', newStatus: 'Checked In', scanWasFixture: true, checks: 'Atomic failed-save preservation, conditional release, duplicates, server/adapter/rules guest denial, card reuse blocked before completion, shared Completed, historical UID/check-in preserved, reused card checks in only new booking and zero hardware/cloud calls.' }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
