'use strict';
// Attach to the dedicated running LAN demo. Creates one synthetic fixture booking.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createHmac } = require('node:crypto');
const { chromium } = require('playwright');
const { signedFields } = require('../scripts/signed-rfid-check-in.cjs');

(async () => {
    const host = process.env.LAN_DEMO_HOST || '192.168.1.35';
    const origin = 'http://' + host + ':5000';
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const cloudCalls = [], errors = [], emulatorOrigins = new Set();
    try {
        async function session(email) {
            const context = await browser.newContext();
            await context.route('**/*', route => {
                const url = new URL(route.request().url());
                if (url.hostname === host) {
                    if (['9000', '9099'].includes(url.port)) emulatorOrigins.add(url.origin);
                    return route.continue();
                }
                if (/firebase|googleapis|emailjs/.test(url.hostname)) cloudCalls.push(url.hostname);
                return route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            page.on('dialog', dialog => dialog.dismiss());
            await page.goto(origin + '/login.html');
            await page.locator('#email').fill(email);
            await page.locator('#password').fill('TestPass123!');
            await page.locator('#loginForm').evaluate(form => form.requestSubmit());
            await page.waitForURL(url => !url.pathname.endsWith('/login.html'));
            const config = await page.evaluate(() => ({ mode: SHARED_RESERVATIONS_CONFIG.mode, auth: SHARED_RESERVATIONS_CONFIG.authEmulatorUrl, db: SHARED_RESERVATIONS_CONFIG.databaseEmulatorUrl, project: SHARED_RESERVATIONS_CONFIG.emulatorProjectId }));
            assert.deepEqual(config, { mode: 'emulator', auth: 'http://' + host + ':9099', db: 'http://' + host + ':9000', project: 'demo-catherines-reservations' });
            return page;
        }
        const guest = await session('guest-a@example.test');
        const admin = await session('administrator@example.test');
        await guest.goto(origin + '/reservation.html');
        await guest.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        await guest.locator('#checkinDate').fill('2026-12-28');
        await guest.locator('#fullName').fill('Synthetic LAN Workflow Guest');
        await guest.locator('#mobileNumber').fill('00000000000');
        await guest.locator('#emailAddress').fill('lan-demo@example.invalid');
        for (const input of await guest.locator('input[name="facility"]').all()) if (await input.isChecked()) await input.uncheck();
        await guest.locator('input[value="event"]').check();
        await guest.locator('#agreeTerms').check();
        await guest.locator('#confirmReservation').click();
        await guest.locator('#successModal.show').waitFor();
        const reference = (await guest.locator('#confirmationNumber').textContent()).trim();
        await guest.goto(origin + '/my-reservation.html?reservation=' + reference);
        await guest.locator('#bookingStatus', { hasText: 'Pending Verification' }).waitFor();
        await admin.goto(origin + '/admin-reservations.html');
        await admin.locator('#showingEntriesBadge').waitFor();
        await admin.locator('#searchInput').fill(reference);
        const row = admin.locator('.reservation-row[data-ref="' + reference + '"]');
        await row.locator('.approve-btn').click();
        await guest.locator('#bookingStatus', { hasText: 'Confirmed' }).waitFor();
        const uid = '00' + Date.now().toString(16).slice(-6).toUpperCase();
        await row.locator('.rfid-panel summary').click();
        await row.locator('.rfid-uid-input').fill(uid);
        await row.locator('.assign-rfid-btn').click();
        await guest.locator('#rfidAssignment', { hasText: /^Assigned$/ }).waitFor();
        const keys = JSON.parse(await fs.readFile('.local/rfid-reader.json', 'utf8'));
        const event = { readerId: 'esp1-bench', eventId: 'lan-demo-fixture-' + Date.now(), uid, byteCount: 4, observedAt: Date.now() };
        async function scan() {
            return fetch('http://' + host + ':8787/scan', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Reader-Signature': createHmac('sha256', keys['esp1-bench']).update(signedFields(event)).digest('hex') }, body: JSON.stringify(event) });
        }
        assert.equal((await scan()).status, 200);
        await guest.locator('#bookingStatus', { hasText: 'Checked In' }).waitFor();
        await row.locator('.checkin-state', { hasText: 'Checked In' }).waitFor();
        assert.equal((await scan()).status, 409);
        await guest.goto(origin + '/guest-dashboard.html?reservation=' + reference);
        await guest.locator('#eventSection').waitFor();
        assert.equal(await guest.evaluate(() => GuestAccess.guestAction('pool')), false);
        for (const route of ['/.local/rfid-reader.json', '/esp32_firmware/RFID_WiFi_Bench/bench-secrets.h', '/scripts/rfid-bench-server.cjs', '/firebase.lan-demo.json', '/js/firebase-config.js', '/js/diorama-link.js']) assert.equal((await fetch(origin + route)).status, 403);
        assert.deepEqual(cloudCalls.filter(host => !host.includes('fonts.googleapis.com')), []);
        assert.deepEqual(errors, []);
        assert(emulatorOrigins.has('http://' + host + ':9099'));
        assert(emulatorOrigins.has('http://' + host + ':9000'));
        console.log(JSON.stringify({ passed: true, reference, fixtureUid: uid, status: 'Checked In', emulatorOrigins: [...emulatorOrigins], physicalCardUsed: false, checks: 'Separate LAN browser sessions: booking, admin approval/RFID, signed fixture check-in, shared status, replay rejection, local SDK loading, denied private files, guest hardware disabled and zero cloud Firebase calls.' }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
