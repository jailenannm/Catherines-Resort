'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
    let server;
    try { await fetch("http://127.0.0.1:5001/register.html", { signal: AbortSignal.timeout(1500) }); }
    catch { server = await startServer(5001, { cloudTest: true }); }
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const warnings = [], errors = [], unexpected = [];
    let interceptedSignups = 0;
    try {
        const context = await browser.newContext();
        await context.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/12.6.0/')) return route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(path.join(root, 'node_modules/firebase', path.basename(url.pathname)), 'utf8') });
            if (url.hostname === 'identitytoolkit.googleapis.com' && url.pathname.endsWith('/accounts:signUp')) {
                interceptedSignups++;
                // Actual Firebase SDK, fake backend error. Never forward signup.
                return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'OPERATION_NOT_ALLOWED', errors: [{ message: 'OPERATION_NOT_ALLOWED', domain: 'global', reason: 'invalid' }] } }) });
            }
            if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
            if (/firebase|emailjs/.test(url.hostname) || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(url.hostname)) unexpected.push({ host: url.hostname, path: url.pathname });
            return route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', async message => {
            if (message.type() === 'warning' && message.text().startsWith('Registration failed')) warnings.push(await message.args()[1].jsonValue());
        });
        await page.goto('http://127.0.0.1:5001/register.html');
        const target = await page.evaluate(() => {
            const context = SharedReservations.registrationContext();
            const app = firebase.app('shared-reservations');
            return { ...context, authApp: app.auth().app.name, databaseApp: app.database().app.name, databaseURL: app.options.databaseURL, emulator: Boolean(app.auth().emulatorConfig) };
        });
        assert.deepEqual(target, { appName: 'shared-reservations', projectId: 'atherines-resort-reservations', mode: 'production', authApp: 'shared-reservations', databaseApp: 'shared-reservations', databaseURL: 'https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app', emulator: false });
        await page.locator('#fullName').fill('Signup Diagnostic Fixture');
        await page.locator('#phoneNumber').fill('09171234567');
        await page.locator('#registerEmail').fill('diagnostic@example.invalid');
        await page.locator('#registerPassword').fill('FixturePassword123!');
        await page.locator('#confirmPassword').fill('FixturePassword123!');
        await page.locator('#agreeTerms').check();
        await page.locator('#submitRegisterBtn').click();
        await page.locator('#formStatus', { hasText: 'auth/operation-not-allowed' }).waitFor();
        assert.match(await page.locator('#formStatus').textContent(), /Enable Email\/Password/);
        await page.waitForFunction(() => !document.getElementById('submitRegisterBtn').disabled);
        assert.equal(interceptedSignups, 1);
        assert.equal(await page.locator('#agreeTerms').isChecked(), true);
        assert.equal(await page.locator('#subscribeNewsletter').isChecked(), false);
        assert.equal(await page.locator('#registerEmail').inputValue(), 'diagnostic@example.invalid');
        assert.deepEqual(warnings[0], { code: 'auth/operation-not-allowed', appName: 'shared-reservations', projectId: 'atherines-resort-reservations', mode: 'production', stage: 'create-account' });
        const sanitized = JSON.stringify(warnings);
        assert(!sanitized.includes('FixturePassword123!') && !sanitized.includes('diagnostic@example.invalid') && !sanitized.includes('apiKey') && !sanitized.includes('token'));
        // Raw errors can contain SDK/custom backend data. None is rendered/logged.
        await page.evaluate(() => { SharedReservations.register = async () => { throw { code: 'auth/network-request-failed', message: 'PRIVATE-PASSWORD-TOKEN', customData: { password: 'PRIVATE-PASSWORD-TOKEN' } }; }; });
        await page.locator('#submitRegisterBtn').click();
        await page.locator('#formStatus', { hasText: 'auth/network-request-failed' }).waitFor();
        assert(!(await page.locator('#formStatus').textContent()).includes('PRIVATE-PASSWORD-TOKEN'));
        assert(!JSON.stringify(warnings).includes('PRIVATE-PASSWORD-TOKEN'));
        assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
        console.log(JSON.stringify({ passed: true, target, capturedSyntheticCode: warnings[0].code, signupRequestsForwardedToCloud: 0, checks: ['Real port 5001 named Auth/RTDB app/project/mode verified', 'Actual SDK maps intercepted backend error to exact code and safe stage', 'Only code/app/project/mode/stage logged, no raw error or form values', 'Form/consent/offers preserved and retry enabled', 'No live account, device or email request'] }, null, 2));
    } finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
