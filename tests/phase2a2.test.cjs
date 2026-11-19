const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { seed, project } = require('./seed-emulator.cjs');
const { startServer } = require('./serve.cjs');
const origin = 'http://127.0.0.1:5000';
const database = 'http://127.0.0.1:9000';
const root = path.resolve(__dirname, '..');
const checks = [];
const failures = [], forbidden = [], emails = [];
async function dbRequest(route, token, method = 'GET', body) {
    const url = new URL(database + '/' + route + '.json');
    url.searchParams.set('ns', project + '-default-rtdb');
    if (token) url.searchParams.set('auth', token);
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
}
async function main() {
    assert.equal(process.env.GCLOUD_PROJECT, project, 'Run through the demo-project emulators:exec script');
    const accounts = await seed();
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    try {
        async function session() {
            const context = await browser.newContext();
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname.includes('/diorama') && route.request().method() !== 'GET') forbidden.push(route.request().url());
                if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) {
                    const name = path.basename(url.pathname);
                    await route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'node_modules/firebase', name), 'utf8') }); return;
                }
                if (url.pathname.includes('email.min.js')) {
                    await route.fulfill({ contentType: 'text/javascript', body: 'window.emailjs={init(){},send(){window.__emailCalls=(window.__emailCalls||0)+1;return Promise.reject(new Error("Real email disabled in tests"))}};' }); return;
                }
                if (['127.0.0.1', 'localhost'].includes(url.hostname)) { await route.continue(); return; }
                // No live Firebase, EmailJS, fonts or other remote request is sent.
                if (url.hostname.includes('firebase') || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(url.hostname) || url.hostname.includes('emailjs')) forbidden.push(url.href);
                await route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => failures.push(error.message));
            page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : dialog.dismiss());
            return { context, page };
        }
        async function signIn(page, account) {
            await page.goto(origin + '/login.html');
            await page.locator('#email').fill(account.email);
            await page.locator('#password').fill(account.password);
            await page.locator('#loginForm').evaluate(form => form.requestSubmit());
            await page.waitForURL(url => !url.pathname.endsWith('/login.html'));
        }
        async function fillBooking(page, name = 'Guest A shared test') {
            await page.goto(origin + '/reservation.html');
            await page.locator('#checkinDate').fill('2026-12-20');
            await page.locator('#fullName').fill(name);
            await page.locator('#mobileNumber').fill('09123456789');
            await page.locator('#emailAddress').fill(accounts['guest-a'].email);
            for (const checkbox of await page.locator('input[name="facility"]').all()) { if (await checkbox.isChecked()) await checkbox.locator('..').click(); }
            await page.locator('input[name="facility"][value="pool"]').locator('..').click();
            await page.locator('#agreeTerms').check();
        }
        const a = await session(), b = await session(), admin = await session();
        const registration = await session();
        await registration.page.goto(origin + '/register.html');
        await registration.page.locator('#fullName').fill('Registered Firebase Guest');
        await registration.page.locator('#phoneNumber').fill('09123456789');
        await registration.page.locator('#registerEmail').fill('new-guest@example.test');
        await registration.page.locator('#registerPassword').fill('TestPass123!');
        await registration.page.locator('#confirmPassword').fill('TestPass123!');
        await registration.page.locator('#agreeTerms').check();
        assert.equal(await registration.page.locator('#subscribeNewsletter').isChecked(), false);
        await registration.page.locator('#registerForm').evaluate(form => form.requestSubmit());
        await registration.page.waitForURL(url => url.pathname.endsWith('/index.html'));
        await registration.page.goto(origin + '/my-reservation.html');
        await registration.page.waitForFunction(() => document.querySelector('#stateText').textContent.includes('You have no reservations yet.'));
        const registered = await registration.page.evaluate(async () => ({ uid: (await SharedReservations.identity()).user.uid, localUsers: localStorage.getItem('resortUsers') }));
        assert(registered.uid);
        assert(!registered.localUsers.includes('new-guest@example.test'));
        checks.push('Existing registration form creates Firebase Auth account without storing its password locally');
        // Browser-local credentials and bookings cannot authenticate or populate a shared list.
        await a.page.goto(origin + '/login.html');
        await a.page.evaluate(() => {
            const history = JSON.parse(localStorage.getItem('reservationHistory') || '[]');
            history.push({ reference: 'CBLR-111111', guestName: 'Legacy record', rfidLinked: 'REAL-LOCAL-UID' });
            localStorage.setItem('reservationHistory', JSON.stringify(history));
            localStorage.setItem('currentReservation', JSON.stringify({ reference: 'CBLR-111111' }));
            localStorage.setItem('userRole', 'admin');
        });
        const localBefore = await a.page.evaluate(() => localStorage.getItem('reservationHistory'));
        await a.page.locator('#email').fill('admin@catherines.com');
        await a.page.locator('#password').fill('Admin123!');
        await a.page.locator('#loginForm').evaluate(form => form.requestSubmit());
        await a.page.waitForFunction(() => document.querySelector('#formStatus').textContent.includes('failed'));
        assert.equal(new URL(a.page.url()).pathname, '/login.html');
        await signIn(a.page, accounts['guest-a']);
        await signIn(b.page, accounts['guest-b']);
        await signIn(admin.page, accounts.administrator);
        checks.push('Real emulator Auth sign-in; hard-coded local administrator credentials fail');
        await admin.page.goto(origin + '/admin-reservations.html');
        await admin.page.waitForFunction(() => document.querySelectorAll('.reservation-row').length === 0);
        await fillBooking(a.page);
        await a.page.locator('#fullName').fill('');
        await a.page.locator('#confirmReservation').click();
        assert.equal(await a.page.locator('#successModal').evaluate(node => node.classList.contains('show')), false);
        await a.page.locator('#fullName').fill('Guest A shared test');
        // Exercise actual lock with two events before the first network response.
        await a.page.locator('#confirmReservation').evaluate(button => { button.click(); button.click(); });
        await a.page.locator('#successModal.show').waitFor();
        const reference = await a.page.locator('#confirmationNumber').textContent();
        assert.match(reference, /^CBLR-[0-9]{6}$/);
        const recordResult = await dbRequest('sharedReservations/' + reference, accounts['guest-a'].idToken);
        assert.equal(recordResult.status, 200);
        const record = recordResult.body;
        assert.equal(record.ownerUid, accounts['guest-a'].localId);
        assert.equal(record.status, 'Pending Verification');
        assert.equal(record.rfidLinked, '');
        assert.equal(record.nodeNumber, undefined);
        assert.equal(record.prices.total, 1546);
        await admin.page.locator('.booking-ref strong', { hasText: reference }).waitFor();
        assert.equal(await admin.page.locator('.reservation-row').count(), 1);
        checks.push('Guest A submit, validation, repeated click, server-confirmed modal and independent admin list reference match');
        await a.page.goto(origin + '/my-reservation.html');
        await a.page.locator('#bookingReference', { hasText: reference }).waitFor();
        assert.equal(await a.page.locator('#bookingStatus').textContent(), 'Pending Verification');
        assert.equal(await a.page.locator('#rfidAssignment').textContent(), 'Unassigned');
        assert.equal(await a.page.locator('#bookingTotal').textContent(), '₱1,546.00');
        assert.equal(await a.page.locator('#bookedFacilities > li').count(), 1);
        await a.page.reload();
        await a.page.locator('#bookingReference', { hasText: reference }).waitFor();
        assert.equal(await a.page.evaluate(() => localStorage.getItem('reservationHistory')), localBefore);
        assert.equal(await a.page.evaluate(() => JSON.parse(localStorage.getItem('currentReservation')).reference), 'CBLR-111111');
        checks.push('Guest view/reload uses the same shared reference; legacy local records remain unchanged');
        await b.page.goto(origin + '/my-reservation.html');
        await b.page.waitForFunction(() => document.querySelector('#stateText').textContent.includes('You have no reservations yet.'));
        assert(!(await b.page.content()).includes(reference));
        await b.page.evaluate(() => localStorage.setItem('userRole', 'admin'));
        await b.page.goto(origin + '/admin-reservations.html');
        await b.page.waitForFunction(() => document.querySelector('.showing-badge').textContent.includes('unavailable'));
        assert.equal(await b.page.locator('.reservation-row').count(), 0);
        assert.equal((await dbRequest('sharedReservations/' + reference, accounts['guest-b'].idToken)).status, 401);
        assert.equal((await dbRequest('sharedReservations/' + reference)).status, 401);
        assert.equal((await dbRequest('sharedReservations', accounts['guest-a'].idToken)).status, 401);
        // Query-based grants must not disclose another owner's nested fields.
        for (const suffix of ['', '/guestName', '/ownerUid', '/facilities/0/name']) {
            const attackUrl = new URL(database + '/sharedReservations/' + reference + suffix + '.json');
            attackUrl.searchParams.set('ns', project + '-default-rtdb');
            attackUrl.searchParams.set('auth', accounts['guest-b'].idToken);
            attackUrl.searchParams.set('orderBy', JSON.stringify('ownerUid'));
            attackUrl.searchParams.set('equalTo', JSON.stringify(accounts['guest-b'].localId));
            const reply = await fetch(attackUrl);
            const body = await reply.json();
            assert.notEqual(body, record.guestName);
            assert.notEqual(body, record.ownerUid);
            assert.notEqual(body, record.facilities[0].name);
            assert(!body || body.reference !== reference);
        }
        checks.push('Guest B and unauthenticated reads denied; guest unfiltered list denied');
        for (const bad of [{ status: 'Active' }, { rfidLinked: 'RFID-FORGED' }, { ownerUid: accounts['guest-b'].localId }]) {
            assert.equal((await dbRequest('sharedReservations/' + reference, accounts['guest-a'].idToken, 'PATCH', bad)).status, 401);
        }
        for (const [index, bad] of [{ status: 'Confirmed' }, { rfidLinked: 'RFID-FORGED' }, { ownerUid: accounts['guest-b'].localId }, { checkedIn: true }, { nodeNumber: 1 }, { facilities: { 0: record.facilities[0], 4: record.facilities[0] } }, { prices: { subtotal: 0, tourismTax: 250, serviceCharge: 0, total: 250 } }].entries()) {
            const ref = 'CBLR-' + (800000 + index);
            assert.equal((await dbRequest('sharedReservations/' + ref, accounts['guest-a'].idToken, 'PUT', { ...record, reference: ref, ...bad })).status, 401);
        }
        assert.equal((await dbRequest('sharedReservations/CBLR-899999', null, 'PUT', { ...record, reference: 'CBLR-899999' })).status, 401);
        assert.equal((await dbRequest('sharedReservations/' + reference, accounts.administrator.idToken, 'PATCH', { status: 'Active' })).status, 401);
        checks.push('Rules deny status/RFID escalation, foreign ownership, unexpected access fields, unauthenticated creation and admin updates');
        assert.equal(await admin.page.locator('.cancel-btn').count(), 0);
        assert.equal((await dbRequest('sharedReservations/' + reference, accounts['guest-a'].idToken)).body.status, 'Pending Verification');
        assert.equal(await a.page.locator('#editContact').count(), 0);
        assert.equal((await dbRequest('sharedReservations/' + reference, accounts['guest-a'].idToken)).body.guestName, 'Guest A shared test');
        checks.push('Unsupported cancellation control is absent; read-only guest details cannot perform a shared update');
        // Force a committed PUT acknowledgement AND its recovery GET to disappear.
        await fillBooking(a.page, 'Uncertain save test');
        let uncertainRef;
        let rejectRecovery = false;
        await a.page.route('**/sharedReservations/*.json?*', async route => {
            if (route.request().method() === 'PUT') {
                uncertainRef = path.basename(new URL(route.request().url()).pathname, '.json');
                const reply = await route.fetch();
                assert.equal(reply.status(), 200);
                rejectRecovery = true;
                await route.abort();
            } else if (rejectRecovery) await route.abort();
            else await route.continue();
        });
        await a.page.locator('#confirmReservation').click();
        await a.page.waitForFunction(() => !document.querySelector('#confirmReservation').disabled);
        assert.equal(await a.page.locator('#successModal').evaluate(node => node.classList.contains('show')), false);
        assert.equal((await dbRequest('sharedReservations/' + uncertainRef, accounts['guest-a'].idToken)).status, 200);
        await a.page.unroute('**/sharedReservations/*.json?*');
        await a.page.locator('#confirmReservation').click();
        await a.page.locator('#successModal.show').waitFor();
        assert.equal(await a.page.locator('#confirmationNumber').textContent(), uncertainRef);
        checks.push('Uncertain committed save followed by retry reuses exact attempt/reference');
        await fillBooking(a.page, 'Failed save test');
        let failedRef;
        await a.page.route('**/sharedReservations/*.json?*', async route => {
            if (route.request().method() === 'PUT') {
                failedRef = path.basename(new URL(route.request().url()).pathname, '.json');
                await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'forced failure' }) });
            } else await route.continue();
        });
        await a.page.locator('#confirmReservation').click();
        await a.page.waitForFunction(() => !document.querySelector('#confirmReservation').disabled);
        assert.equal(await a.page.locator('#fullName').inputValue(), 'Failed save test');
        assert.equal(await a.page.locator('#successModal').evaluate(node => node.classList.contains('show')), false);
        assert.equal((await dbRequest('sharedReservations/' + failedRef, accounts['guest-a'].idToken)).body, null);
        await a.page.unroute('**/sharedReservations/*.json?*');
        await a.page.locator('#confirmReservation').click();
        await a.page.locator('#successModal.show').waitFor();
        assert.equal(await a.page.locator('#confirmationNumber').textContent(), failedRef);
        checks.push('Failed shared save keeps inputs and permits retry with the same reference');
        const all = await dbRequest('sharedReservations', accounts.administrator.idToken);
        assert.equal(all.status, 200);
        assert.equal(Object.keys(all.body).length, 3);
        await admin.page.waitForFunction(() => document.querySelectorAll('.reservation-row').length === 3);
        for (const page of [a.page, b.page, admin.page]) emails.push(await page.evaluate(() => window.__emailCalls || 0));
        assert.deepEqual(emails, [0, 0, 0]);
        assert.deepEqual(forbidden, []);
        assert.deepEqual(failures, []);
        assert.equal((await dbRequest('diorama', accounts.administrator.idToken)).status, 401);
        const deviceResponse = await fetch(database + '/diorama.json?ns=' + project + '-default-rtdb', { headers: { Authorization: 'Bearer owner' } });
        assert.equal(await deviceResponse.json(), null);
        checks.push('Exactly three new pending records; no demo upload, live Firebase request, real email, device command or page exception');
        await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
        await a.page.screenshot({ path: path.join(root, 'test-results/reservation-confirmation.png'), fullPage: true });
        await admin.page.screenshot({ path: path.join(root, 'test-results/admin-reservations.png'), fullPage: true });
        await a.page.goto(origin + '/my-reservation.html');
        await a.page.locator('#bookingReference', { hasText: failedRef }).waitFor();
        await a.page.screenshot({ path: path.join(root, 'test-results/my-reservation.png'), fullPage: true });
        await a.page.locator('#profileLink').click();
        await a.page.locator('#publicSignOut').click();
        await a.page.waitForURL(url => url.pathname.endsWith('/index.html'));
        await a.page.goto(origin + '/my-reservation.html');
        await a.page.waitForFunction(() => document.querySelector('#stateText').textContent.includes('Sign in'));
        assert.equal(await a.page.locator('#bookedFacilities > li').count(), 0);
        checks.push('Firebase sign-out clears owner view on revisit; saved local records remain intact');
        assert.deepEqual(failures, []);
        assert.deepEqual(forbidden, []);
        console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); console.error({ checks, failures, forbidden }); process.exitCode = 1; });
