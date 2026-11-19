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
        const guestB = await session(accounts['guest-b']);
        const admin = await session(accounts.administrator);
        const otherAdmin = await session(accounts.administrator);
        const refs = { a: 'CBLR-620001', b: 'CBLR-620002', pending: 'CBLR-620003', d: 'CBLR-620004', uncertain: 'CBLR-620005' };
        const now = Date.now();
        const fixture = (reference, ownerUid, offset = 0) => ({
            reference, ownerUid, submissionAttemptId: 'rfid-assignment-test-' + reference,
            checkinDate: '2026-12-25', staySlotId: 'day-retreat', duration: 'Day Retreat (8:00 AM – 6:00 PM)', adults: 2, children: 0, senior: 0, totalGuests: 2,
            honorific: 'Ms.', guestName: 'RFID assignment test guest', mobile: '00000000000', email: 'rfid-test@example.invalid',
            specialRequests: 'Emulator fixture only. Do not change booking details during RFID assignment.',
            facilities: [{ value: 'pool', name: 'Swimming Pool & Arched Bridge', price: 1200 }],
            prices: { subtotal: 1200, tourismTax: 250, serviceCharge: 96, total: 1546 },
            status: 'Pending Verification', rfidLinked: '', createdAt: new Date(now + offset).toISOString()
        });
        for (const reference of Object.values(refs)) {
            const b = reference === refs.b;
            assert.equal((await request('sharedReservations/' + reference, accounts[b ? 'guest-b' : 'guest-a'].idToken, 'PUT', fixture(reference, accounts[b ? 'guest-b' : 'guest-a'].localId, reference === refs.a ? 100000 : 0))).status, 200);
        }
        await admin.page.goto(origin + '/admin-reservations.html');
        await otherAdmin.page.goto(origin + '/admin-reservations.html');
        await admin.page.waitForFunction(() => document.querySelectorAll('.reservation-row').length === 5);
        assert.equal(await admin.page.locator('.rfid-assignment-form').count(), 0);
        for (const ref of [refs.a, refs.b]) assert.equal((await admin.page.evaluate(ref => SharedReservations.approveReservation(ref), ref)).success, true);
        const openFor = async (page, ref) => { const panel=page.locator('.rfid-panel[data-ref="'+ref+'"]'); await panel.waitFor({state:'attached'}); if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click(); };
        const inputFor = (page, ref) => page.locator('.rfid-assignment-form[data-ref="' + ref + '"] .rfid-uid-input');
        const formFor = (page, ref) => page.locator('.rfid-assignment-form[data-ref="' + ref + '"]');
        await openFor(admin.page, refs.a); await inputFor(admin.page, refs.a).waitFor();
        await openFor(otherAdmin.page, refs.b); await inputFor(otherAdmin.page, refs.b).waitFor();
        assert.equal(await inputFor(admin.page, refs.a).inputValue(), '');
        assert.equal(await formFor(admin.page, refs.pending).count(), 0);
        await guest.page.goto(origin + '/my-reservation.html');
        await guestB.page.goto(origin + '/my-reservation.html');
        await guest.page.locator('#bookingStatus', { hasText: 'Confirmed' }).waitFor();
        await guestB.page.locator('#bookingStatus', { hasText: 'Confirmed' }).waitFor();
        const beforeA = (await request('sharedReservations/' + refs.a, accounts.administrator.idToken)).body;
        const beforeB = (await request('sharedReservations/' + refs.b, accounts.administrator.idToken)).body;
        const uid = '0001A20F', rawUid = '00:01:a2:0f';
        const atomic = (ref, card) => ({ ['sharedReservations/' + ref + '/rfidLinked']: card, ['rfidAssignments/' + card]: ref });
        const rootRequest = (token, updates) => request('', token, 'PATCH', updates);
        const readBooking = ref => request('sharedReservations/' + ref, accounts.administrator.idToken);
        const readClaim = card => request('rfidAssignments/' + card, accounts.administrator.idToken);
        const normalization = await admin.page.evaluate(() => {
            const accepted = ['00:01:a2:0f', '00 01 A2 0F', '00-01-A2-0F', '00010203040506', '00010203040506070809'].map(value => SharedReservations.normalizeRfidUid(value));
            const rejected = ['', '8801', '0011223', '0:A:11:22', '001122GG', '00112233:', 12345678].map(value => {
                try { SharedReservations.normalizeRfidUid(value); return false; } catch { return true; }
            });
            return { accepted, rejected };
        });
        assert.deepEqual(normalization.accepted, [uid, uid, uid, '00010203040506', '00010203040506070809']);
        assert(normalization.rejected.every(Boolean));
        checks.push('Blank UID until explicit assignment; confirmed-only entry; full-byte 4/7/10-byte UID normalization preserves leading zeros');
        assert.equal((await rootRequest(accounts['guest-a'].idToken, atomic(refs.a, uid))).status, 401);
        assert.equal((await rootRequest(null, atomic(refs.a, uid))).status, 401);
        const spoofed = await guest.page.evaluate(async data => {
            localStorage.setItem('userRole', 'admin');
            try { await SharedReservations.assignRfid(data.ref, data.uid); return 'unexpected success'; }
            catch (error) { return error.message; }
        }, { ref: refs.a, uid });
        assert.match(spoofed, /Administrator sign-in/);
        assert.equal((await rootRequest(accounts.administrator.idToken, atomic(refs.pending, uid))).status, 401);
        assert.equal((await rootRequest(accounts.administrator.idToken, { ...atomic(refs.pending, uid), ['sharedReservations/' + refs.pending + '/status']: 'Confirmed' })).status, 401);
        assert.equal((await request('sharedReservations/' + refs.a + '/rfidLinked', accounts.administrator.idToken, 'PUT', uid)).status, 401);
        assert.equal((await request('rfidAssignments/' + uid, accounts.administrator.idToken, 'PUT', refs.a)).status, 401);
        assert.equal((await rootRequest(accounts.administrator.idToken, atomic(refs.a, uid.toLowerCase()))).status, 401);
        for (const [field, value] of [['ownerUid', accounts.administrator.localId], ['reference', refs.b], ['status', 'In Facility'], ['prices/total', 0], ['facilities/0/price', 0], ['guestName', 'Changed']]) {
            assert.equal((await rootRequest(accounts.administrator.idToken, { ...atomic(refs.a, uid), ['sharedReservations/' + refs.a + '/' + field]: value })).status, 401);
        }
        assert.deepEqual((await readBooking(refs.a)).body, beforeA);
        assert.equal((await readClaim(uid)).body, null);
        checks.push('Rules deny guest/unauthenticated/spoofed-role assignment, pending or approval-plus-assignment, partial/orphan writes, noncanonical UID and booking tampering');
        const rootPattern = '**/.json?*';
        let invalidWrites = 0;
        await admin.page.route(rootPattern, async route => { if (route.request().method() === 'PATCH') invalidWrites++; await route.continue(); });
        await inputFor(admin.page, refs.a).fill('8801');
        await formFor(admin.page, refs.a).evaluate(form => form.requestSubmit());
        await admin.page.waitForFunction(() => document.querySelector('.showing-badge').textContent.includes('verified 4-'));
        assert.equal(invalidWrites, 0);
        await admin.page.unroute(rootPattern);
        await inputFor(admin.page, refs.a).fill(rawUid);
        await admin.page.route(rootPattern, async route => {
            if (route.request().method() === 'PATCH') await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"forced failure"}' });
            else await route.continue();
        });
        await formFor(admin.page, refs.a).evaluate(form => form.requestSubmit());
        await admin.page.waitForFunction(() => document.querySelector('.showing-badge').textContent.includes('not confirmed'));
        assert.equal(await inputFor(admin.page, refs.a).inputValue(), rawUid);
        assert.equal(await inputFor(admin.page, refs.a).isEnabled(), true);
        assert.deepEqual((await readBooking(refs.a)).body, beforeA);
        assert.equal((await readClaim(uid)).body, null);
        await admin.page.unroute(rootPattern);
        assert.equal((await otherAdmin.page.evaluate(ref => SharedReservations.approveReservation(ref), refs.d)).success, true);
        await openFor(admin.page, refs.d); await inputFor(admin.page, refs.d).waitFor();
        assert.equal(await inputFor(admin.page, refs.a).inputValue(), rawUid);
        checks.push('Invalid UID sends zero writes; forced save failure retains input and allows retry; unrelated realtime re-render preserves UID draft');
        let release, arrivals = 0;
        const barrier = new Promise(resolve => { release = resolve; });
        const replies = [];
        for (const [page, reference] of [[admin.page, refs.a], [otherAdmin.page, refs.b]]) {
            await page.route(rootPattern, async route => {
                if (route.request().method() !== 'PATCH') { await route.continue(); return; }
                const payload = route.request().postDataJSON();
                assert.deepEqual(payload, atomic(reference, uid));
                arrivals++;
                await barrier;
                const response = await route.fetch();
                replies.push({ ref: reference, status: response.status() });
                await route.fulfill({ response });
            });
        }
        await inputFor(otherAdmin.page, refs.b).fill(uid);
        await Promise.all([
            formFor(admin.page, refs.a).evaluate(form => { form.requestSubmit(); form.requestSubmit(); }),
            formFor(otherAdmin.page, refs.b).evaluate(form => form.requestSubmit())
        ]);
        await until(() => arrivals === 2, 'two atomic RFID submissions');
        assert.equal(await inputFor(admin.page, refs.a).isDisabled(), true);
        assert.equal(await inputFor(otherAdmin.page, refs.b).isDisabled(), true);
        assert.equal((await readBooking(refs.a)).body.rfidLinked, '');
        assert.equal((await readBooking(refs.b)).body.rfidLinked, '');
        assert.equal(await guest.page.locator('#rfidAssignment').textContent(), 'Unassigned');
        release();
        await until(() => replies.length === 2, 'both RFID assignment responses');
        assert.equal(replies.filter(reply => reply.status === 200).length, 1, JSON.stringify(replies));
        assert.equal(replies.filter(reply => [401, 403].includes(reply.status)).length, 1);
        const winner = replies.find(reply => reply.status === 200).ref;
        const loser = winner === refs.a ? refs.b : refs.a;
        for (const page of [admin.page, otherAdmin.page]) await page.unroute(rootPattern);
        const afterA = (await readBooking(refs.a)).body, afterB = (await readBooking(refs.b)).body;
        assert.deepEqual(afterA, winner === refs.a ? { ...beforeA, rfidLinked: uid } : beforeA);
        assert.deepEqual(afterB, winner === refs.b ? { ...beforeB, rfidLinked: uid } : beforeB);
        assert.equal((await readClaim(uid)).body, winner);
        await admin.page.locator('.reservation-row[data-ref="'+winner+'"] .rfid-assignment-status', { hasText: /^Assigned$/ }).waitFor();
        assert.equal(await formFor(admin.page, winner).count(), 0);
        checks.push('Exactly one winner when two admins assign the same card to different confirmed bookings; no partial index or changed booking details/status');
        const winningGuest = winner === refs.a ? guest : guestB;
        await winningGuest.page.waitForFunction(() => document.querySelector('#rfidAssignment').textContent === 'Assigned');
        assert.equal(await winningGuest.page.locator('#bookingStatus').textContent(), 'Confirmed');
        assert(!(await winningGuest.page.content()).includes(uid));
        const model = await winningGuest.page.evaluate(() => new Promise((resolve, reject) => {
            let off = () => {};
            off = SharedReservations.subscribeReservations(false, records => {
                const record = records.find(row => row.rfidAssigned);
                if (record) { off(); resolve({ hasUid: Object.hasOwn(record, 'rfidLinked'), assigned: record.rfidAssigned }); }
            }, reject);
        }));
        assert.deepEqual(model, { hasUid: false, assigned: true });
        assert.equal(await winningGuest.page.locator('[data-control], .cs-switch').count(), 0);
        assert.equal((await request('rfidAssignments', accounts['guest-a'].idToken)).status, 401);
        assert.equal((await request('rfidAssignments/' + uid, accounts['guest-a'].idToken)).status, 401);
        await winningGuest.page.reload();
        await winningGuest.page.waitForFunction(() => document.querySelector('#rfidAssignment').textContent === 'Assigned');
        assert(!(await winningGuest.page.content()).includes(uid));
        checks.push('Guest live view and refresh show Assigned/Confirmed without displaying the UID; guest cannot read the global card index');
        let repeatWrites = 0;
        await admin.page.route(rootPattern, async route => { if (route.request().method() === 'PATCH') repeatWrites++; await route.continue(); });
        const repeated = await admin.page.evaluate(async data => Promise.all([SharedReservations.assignRfid(data.ref, data.raw), SharedReservations.assignRfid(data.ref, data.uid)]), { ref: winner, raw: rawUid, uid });
        assert(repeated.every(value => value.success && value.alreadyAssigned));
        assert.equal(repeatWrites, 0);
        await admin.page.unroute(rootPattern);
        const beforeRetry = (await readBooking(winner)).body;
        // Model booking/index reads straddling another admin's atomic commit.
        const bookingPattern = '**/sharedReservations/' + winner + '.json?*';
        let staleRead = true;
        await admin.page.route(bookingPattern, async route => {
            if (staleRead) {
                staleRead = false;
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...beforeRetry, rfidLinked: '' }) });
            } else await route.continue();
        });
        const straddled = await admin.page.evaluate(data => SharedReservations.assignRfid(data.ref, data.uid), { ref: winner, uid });
        assert.equal(straddled.alreadyAssigned, true);
        await admin.page.unroute(bookingPattern);
        for (const payload of [atomic(winner, uid), atomic(loser, uid), atomic(winner, '0000ABCD')]) assert.equal((await rootRequest(accounts.administrator.idToken, payload)).status, 401);
        assert.equal((await request('sharedReservations/' + winner + '/rfidLinked', accounts.administrator.idToken, 'PUT', '')).status, 401);
        assert.equal((await request('rfidAssignments/' + uid, accounts.administrator.idToken, 'DELETE')).status, 401);
        assert.equal((await readClaim('0000ABCD')).body, null);
        assert.deepEqual((await readBooking(winner)).body, beforeRetry);
        const reuse = await admin.page.evaluate(async data => {
            try { return await SharedReservations.assignRfid(data.ref, data.uid); } catch (error) { return { error: error.message }; }
        }, { ref: refs.d, uid });
        assert.match(reuse.error, /reuse or reassignment/);
        checks.push('Repeated same assignment performs zero writes; replacement, removal, index deletion and cross-booking reuse are denied');
        // Two different cards racing for one booking must not leave an orphan claim.
        const cards = ['00010203040506', '00010203040506070809'];
        let releaseCards, cardArrivals = 0;
        const cardBarrier = new Promise(resolve => { releaseCards = resolve; });
        const cardReplies = [];
        for (const [page, card] of [[admin.page, cards[0]], [otherAdmin.page, cards[1]]]) {
            await page.route(rootPattern, async route => {
                if (route.request().method() !== 'PATCH') { await route.continue(); return; }
                cardArrivals++;
                await cardBarrier;
                const response = await route.fetch(); cardReplies.push({ card, status: response.status() });
                await route.fulfill({ response });
            });
            await openFor(page, refs.d); await inputFor(page, refs.d).fill(card);
        }
        await Promise.all([formFor(admin.page, refs.d).evaluate(form => form.requestSubmit()), formFor(otherAdmin.page, refs.d).evaluate(form => form.requestSubmit())]);
        await until(() => cardArrivals === 2, 'two cards racing for one booking'); releaseCards();
        await until(() => cardReplies.length === 2, 'both card race responses');
        assert.equal(cardReplies.filter(reply => reply.status === 200).length, 1);
        const chosen = cardReplies.find(reply => reply.status === 200).card;
        const unused = cards.find(card => card !== chosen);
        assert.equal((await readBooking(refs.d)).body.rfidLinked, chosen);
        assert.equal((await readClaim(chosen)).body, refs.d);
        assert.equal((await readClaim(unused)).body, null);
        for (const page of [admin.page, otherAdmin.page]) await page.unroute(rootPattern);
        checks.push('Different-card race on one booking stores one full UID and leaves no orphan/extra card claims');
        assert.equal((await admin.page.evaluate(ref => SharedReservations.approveReservation(ref), refs.uncertain)).success, true);
        await openFor(admin.page, refs.uncertain); await inputFor(admin.page, refs.uncertain).waitFor();
        const uncertainUid = '0000ABCD'; let committed = false, uncertainWrites = 0;
        const readPatterns = ['**/sharedReservations/' + refs.uncertain + '.json?*', '**/rfidAssignments/' + uncertainUid + '.json?*'];
        await admin.page.route(rootPattern, async route => {
            if (route.request().method() !== 'PATCH') { await route.continue(); return; }
            const response = await route.fetch(); assert.equal(response.status(), 200); committed = true; uncertainWrites++;
            await route.abort();
        });
        for (const pattern of readPatterns) await admin.page.route(pattern, async route => { if (committed) await route.abort(); else await route.continue(); });
        await inputFor(admin.page, refs.uncertain).fill(uncertainUid);
        await formFor(admin.page, refs.uncertain).evaluate(form => form.requestSubmit());
        await admin.page.waitForFunction(() => document.querySelector('.showing-badge').textContent.includes('not confirmed'));
        assert.equal((await readBooking(refs.uncertain)).body.rfidLinked, uncertainUid);
        assert.equal((await readClaim(uncertainUid)).body, refs.uncertain);
        await admin.page.unroute(rootPattern);
        for (const pattern of readPatterns) await admin.page.unroute(pattern);
        const recovered = await admin.page.evaluate(data => SharedReservations.assignRfid(data.ref, data.uid), { ref: refs.uncertain, uid: uncertainUid });
        assert.equal(recovered.alreadyAssigned, true); assert.equal(uncertainWrites, 1);
        checks.push('Lost commit acknowledgement never reports save success without server confirmation; retry reuses the committed card/booking pair');
        const shellSource = await fs.readFile(path.join(root, 'js/control-shell.js'), 'utf8');
        const local = new Map([['isLoggedIn', 'true'], ['userRole', 'guest'], ['currentReservation', JSON.stringify((await readBooking(winner)).body)]]);
        const shellContext = vm.createContext({ console, window: {}, localStorage: { getItem: key => local.get(key) || null }, document: {} });
        vm.runInContext(shellSource, shellContext);
        assert.equal(shellContext.window.ControlShell.accessFor('pool').allowed, false);
        assert.equal(await admin.page.locator('#statActiveGuests').textContent(), '0');
        assert.equal((await readBooking(refs.pending)).body.rfidLinked, '');
        assert.equal((await readBooking(refs.pending)).body.status, 'Pending Verification');
        checks.push('Assignment leaves Confirmed and facility access locked; unrelated pending bookings stay blank/pending');
        const zoomed = await session(accounts.administrator, { viewport: { width: 720, height: 500 }, deviceScaleFactor: 2 });
        await zoomed.page.goto(origin + '/admin-reservations.html');
        await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
        for (const [zoom, page] of [[100, admin.page], [200, zoomed.page]]) {
            await openFor(page, loser); await inputFor(page, loser).waitFor();
            await page.evaluate(() => { document.querySelectorAll('.alert-close').forEach(button => button.click()); });
            await page.waitForFunction(() => document.querySelectorAll('.resort-live-alert').length === 0);
            const layout = await page.evaluate(() => {
                const problems = [];
                if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page overflow');
                for (const form of document.querySelectorAll('.rfid-assignment-form')) {
                    if (!form.closest("details").open) continue;
                    const input = form.querySelector('input'), button = form.querySelector('button');
                    if (parseFloat(getComputedStyle(input).fontSize) < 16) problems.push('small UID input');
                    if (parseFloat(getComputedStyle(button).fontSize) < 14) problems.push('small assignment button');
                    for (const element of [form, form.parentElement, ...form.querySelectorAll('label, small, button')]) {
                        if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) problems.push(element.className + ' clips');
                    }
                    const children = [...form.children].map(element => element.getBoundingClientRect());
                    for (let i = 1; i < children.length; i++) if (children[i].top < children[i - 1].bottom - 1) problems.push('RFID controls overlap');
                }
                return problems;
            });
            assert.deepEqual(layout, []);
            await inputFor(page, loser).scrollIntoViewIfNeeded();
            await page.locator('.reservations-card').screenshot({ path: path.join(root, 'test-results/phase2b2-' + zoom + '-percent.png') });
        }
        checks.push('Existing RFID column retains readable 16px input/14px button and wraps without overlap at 100%/200%-equivalent layouts');
        for (const page of [guest.page, guestB.page, admin.page, otherAdmin.page, zoomed.page]) assert.equal(await page.evaluate(() => window.__emailCalls || 0), 0);
        assert.equal((await request('diorama', null, 'GET', undefined, { Authorization: 'Bearer owner' })).body, null);
        assert.deepEqual(exceptions, []); assert.deepEqual(forbidden, []);
        checks.push('Zero email/hardware/live-project calls, zero page errors and no diorama subtree created');
        console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); console.error({ checks, exceptions, forbidden }); process.exitCode = 1; });
