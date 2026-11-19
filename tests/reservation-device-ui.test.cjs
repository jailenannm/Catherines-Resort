'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const commands = [];
    let acknowledgement = false, fail = false, malformed = false;
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.port === '15000') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width"><main id="controlsSection"></main>' });
            if (url.port === '8787') {
                if (route.request().method() === 'POST') {
                    commands.push(JSON.parse(route.request().postData()));
                    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://192.0.2.1:15000' }, body: JSON.stringify(malformed ? {} : { accepted: true }) });
                }
                return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://192.0.2.1:15000' }, body: JSON.stringify({ esp2: { state: acknowledgement ? 'Device acknowledged' : 'Command pending', desired: true, actual: acknowledgement ? true : null } }) });
            }
            return route.abort();
        });
        await page.goto('http://192.0.2.1:15000/');
        assert.equal(await page.evaluate(() => isSecureContext), false);
        await page.evaluate(() => {
            window.SHARED_RESERVATIONS_CONFIG = { mode: 'emulator', deviceSyncEnabled: true };
            window.SharedReservations = { identity: async () => ({ user: { getIdToken: async () => 'test-only-token' } }) };
            Object.defineProperty(crypto, 'randomUUID', { value: undefined }); // LAN HTTP has no randomUUID.
            window.testEligible = true;
            window.GuestAccess = {
                accessFor: () => ({ allowed: window.testEligible, reason: 'Facility access is locked.', reservation: { reference: 'CBLR-810001' } }),
                subscribe: listener => { window.testListener = listener; listener(); return () => {}; }
            };
        });
        await page.addScriptTag({ content: await fs.readFile('js/reservation-device-controls.js', 'utf8') });
        await page.evaluate(() => document.dispatchEvent(new Event('DOMContentLoaded')));
        await page.locator('[data-feedback]', { hasText: 'Command pending' }).waitFor();
        await page.getByRole('button', { name: 'COTTAGES ON' }).click();
        await page.locator('[data-feedback]', { hasText: 'Command pending' }).waitFor();
        assert.equal(commands.length, 1); assert.equal(commands[0].on, true);
        assert.match(await page.locator('[data-feedback]').textContent(), /Unknown/);
        acknowledgement = true;
        await page.evaluate(() => window.testListener());
        await page.locator('[data-feedback]', { hasText: 'Device acknowledged' }).waitFor();
        fail = true;
        await page.getByRole('button', { name: 'COTTAGES OFF' }).click();
        const failedRequest = commands.at(-1);
        await page.waitForTimeout(2700);
        assert.match(await page.locator('[data-feedback]').textContent(), /could not be verified/);
        await page.waitForFunction(() => !document.querySelector('button').disabled);
        await page.getByRole('button', { name: 'COTTAGES OFF' }).click();
        assert.equal(commands.at(-1).requestId, failedRequest.requestId);
        fail = false; malformed = true;
        await page.waitForFunction(() => !document.querySelector('button').disabled);
        await page.getByRole('button', { name: 'COTTAGES OFF' }).click();
        await page.locator('[data-feedback]', { hasText: 'Save unconfirmed' }).waitFor();
        const uncertainId = commands.at(-1).requestId;
        malformed = false;
        await page.getByRole('button', { name: 'COTTAGES OFF' }).click();
        await page.locator('[data-feedback]', { hasText: 'Device acknowledged' }).waitFor();
        assert.equal(commands.at(-1).requestId, uncertainId);
        await page.evaluate(() => { window.testEligible = false; window.testListener(); });
        assert(await page.getByRole('button', { name: 'COTTAGES ON' }).isDisabled());
        assert.match(await page.locator('[data-feedback]').textContent(), /locked/);
        for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        console.log('PASS: ON/OFF requests, desired versus acknowledged feedback, unknown output before acknowledgement, same-ID failure retry, revoked eligibility lockout and desktop/mobile fit. Browser network fixtures only.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
