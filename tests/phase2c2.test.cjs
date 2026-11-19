'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:5000';
const checks = [], errors = [], forbidden = [];
async function request(route, token, method = 'GET', body) {
    const url = new URL('http://127.0.0.1:9000/' + route + '.json');
    url.searchParams.set('ns', project + '-default-rtdb');
    if (token !== 'owner' && token) url.searchParams.set('auth', token);
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token === 'owner' ? { Authorization: 'Bearer owner' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
async function main() {
    assert.equal(process.env.GCLOUD_PROJECT, project);
    const accounts = await seed();
    const refs = { pool: 'CBLR-640001', confirmed: 'CBLR-640002', other: 'CBLR-640003', event: 'CBLR-640004', buyout: 'CBLR-640005' };
    const fixture = (reference, ownerUid, status, packages, offset) => ({ reference, ownerUid, submissionAttemptId: 'guest-access-fixture-' + reference, checkinDate: '2026-12-25', duration: 'Full day', adults: 2, children: 0, senior: 0, totalGuests: 2, honorific: 'Ms.', guestName: 'Fake guest access test', mobile: '00000000000', email: 'access@example.invalid', specialRequests: 'Emulator fixtures only', facilities: packages.map(value => ({ value, name: ({ pool: 'Swimming Pool & Arched Bridge', event: 'Celebration Grand Event Place', buyout: 'Full Resort Buyout' })[value], price: ({ pool: 1200, event: 15000, buyout: 35000 })[value] })), prices: { subtotal: 1200, tourismTax: 250, serviceCharge: 96, total: 1546 }, status, rfidLinked: '0001A20F', createdAt: new Date(Date.now() + offset).toISOString() });
    // Trusted fixtures include future-phase statuses solely to test denial; no
    // browser is granted permission to make these lifecycle transitions.
    const bookings = {
        [refs.pool]: fixture(refs.pool, accounts['guest-a'].localId, 'Checked In', ['pool'], 100000),
        [refs.confirmed]: fixture(refs.confirmed, accounts['guest-a'].localId, 'Confirmed', ['pool'], 0),
        [refs.other]: fixture(refs.other, accounts['guest-b'].localId, 'Checked In', ['buyout'], 200000),
        [refs.event]: fixture(refs.event, accounts['guest-a'].localId, 'Checked In', ['event'], 1),
        [refs.buyout]: fixture(refs.buyout, accounts['guest-a'].localId, 'Checked In', ['buyout'], 2)
    };
    assert.equal((await request('', 'owner', 'PUT', { sharedReservations: bookings })).status, 200);
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        async function contextFor(account, adminStub = false) {
            const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            await context.addInitScript(() => {
                localStorage.setItem('isLoggedIn', 'true'); localStorage.setItem('userRole', 'admin');
                localStorage.setItem('currentReservation', JSON.stringify({ reference: 'CBLR-999999', status: 'Active', facilities: [{ value: 'buyout', name: 'Full Resort Buyout' }] }));
                localStorage.setItem('dioramaState', JSON.stringify({ guest: { checkedIn: true } }));
            });
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/admin-dashboard.html') return route.fulfill({ status: 302, headers: { Location: origin + '/admin-reservations.html' } });
                if (url.pathname === '/js/database.js' && !adminStub) return route.continue();
                if (['/js/database.js', '/js/firebase-config.js', '/js/diorama-link.js'].includes(url.pathname)) {
                    if (!adminStub) { forbidden.push(url.href); return route.abort(); }
                    const body = url.pathname.endsWith('diorama-link.js') ? 'window.DioramaLink={ready:Promise.resolve(),mode:"fixture",get(){return {}},on(path,callback){callback({});return()=>{}},isDeviceOnline(){return false},set(){window.__adminCommands=(window.__adminCommands||0)+1},update(){window.__adminCommands=(window.__adminCommands||0)+1},log(){}};' : '/* Isolated admin transport/config test double; no cloud/device initialization. */';
                    return route.fulfill({ contentType: 'text/javascript', body });
                }
                if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'node_modules/firebase', path.basename(url.pathname)), 'utf8') });
                if (['127.0.0.1', 'localhost'].includes(url.hostname)) {
                    if (/\/diorama(?:\/|\.)/.test(url.pathname)) forbidden.push(url.href);
                    return route.continue();
                }
                if (/firebase|emailjs/.test(url.hostname) || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(url.hostname)) forbidden.push(url.href);
                return route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            page.on('dialog', dialog => dialog.accept());
            if (account) {
                await page.goto(origin + '/login.html');
                await page.locator('#email').fill(account.email);
                await page.locator('#password').fill(account.password);
                await page.locator('#loginForm').evaluate(form => form.requestSubmit());
                await page.waitForURL(url => !url.pathname.endsWith('/login.html'));
            }
            return { context, page };
        }
        const a = await contextFor(accounts['guest-a']);
        let release;
        const blocked = new Promise(resolve => { release = resolve; });
        await a.context.route('**/sharedReservations/CBLR-640001.json?*', async route => { if (route.request().method() === 'GET') await blocked; await route.continue(); });
        await a.page.goto(origin + '/guest-dashboard.html');
        await a.page.waitForFunction(() => Boolean(window.GuestAccess));
        assert.equal(await a.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        release();
        await a.page.waitForFunction(() => GuestAccess.accessFor('pool').allowed);
        assert.equal(await a.page.locator('#poolSection').isVisible(),true);for(const selector of ['#controlsSection','#ktvSection','.restricted-card'])assert.equal(await a.page.locator(selector).isVisible(),false);
        assert.equal(await a.page.locator('#reservationNumber').textContent(), refs.pool);
        assert.match(await a.page.locator('#reservedPackages').textContent(), /Swimming Pool/);
        assert.equal(await a.page.locator('.confirmed-status').textContent(), 'Checked In');
        assert.equal(await a.page.locator('.restricted-card').getAttribute('data-eligible'), 'false');
        assert.equal(await a.page.locator('[data-facility="pool"]').getAttribute('aria-disabled'), 'false');
        for (const kind of ['cottage', 'ktv', 'event']) assert.equal(await a.page.locator('[data-facility="' + kind + '"]').getAttribute('aria-disabled'), 'true');
        assert.equal(await a.page.evaluate(() => Boolean(window.DioramaLink || window.ResortDB)), false);
        assert.equal(await a.page.locator('#simulateNfcBtn,#resetCheckinBtn,#checkoutBtn').count(), 0);
        checks.push('Dashboard defaults locked while server verification is delayed; latest owned Checked In Pool-only booking enables only Pool navigation despite stale local admin/Active/buyout flags');
        await a.page.screenshot({ path: path.join(root, 'test-results/phase2c2-dashboard.png'), fullPage: true, animations: 'disabled' });
        const expired = await a.page.evaluate(() => {
            const original = Date.now;
            Date.now = () => original() + 13000;
            try { return GuestAccess.accessFor('pool').allowed; } finally { Date.now = original; }
        });
        assert.equal(expired, false, 'An old verification cannot grant access even if browser timers were delayed');
        await a.page.goto(origin + '/my-reservation.html?reservation=' + refs.pool);await a.page.locator('#openDashboard').waitFor();assert.equal(await a.page.locator('#openDashboard').getAttribute('href'),'guest-dashboard.html?reservation='+refs.pool);await a.page.locator('#openDashboard').click();await a.page.waitForFunction(()=>window.GuestAccess?.accessFor('pool').allowed);assert.equal(await a.page.locator('#reservationNumber').textContent(),refs.pool);
        const before = a.page.url();
        await a.page.locator('[data-facility="event"]').evaluate(el => el.click());
        assert.equal(a.page.url(), before);
        await a.page.locator('[data-facility="pool"]').click();
        await a.page.waitForURL('**/pool.html?reservation=' + refs.pool);
        await a.page.waitForFunction(() => document.getElementById('pageContent').dataset.eligible === 'true');
        await a.page.locator('body.guest-facility-page #pageContent[data-eligible="true"]').waitFor();
        assert.equal(await a.page.locator('#poolSwitch,#bridgeSwitch,#brightnessRange').count(), 0);
        await a.page.screenshot({ path: path.join(root, 'test-results/phase2c2-pool.png'), fullPage: true, animations: 'disabled' });
        assert.equal(await a.page.evaluate(() => ControlShell.accessFor('pool').allowed), true);
        assert.equal(await a.page.evaluate(() => ControlShell.isAdmin()), false);
        await a.page.locator('#pageContent').evaluate(container => { const button=document.createElement('button');button.dataset.control='synthetic';container.appendChild(button);button.dispatchEvent(new MouseEvent('click',{bubbles:true}));button.remove(); });
        assert.equal(await a.page.evaluate(() => GuestAccess.guestAction('pool')), false);
        assert.equal(await a.page.evaluate(() => Boolean(window.DioramaLink || window.ResortDB)), false);
        checks.push('Eligible Pool direct page preserves cards but disables dispatch; synthetic/enabled-control events cannot invoke legacy device handlers or gain admin role');
        for (const kind of ['cottage', 'ktv', 'event']) {
            await a.page.goto(origin + '/' + kind + '.html?reservation=' + refs.pool);
            await a.page.locator('.cs-locked').waitFor();
            await a.page.waitForFunction(() => !GuestAccess.state.loading);
            assert.equal(await a.page.evaluate(kind => ControlShell.accessFor(kind).allowed, kind), false);
        }
        checks.push('Direct Cottage, KTV and Event navigation is locked for Pool-only guest');
        await a.page.goto(origin + '/pool.html?reservation=' + refs.confirmed);
        await a.page.waitForFunction(() => GuestAccess.state.reservation?.status === 'Confirmed');
        assert.equal(await a.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        assert.equal(await a.page.locator('.cs-locked').count(), 1);
        checks.push('Confirmed booking with assigned RFID remains locked');
        await a.page.goto(origin + '/pool.html?reservation=' + refs.other);
        await a.page.waitForFunction(() => !GuestAccess.state.loading);
        assert.equal(await a.page.evaluate(() => GuestAccess.state.reservation), null);
        assert.equal(await a.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        assert([401, 403].includes((await request('sharedReservations/' + refs.other, accounts['guest-a'].idToken)).status));
        checks.push('Explicit other-guest selection fails closed with no fallback to an eligible owned booking; rules deny its read');
        await a.page.goto(origin + '/pool.html?reservation=' + refs.pool);
        await a.page.waitForFunction(() => GuestAccess.accessFor('pool').allowed);
        for (const status of ['Pending Verification', 'Confirmed', 'Checking Out', 'Checked Out', 'Completed', 'Cancelled', 'Active']) {
            assert.equal((await request('sharedReservations/' + refs.pool + '/status', 'owner', 'PUT', status)).status, 200);
            await a.page.waitForFunction(status => GuestAccess.state.reservation?.status === status, status);
            assert.equal(await a.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
            assert.equal(await a.page.locator('.cs-locked').count(), 1);
        }
        assert.equal((await request('sharedReservations/' + refs.pool + '/status', 'owner', 'PUT', 'Checked In')).status, 200);
        await a.page.waitForFunction(() => GuestAccess.accessFor('pool').allowed);
        await a.page.waitForFunction(() => document.getElementById('pageContent').dataset.eligible === 'true');
        checks.push('Open facility page re-locks for every non-Checked In lifecycle status, including legacy Active, and can recover from a later verified eligible snapshot');
        await a.context.setOffline(true);
        await a.page.waitForFunction(() => !GuestAccess.accessFor('pool').allowed);
        assert.equal(await a.page.locator('.cs-locked').count(), 1);
        await a.context.setOffline(false);
        await a.page.waitForFunction(() => GuestAccess.accessFor('pool').allowed);
        let deny = true;
        await a.context.route('**/sharedReservations/CBLR-640001.json?*', async route => {
            if (deny) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Permission denied"}' });
            return route.continue();
        });
        await a.page.waitForFunction(() => !GuestAccess.state.loading && !GuestAccess.state.reservation);
        assert.equal(await a.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        deny = false;
        await a.page.waitForFunction(() => GuestAccess.accessFor('pool').allowed);
        checks.push('Loss of connection and unauthorized/expired-session server verification lock immediately or on bounded refresh; fresh server verification is required for recovery');
        await a.page.evaluate(() => SharedReservations.signOut());
        await a.page.waitForFunction(() => !GuestAccess.state.user && !GuestAccess.accessFor('pool').allowed);
        await a.page.locator('.cs-locked').waitFor();
        const signedOut = await contextFor(null);
        await signedOut.page.goto(origin + '/pool.html?reservation=' + refs.pool);
        await signedOut.page.waitForFunction(() => !GuestAccess.state.loading);
        assert.equal(await signedOut.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        checks.push('Firebase sign-out revokes open-page eligibility; unauthenticated direct navigation stays locked despite local sign-in/admin flags');
        const b = await contextFor(accounts['guest-b']);
        await b.page.goto(origin + '/guest-dashboard.html');
        await b.page.waitForFunction(() => GuestAccess.state.reservation?.reference === 'CBLR-640003');
        assert.equal(await b.page.evaluate(() => ['pool','cottage','ktv','event'].every(kind => GuestAccess.accessFor(kind).allowed)), true);
        assert.equal(await b.page.locator('.restricted-card').getAttribute('data-eligible'), 'true');
        for (const kind of ['cottage', 'ktv', 'event']) {
            await b.page.goto(origin + '/' + kind + '.html?reservation=' + refs.other);
            await b.page.waitForFunction(kind => GuestAccess.accessFor(kind).allowed, kind);
            await b.page.waitForFunction(() => document.getElementById('pageContent').dataset.eligible === 'true');
            assert.equal(await b.page.locator('#pageContent button:not([disabled])').count(), 0);
        }
        await b.page.evaluate(reference => GuestAccess.selectReservation(reference), refs.pool);
        await b.page.waitForFunction(() => !GuestAccess.state.loading);
        assert.equal(await b.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        checks.push('Separate Guest B sees only their own full-buyout booking and cannot select Guest A booking');
        const policy = await contextFor(accounts['guest-a']);
        await policy.page.goto(origin + '/event.html?reservation=' + refs.event);
        await policy.page.waitForFunction(() => GuestAccess.accessFor('event').allowed);
        assert.equal(await policy.page.evaluate(() => GuestAccess.accessFor('pool').allowed), false);
        assert.equal(await policy.page.evaluate(() => ['cottage','ktv'].some(kind => GuestAccess.accessFor(kind).allowed)), false);
        checks.push('Existing package ID mapping retained: full buyout includes all; Event-only does not imply Pool, Cottage or KTV');
        const admin = await contextFor(accounts.administrator, true);
        await admin.page.goto(origin + '/pool.html');
        await admin.page.locator('#swatch-lagoon').waitFor();
        assert.equal(await admin.page.locator('#poolSwitch').isDisabled(), false);
        await admin.page.locator('#poolSwitch').click();
        assert.equal(await admin.page.evaluate(() => window.__adminCommands), 1);
        await admin.page.evaluate(() => SharedReservations.signOut());
        await admin.page.waitForFunction(() => !ControlShell.isAdmin());
        await admin.page.locator('#poolSwitch').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        assert.equal(await admin.page.evaluate(() => window.__adminCommands), 1);
        checks.push('Separate trusted-admin Pool controller still operates with isolated fake transport; sign-out prevents further dispatch; real admin device config/connector untouched');
        assert.equal((await request('diorama', 'owner')).body, null);
        assert.deepEqual(forbidden, []);
        assert.deepEqual(errors, []);
        assert.deepEqual((await request('sharedReservations', 'owner')).body, bookings);
        checks.push('Zero device/live-project/email requests and browser errors; eligibility actions never mutate any shared booking or device state');
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
