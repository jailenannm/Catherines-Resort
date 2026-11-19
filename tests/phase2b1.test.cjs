'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:5000';
const base = 'http://127.0.0.1:9000';
const checks = [], exceptions = [], forbidden = [];
async function request(route, token, method = 'GET', body, headers = {}) {
    const url = new URL(base + '/' + route + '.json');
    url.searchParams.set('ns', project + '-default-rtdb');
    if (token) url.searchParams.set('auth', token);
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
async function until(predicate, label) {
    const start = Date.now();
    while (!await predicate()) {
        if (Date.now() - start > 10000) throw new Error('Timed out: ' + label);
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}
async function main() {
    assert.equal(process.env.GCLOUD_PROJECT, project, 'Use the demo-project emulator command');
    const accounts = await seed();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        async function session(account, options = {}) {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/admin-dashboard.html') {
                    await route.fulfill({ status: 302, headers: { Location: origin + '/admin-reservations.html' } }); return;
                }
                if (/\/diorama(?:\/|\.)/.test(url.pathname) && route.request().method() !== 'GET') forbidden.push(url.href);
                if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) {
                    await route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'node_modules/firebase', path.basename(url.pathname)), 'utf8') }); return;
                }
                if (url.pathname.includes('email.min.js')) {
                    await route.fulfill({ contentType: 'text/javascript', body: 'window.emailjs={init(){},send(){window.__emailCalls=(window.__emailCalls||0)+1;return Promise.reject(new Error("Email disabled in test"))}};' }); return;
                }
                if (['127.0.0.1', 'localhost'].includes(url.hostname)) { await route.continue(); return; }
                if (url.hostname.includes('firebase') || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(url.hostname) || url.hostname.includes('emailjs')) forbidden.push(url.href);
                await route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => exceptions.push(error.message));
            page.on('dialog', dialog => dialog.dismiss());
            await page.goto(origin + '/login.html');
            await page.locator('#email').fill(account.email);
            await page.locator('#password').fill(account.password);
            await page.locator('#loginForm').evaluate(form => form.requestSubmit());
            await page.waitForURL(url => !url.pathname.endsWith('/login.html'));
            return { context, page };
        }
        const guest = await session(accounts['guest-a']);
        const admin = await session(accounts.administrator);
        const otherAdmin = await session(accounts.administrator);
        await guest.page.goto(origin + '/reservation.html');
        await guest.page.locator('#checkinDate').fill('2026-12-20');
        await guest.page.locator('#fullName').fill('Approval Test Guest with a deliberately long name');
        await guest.page.locator('#mobileNumber').fill('00000000000');
        await guest.page.locator('#emailAddress').fill('approval-test@example.invalid');
        await guest.page.locator('#specialRequests').fill('Emulator only. Preserve these booking details during approval.');
        for (const checkbox of await guest.page.locator('input[name="facility"]').all()) {
            if (await checkbox.isChecked()) await checkbox.locator('..').click();
        }
        await guest.page.locator('input[value="pool"][name="facility"]').locator('..').click();
        await guest.page.locator('#agreeTerms').check();
        await guest.page.locator('#confirmReservation').click();
        await guest.page.locator('#successModal.show').waitFor();
        const reference = await guest.page.locator('#confirmationNumber').textContent();
        const route = 'sharedReservations/' + reference;
        const before = (await request(route, accounts['guest-a'].idToken)).body;
        assert.equal(before.status, 'Pending Verification');
        assert.equal(before.rfidLinked, '');
        await guest.page.goto(origin + '/my-reservation.html');
        await guest.page.locator('#bookingStatus', { hasText: 'Pending Verification' }).waitFor();
        for (const page of [admin.page, otherAdmin.page]) {
            await page.goto(origin + '/admin-reservations.html');
            await page.locator('.approve-btn[data-ref="' + reference + '"]').waitFor();
        }
        checks.push('Created pending shared booking and loaded owner plus two independent admin sessions');
        assert.equal((await request(route + '/status', accounts['guest-a'].idToken, 'PUT', 'Confirmed')).status, 401);
        assert.equal((await request(route + '/status', null, 'PUT', 'Confirmed')).status, 401);
        const guestAttempt = await guest.page.evaluate(async ref => {
            localStorage.setItem('userRole', 'admin');
            try { await SharedReservations.approveReservation(ref); return 'unexpected success'; }
            catch (error) { return error.message; }
        }, reference);
        assert.match(guestAttempt, /Administrator sign-in/);
        for (const bad of [
            { status: 'Confirmed', guestName: 'Tampered name' },
            { status: 'Confirmed', ownerUid: accounts.administrator.localId },
            { status: 'Confirmed', prices: { ...before.prices, total: 0 } },
            { status: 'Confirmed', facilities: [] },
            { status: 'Confirmed', rfidLinked: 'FABRICATED' }
        ]) assert.equal((await request(route, accounts.administrator.idToken, 'PATCH', bad)).status, 401);
        assert.equal((await request(route, accounts.administrator.idToken, 'PUT', { ...before, status: 'Confirmed' })).status, 401);
        assert.equal((await request(route + '/rfidLinked', accounts.administrator.idToken, 'PUT', 'RFID-123')).status, 401);
        for (const status of ['Active', 'In Facility', 'Checked In', 'Cancelled']) {
            assert.equal((await request(route + '/status', accounts.administrator.idToken, 'PUT', status)).status, 401);
        }
        assert.deepEqual((await request(route, accounts['guest-a'].idToken)).body, before);
        checks.push('Rules deny guest/unauthenticated approval, role spoofing, details/RFID changes and other status transitions atomically');
        const statusPattern = '**/sharedReservations/' + reference + '/status.json?*';
        await admin.page.route(statusPattern, async route => {
            if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"forced failure"}' });
            else await route.continue();
        });
        await admin.page.locator('.approve-btn').click();
        await admin.page.waitForFunction(() => document.querySelector('.showing-badge').textContent.includes('not confirmed'));
        assert.equal(await admin.page.locator('.approve-btn').isEnabled(), true);
        assert.deepEqual((await request(route, accounts['guest-a'].idToken)).body, before);
        assert.equal(await guest.page.locator('#bookingStatus').textContent(), 'Pending Verification');
        await admin.page.unroute(statusPattern);
        checks.push('Failed approval shows feedback, leaves pending data unchanged and re-enables retry');
        let release, arrivals = 0;
        const barrier = new Promise(resolve => { release = resolve; });
        const statuses = [];
        for (const page of [admin.page, otherAdmin.page]) {
            await page.route(statusPattern, async route => {
                if (route.request().method() !== 'PUT') { await route.continue(); return; }
                arrivals++;
                assert.equal(route.request().postData(), '"Confirmed"');
                assert(route.request().headers()['if-match']);
                await barrier;
                const response = await route.fetch();
                statuses.push(response.status());
                await route.fulfill({ response });
            });
        }
        await Promise.all([
            admin.page.locator('.approve-btn').evaluate(button => { button.click(); button.click(); }),
            otherAdmin.page.locator('.approve-btn').evaluate(button => button.click())
        ]);
        await until(() => arrivals === 2, 'two conditional admin approvals');
        assert.equal(await admin.page.locator('.approve-btn').isDisabled(), true);
        assert.equal(await otherAdmin.page.locator('.approve-btn').isDisabled(), true);
        assert.equal((await request(route, accounts['guest-a'].idToken)).body.status, 'Pending Verification');
        assert.equal(await guest.page.locator('#bookingStatus').textContent(), 'Pending Verification');
        release();
        await guest.page.waitForFunction(() => document.querySelector('#bookingStatus').textContent === 'Confirmed');
        await until(() => statuses.length === 2, 'both approval responses');
        assert.equal(statuses.filter(value => value === 200).length, 1);
        assert(statuses.some(value => [401, 403, 412].includes(value)));
        for (const page of [admin.page, otherAdmin.page]) {
            await page.locator('.checkin-state.confirmed').waitFor();
            await page.waitForFunction(() => document.querySelector('.showing-badge').textContent.toLowerCase().includes('confirmed'));
            await page.unroute(statusPattern);
        }
        const after = (await request(route, accounts['guest-a'].idToken)).body;
        assert.deepEqual(after, { ...before, status: 'Confirmed' });
        assert.equal(after.rfidLinked, '');
        assert.equal(after.nodeNumber, undefined);
        assert.equal(await admin.page.locator('#statActiveGuests').textContent(), '0');
        assert(!(await admin.page.locator('.folio').first().textContent()).includes('Awaiting Settlement'));
        assert.equal(await guest.page.locator('[data-control], .cs-switch').count(), 0);
        assert.equal(await guest.page.locator('#bookingStatus').textContent(), 'Confirmed');
        checks.push('One server transition across repeated clicks and concurrent admins; owner live view becomes Confirmed; all other booking fields stay identical');
        let repeatedWrites = 0;
        await admin.page.route(statusPattern, async route => { if (route.request().method() === 'PUT') repeatedWrites++; await route.continue(); });
        const repeated = await admin.page.evaluate(async ref => Promise.all([SharedReservations.approveReservation(ref), SharedReservations.approveReservation(ref)]), reference);
        assert(repeated.every(value => value.alreadyConfirmed && value.status === 'Confirmed'));
        assert.equal(repeatedWrites, 0);
        assert.equal((await request(route + '/status', accounts.administrator.idToken, 'PUT', 'Confirmed')).status, 401);
        assert.equal((await request(route + '/status', accounts.administrator.idToken, 'PUT', 'Pending Verification')).status, 401);
        assert.equal((await request(route, accounts.administrator.idToken, 'DELETE')).status, 401);
        await admin.page.unroute(statusPattern);
        await guest.page.reload();
        await guest.page.locator('#bookingStatus', { hasText: 'Confirmed' }).waitFor();
        checks.push('Repeat approvals reuse server-confirmed state with zero additional writes; rollback/no-op/delete denied; refresh persists Confirmed');
        const shellSource = await fs.readFile(path.join(root, 'js/control-shell.js'), 'utf8');
        const local = new Map([['isLoggedIn', 'true'], ['userRole', 'guest'], ['currentReservation', JSON.stringify(after)]]);
        const shellContext = vm.createContext({ console, window: {}, localStorage: { getItem: key => local.get(key) || null }, document: {} });
        vm.runInContext(shellSource, shellContext);
        assert.equal(shellContext.window.ControlShell.isCheckedIn(after), false);
        assert.equal(shellContext.window.ControlShell.accessFor('pool').allowed, false);
        checks.push('Actual ControlShell check-in and pool-access predicates remain locked after approval');
        // An acknowledgement lost after a real emulator commit cannot cause a second transition.
        let uncertainReference = 'CBLR-700001';
        while ((await request('sharedReservations/' + uncertainReference, accounts.administrator.idToken)).body) uncertainReference = 'CBLR-' + (Number(uncertainReference.slice(5)) + 1);
        const uncertainRoute = 'sharedReservations/' + uncertainReference;
        assert.equal((await request(uncertainRoute, accounts['guest-a'].idToken, 'PUT', { ...before, reference: uncertainReference, submissionAttemptId: 'uncertain-approval-attempt-0001' })).status, 200);
        let committed = false, lostWrites = 0;
        const uncertainPattern = '**/sharedReservations/' + uncertainReference + '/status.json?*';
        await admin.page.route(uncertainPattern, async route => {
            if (route.request().method() === 'PUT') {
                const reply = await route.fetch(); assert.equal(reply.status(), 200); committed = true; lostWrites++;
                await route.abort();
            } else if (committed) await route.abort();
            else await route.continue();
        });
        const lost = await admin.page.evaluate(async ref => {
            try { return await SharedReservations.approveReservation(ref); } catch (error) { return { error: error.message }; }
        }, uncertainReference);
        assert.match(lost.error, /not confirmed/);
        assert.equal((await request(uncertainRoute, accounts['guest-a'].idToken)).body.status, 'Confirmed');
        await admin.page.unroute(uncertainPattern);
        const recovered = await admin.page.evaluate(ref => SharedReservations.approveReservation(ref), uncertainReference);
        assert.equal(recovered.alreadyConfirmed, true); assert.equal(lostWrites, 1);
        checks.push('Lost approval acknowledgement stays unconfirmed until a fresh server read; retry reuses the committed state');
        // Check desktop 100% and the equivalent 200% zoom viewport/DPR: same
        // physical 1440x1000 screen, reflowing to 720x500 CSS px at DPR 2.
        await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
        const zoomedAdmin = await session(accounts.administrator, { viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
        for (const [zoom, page] of [[100, admin.page], [200, zoomedAdmin.page]]) {
            await page.locator('.checkin-state.confirmed').first().waitFor();
            await page.evaluate(() => {
                document.querySelectorAll('.reservations-card, .timeline-card').forEach(element => { element.scrollLeft = 0; });
                document.querySelectorAll('.alert-close').forEach(button => button.click());
                window.scrollTo({ top: 0, behavior: 'instant' });
            });
            await page.waitForFunction(() => document.querySelectorAll(".resort-live-alert").length === 0);
            await page.evaluate(() => document.fonts.ready);
            const layout = await page.evaluate(() => {
                const problems = [];
                if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Page has horizontal overflow');
                const sizes = {};
                for (const [selector, minimum] of [['body', 16], ['input', 16], ['select', 16], ['.table-header', 14], ['.filter-chip', 14], ['.row-actions button', 14], ['.timeline-block', 14], ['.timeline-block small', 12], ['.showing-badge', 12]]) {
                    for (const element of document.querySelectorAll(selector)) {
                        const font = parseFloat(getComputedStyle(element).fontSize); sizes[selector] = font;
                        if (font < minimum) problems.push(selector + ' too small: ' + font);
                    }
                }
                const selectors = '.table-header > *, .reservation-row > *, .row-actions button, .filter-row > *, .filter-chip, .stat-card, .timeline-block, .timeline-label, .timeline-scale > span, .reservation-tab, .timeline-heading, .timeline-legend';
                for (const element of document.querySelectorAll(selectors)) {
                    if (!element.getBoundingClientRect().width) continue;
                    if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) problems.push(element.className + ' clips its contents');
                }
                for (const selector of ['.filter-row', '.row-actions', '.table-header', '.reservation-row']) {
                    for (const parent of document.querySelectorAll(selector)) {
                        const boxes = [...parent.children].map(element => element.getBoundingClientRect()).filter(rect => rect.width && rect.height);
                        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                            const a = boxes[i], b = boxes[j];
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) problems.push(selector + ' overlaps child controls');
                        }
                    }
                }
                return { problems, sizes, viewport: innerWidth, dpr: devicePixelRatio };
            });
            await page.screenshot({ path: path.join(root, 'test-results/phase2b1-' + zoom + '-percent.png'), fullPage: true });
            await page.evaluate(() => {
                const table = document.querySelector('.reservations-card');
                table.scrollLeft = table.scrollWidth;
            });
            await page.locator('.reservations-card').screenshot({ path: path.join(root, 'test-results/phase2b1-' + zoom + '-percent-actions.png') });
            console.log('Typography ' + zoom + '%: ' + JSON.stringify(layout));
            assert.deepEqual(layout.problems, []);
        }
        checks.push('Readable rem typography, wrapping and contained scrolling at 100% and 200% equivalent desktop zoom without page overflow/clipped controls');
        for (const page of [guest.page, admin.page, otherAdmin.page, zoomedAdmin.page]) assert.equal(await page.evaluate(() => window.__emailCalls || 0), 0);
        assert.equal((await request('diorama', null, 'GET', undefined, { Authorization: 'Bearer owner' })).body, null);
        assert.deepEqual(exceptions, []); assert.deepEqual(forbidden, []);
        checks.push('No real emails, device commands, live project requests or page exceptions; emulator diorama subtree remains absent');
        console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); console.error({ checks, exceptions, forbidden }); process.exitCode = 1; });
