'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const { startBenchServer } = require('../scripts/rfid-bench-server.cjs');
const { signedFields } = require('../scripts/signed-rfid-check-in.cjs');

async function database(route, method = 'GET', value) {
    const response = await fetch('http://127.0.0.1:9000/' + route + '.json?ns=' + project + '-default-rtdb', {
        method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        ...(value === undefined ? {} : { body: JSON.stringify(value) })
    });
    assert.equal(response.status, 200);
    return response.json();
}

(async () => {
    const accounts = await seed();
    const key = 'emulator-only-test-reader-key-0123456789';
    const server = await startBenchServer({ readerKeys: { 'esp1-bench': key }, host: '127.0.0.1', port: 0 });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const preview = await startServer();
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    let sequence = 0;
    const payload = (uid = '0001A20F', byteCount = uid.length / 2) => ({ readerId: 'esp1-bench', eventId: 'bench-test-event-' + (++sequence), uid, byteCount, observedAt: Date.now() });
    async function send(event, valid = true) {
        const signature = createHmac('sha256', valid ? key : 'invalid-reader-secret').update(signedFields(event)).digest('hex');
        const response = await fetch(origin + '/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reader-Signature': signature }, body: JSON.stringify(event) });
        return { status: response.status, body: await response.json() };
    }
    try {
        const fixtures = [['CBLR-970001', '0001A20F', 'Confirmed'], ['CBLR-970002', '00010203040506', 'Confirmed'], ['CBLR-970003', '00010203040506070809', 'Confirmed'], ['CBLR-970004', '0000FFFF', 'Pending Verification']];
        for (const [reference, uid, status] of fixtures) {
            await database('sharedReservations/' + reference, 'PUT', {
                reference, ownerUid: accounts['guest-a'].localId, submissionAttemptId: 'rfid-bench-' + reference,
                checkinDate: '2026-12-27', staySlotId: 'day-retreat', duration: 'Day Retreat (8:00 AM – 6:00 PM)',
                adults: 2, children: 0, senior: 0, totalGuests: 2, honorific: 'Ms.', guestName: 'RFID Bench Fixture',
                email: 'guest-a@example.test', mobile: '00000000000', specialRequests: '',
                facilities: [{ value: 'event', name: 'Celebration Event Package', packageVersion: 2, price: 15000 }],
                prices: { subtotal: 15000, tourismTax: 250, serviceCharge: 1200, total: 16450 }, status, rfidLinked: uid, createdAt: new Date().toISOString()
            });
            await database('rfidAssignments/' + uid, 'PUT', reference);
        }
        const context = await browser.newContext();
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(__dirname, '../node_modules/firebase', path.basename(url.pathname)), 'utf8') });
            if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
            return route.abort();
        });
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:5000/login.html');
        await page.evaluate(async account => SharedReservations.signIn(account.email, account.password, false), accounts['guest-a']);
        await page.goto('http://127.0.0.1:5000/my-reservation.html?reservation=CBLR-970001');
        await page.locator('#bookingStatus', { hasText: 'Confirmed' }).waitFor();
        const event = payload();
        assert.equal((await send(event, false)).status, 401);
        assert.equal((await send({ ...event, observedAt: Date.now() - 16000 })).status, 401);
        assert.equal((await send(payload('001234', 4))).status, 401);
        assert.equal((await send(payload('DEADBEEF'))).status, 422);
        assert.equal((await send(payload('0000FFFF'))).status, 422);
        const results = await Promise.all([send(event), send(event)]);
        assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
        assert.equal(results.find(result => result.status === 200).body.guestName, 'RFID Bench Fixture');
        await page.locator('#bookingStatus', { hasText: 'Checked In' }).waitFor();
        assert.equal((await send(event)).status, 409);
        assert.equal((await send({ ...event, uid: 'DEADBEEF' })).status, 401);
        assert.equal((await send(payload())).status, 422);
        for (const [, uid] of fixtures.slice(1, 3)) assert.equal((await send(payload(uid))).status, 200);
        assert.equal((await database('sharedReservations/CBLR-970004')).status, 'Pending Verification');
        assert.equal(await database('diorama'), null);
        const receipts = await database('verifiedCheckins');
        assert.equal(Object.keys(receipts).length, 3);
        const freshServer = await startBenchServer({ readerKeys: { 'esp1-bench': key }, host: '127.0.0.1', port: 0 });
        const replay = await fetch('http://127.0.0.1:' + freshServer.address().port + '/scan', { method: 'POST', headers: { 'X-Reader-Signature': createHmac('sha256', key).update(signedFields(event)).digest('hex') }, body: JSON.stringify(event) });
        assert.equal(replay.status, 409);
        await new Promise(resolve => freshServer.close(resolve));
        await new Promise(resolve => server.close(resolve));
        await assert.rejects(() => fetch(origin + '/health'));
        console.log('PASS: 4/7/10-byte leading-zero UIDs; signed assigned scan and live My Reservation update; invalid authentication, stale/malformed scan, unassigned and pending rejection; concurrent/replayed/restarted-server rejection; repeated tap rejected; unreachable backend; three receipts and zero diorama data.');
    } finally {
        await browser.close();
        await new Promise(resolve => preview.close(resolve));
        if (server.listening) await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
