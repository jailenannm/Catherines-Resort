'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');
const database = 'http://127.0.0.1:9000';

async function rules(value) {
    const response = await fetch(database + '/.settings/rules.json?ns=' + project + '-default-rtdb', {
        method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(value)
    });
    assert.equal(response.status, 200);
}
async function stored(reference) {
    const response = await fetch(database + '/sharedReservations/' + reference + '.json?ns=' + project + '-default-rtdb', { headers: { Authorization: 'Bearer owner' } });
    return response.json();
}

(async () => {
    const fixedText = await fs.readFile(path.join(root, 'shared-reservations.rules.json'), 'utf8');
    assert(!/[^\x00-\x7f]/.test(fixedText), 'Deployable rules must resist clipboard encoding corruption.');
    const fixed = JSON.parse(fixedText);
    const broken = structuredClone(fixed);
    const corruptedDash = String.fromCharCode(0xe2, 0x20ac, 0x201c);
    broken.rules.sharedReservations.$reference['.validate'] = broken.rules.sharedReservations.$reference['.validate'].replaceAll('\u2013', corruptedDash);
    const accounts = await seed();
    await rules(broken);
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
    const writes = [], statuses = [], errors = [], forbidden = [];
    try {
        const context = await browser.newContext();
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'node_modules/firebase', path.basename(url.pathname)), 'utf8') });
            if (url.pathname.includes('email.min.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.emailjs={init(){},send(){throw Error("Email disabled")}}' });
            if (['/js/firebase-config.js', '/js/diorama-link.js'].includes(url.pathname)) { forbidden.push(url.pathname); return route.abort(); }
            if (route.request().method() === 'PUT' && url.pathname.startsWith('/sharedReservations/')) {
                const payload = JSON.parse(route.request().postData());
                const claims = JSON.parse(Buffer.from(url.searchParams.get('auth').split('.')[1], 'base64url').toString());
                writes.push({ payload, audience: claims.aud, provider: claims.firebase.sign_in_provider, admin: claims.admin === true, ownerMatches: payload.ownerUid === claims.user_id });
            }
            if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue();
            return route.abort();
        });
        const page = await context.newPage();
        page.on('response', response => {
            if (response.request().method() === 'PUT' && new URL(response.url()).pathname.startsWith('/sharedReservations/')) statuses.push(response.status());
        });
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.dismiss());
        await page.goto('http://127.0.0.1:5000/login.html');
        await page.evaluate(async account => SharedReservations.signIn(account.email, account.password, false), accounts['guest-a']);
        await page.goto('http://127.0.0.1:5000/reservation.html');
        await page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        await page.locator('#checkinDate').fill('2026-12-28');
        await page.locator('#fullName').fill('Booking 401 Regression Guest');
        await page.locator('#mobileNumber').fill('00000000000');
        await page.locator('#emailAddress').fill('booking-401@example.invalid');
        await page.locator('#specialRequests').fill('Preserve this form and retry identity.');
        await page.locator('#agreeTerms').check();
        await page.locator('#confirmReservation').click();
        await page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        assert.equal(writes.length, 1);
        assert.equal(statuses[0], 401);
        const first = writes[0];
        assert.equal(first.audience, project);
        assert.equal(first.provider, 'password');
        assert.equal(first.admin, false);
        assert.equal(first.ownerMatches, true);
        assert.equal(await stored(first.payload.reference), null);
        assert.equal(await page.locator('#successModal.show').count(), 0);
        assert.equal(await page.locator('#fullName').inputValue(), 'Booking 401 Regression Guest');
        assert.equal(await page.locator('#specialRequests').inputValue(), 'Preserve this form and retry identity.');
        assert(await page.locator('#agreeTerms').isChecked());
        await rules(fixed);
        await page.locator('#confirmReservation').evaluate(button => { button.click(); button.click(); });
        await page.locator('#successModal.show').waitFor();
        assert.equal(writes.length, 2);
        assert.deepEqual(writes[1].payload, first.payload);
        assert.equal(await page.locator('#confirmationNumber').textContent(), first.payload.reference);
        assert.equal((await stored(first.payload.reference)).status, 'Pending Verification');
        assert.equal((await stored(first.payload.reference)).rfidLinked, '');
        await page.locator('#confirmReservation').evaluate(button => button.click());
        assert.equal(writes.length, 2);
        const slotsContext = { window: {} };
        vm.runInNewContext(await fs.readFile(path.join(root, 'js/booking-slots.js'), 'utf8'), slotsContext);
        const token = await page.evaluate(() => firebase.app('shared-reservations').auth().currentUser.getIdToken());
        let counter = 0;
        for (const [staySlotId, slot] of Object.entries(slotsContext.window.BookingSlots)) {
            const record = { ...first.payload, reference: 'CBLR-' + (980010 + counter++), submissionAttemptId: 'booking-rule-slot-fixture-' + counter, staySlotId, duration: slot.label };
            const response = await fetch(database + '/sharedReservations/' + record.reference + '.json?ns=' + project + '-default-rtdb&auth=' + encodeURIComponent(token), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
            assert.equal(response.status, 200, staySlotId);
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(forbidden, []);
        console.log('PASS: published encoding defect reproduces a regular-guest rejection with no saved record; form retained; repaired rules accept identical retry/reference exactly once, correct confirmation reference and all three slots. Named-app password token audience/owner verified; no email/device calls.');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
