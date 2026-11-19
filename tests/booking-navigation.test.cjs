'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const root = path.resolve(__dirname, '..'), origin = 'http://127.0.0.1:5000';
const checks = [], errors = [], forbidden = [];
async function main() {
    assert.equal(process.env.GCLOUD_PROJECT, project);
    const accounts = await seed();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    try {
        async function session() {
            const context = await browser.newContext();
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/admin-dashboard.html') return route.fulfill({ status: 302, headers: { Location: origin + '/admin-reservations.html' } });
                if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'node_modules/firebase', path.basename(url.pathname)), 'utf8') });
                if (url.pathname.includes('email.min.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.emailjs={init(){},send(){throw new Error("No emails in navigation test")}}' });
                if (['localhost','127.0.0.1'].includes(url.hostname)) return route.continue();
                if (/firebase|emailjs/.test(url.hostname) || ['identitytoolkit.googleapis.com','securetoken.googleapis.com'].includes(url.hostname)) forbidden.push(url.hostname);
                return route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            return { page, context };
        }
        async function login(page, account = accounts['guest-a']) {
            await page.locator('#email').fill(account.email);
            await page.locator('#password').fill(account.password);
            await page.locator('#loginForm').evaluate(form => form.requestSubmit());
            await page.waitForURL(url => !url.pathname.endsWith('/login.html'));
        }
        const guest = await session();
        await guest.page.goto(origin + '/login.html'); await login(guest.page);
        for (const selector of ['header [data-book]', 'a[data-book]:has-text("Make a Reservation")']) {
            await guest.page.goto(origin + '/index.html');
            await guest.page.evaluate(() => { localStorage.removeItem('isLoggedIn'); localStorage.setItem('resortUsers','[]'); });
            await guest.page.locator(selector).first().click();
            await guest.page.waitForURL('**/reservation.html');
            await guest.page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
            assert.equal(await guest.page.evaluate(async () => (await SharedReservations.identity()).user.uid), accounts['guest-a'].localId);
        }
        checks.push('Signed-in guest reaches booking from Book Now and Make a Reservation even without local flags or local accounts');
        for (const selector of ['header [data-book]', 'a[data-book]:has-text("Make a Reservation")']) {
            const visitor = await session();
            await visitor.page.goto(origin + '/index.html');
            await visitor.page.locator(selector).first().click();
            await visitor.page.waitForURL('**/login.html?next=reservation.html');
            await login(visitor.page);
            await visitor.page.waitForURL('**/reservation.html');
            await visitor.page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
            await visitor.context.close();
        }
        checks.push('Both signed-out booking links reach login with fixed booking return and continue to reservation after real emulator sign-in');
        await guest.page.goto(origin + '/reservation.html');
        await guest.page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        await guest.page.locator('#fullName').fill('Preserved booking visitor');
        await guest.page.locator('#checkinDate').fill('2026-12-23');
        await guest.page.locator('#specialRequests').fill('Keep this draft through sign-in');
        for (const box of await guest.page.locator('input[name="facility"]').all()) if (await box.isChecked()) await box.locator('..').click();
        await guest.page.locator('input[name="facility"][value="ktv"]').locator('..').click();
        await guest.page.evaluate(() => SharedReservations.signOut());
        await guest.page.reload();
        await guest.page.waitForURL('**/login.html?next=reservation.html');
        await login(guest.page);
        await guest.page.waitForURL('**/reservation.html');
        await guest.page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        assert.equal(await guest.page.locator('#fullName').inputValue(), 'Preserved booking visitor');
        assert.equal(await guest.page.locator('#checkinDate').inputValue(), '2026-12-23');
        assert.equal(await guest.page.locator('#specialRequests').inputValue(), 'Keep this draft through sign-in');
        assert.deepEqual(await guest.page.locator('input[name="facility"]:checked').evaluateAll(boxes => boxes.map(box => box.value)), ['ktv']);
        await guest.page.reload();
        await guest.page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        assert(guest.page.url().endsWith('/reservation.html'));
        checks.push('Direct signed-in visit and refresh wait for restored Auth; signed-out direct visit returns through login while preserving draft date/name/requests/package');
        await guest.page.goto(origin + '/index.html');
        await guest.page.evaluate(() => SharedReservations.signOut());
        await guest.page.locator('#stayDate').fill('2026-12-24');
        await guest.page.locator('#availabilityForm').evaluate(form => form.requestSubmit());
        await guest.page.waitForURL('**/login.html?next=reservation.html');
        await login(guest.page);
        await guest.page.waitForURL('**/reservation.html');
        await guest.page.waitForFunction(() => !document.getElementById('confirmReservation').disabled);
        assert.equal(await guest.page.locator('#checkinDate').inputValue(), '2026-12-24');
        checks.push('Fresh homepage availability choices survive the sign-in roundtrip and take priority over an older form draft');
        const unsafe = await session();
        await unsafe.page.goto(origin + '/login.html?next=https%3A%2F%2Fevil.invalid%2F');
        await login(unsafe.page);
        assert(unsafe.page.url().endsWith('/index.html'));
        const admin = await session();
        await admin.page.goto(origin + '/login.html?next=reservation.html');
        await login(admin.page, accounts.administrator);
        await admin.page.waitForURL('**/admin-reservations.html');
        checks.push('Unallowlisted return URL is ignored; trusted administrator keeps original admin-dashboard route (redirected safely in test)');
        assert.deepEqual(errors, []); assert.deepEqual(forbidden, []);
        console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
