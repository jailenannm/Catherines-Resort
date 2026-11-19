'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { startServer } = require('./serve.cjs');
const root = path.resolve(__dirname, '..');
const checks = [], errors = [], nativeAlerts = [], external = [];
async function main() {
    const server = await startServer();
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    try {
        async function pageFor(options = {}) {
            const context = await browser.newContext(options);
            await context.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.pathname.endsWith('/js/shared-reservations.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.__registerCalls=[];window.SharedReservations={register(...args){window.__registerCalls.push(args);return new Promise((resolve,reject)=>{window.__finishRegister=()=>resolve({admin:false});window.__failRegister=()=>reject(new Error("Forced failure"))})}};' });
                if (url.pathname.endsWith('/js/database.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.ResortDB={saveSession(...args){window.__savedSession=args}};' });
                if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: '/* Auth submission uses an isolated SharedReservations test double. */' });
                if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.continue();
                if (/firebase|emailjs/.test(url.hostname) || ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'].includes(url.hostname)) external.push(url.href);
                return route.abort();
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            page.on('dialog', async dialog => { nativeAlerts.push(dialog.message()); await dialog.dismiss(); });
            await page.goto('http://127.0.0.1:5000/register.html');
            return { page, context };
        }
        async function fill(page) {
            await page.locator('#fullName').fill('Registration Test');
            await page.locator('#phoneNumber').fill('09171234567');
            await page.locator('#registerEmail').fill('registration@example.invalid');
            await page.locator('#registerPassword').fill('TestPassword123!');
            await page.locator('#confirmPassword').fill('TestPassword123!');
        }
        const snapshot = page => page.evaluate(() => ({ values: [...document.querySelectorAll('#registerForm input')].map(input => ({ id: input.id, value: input.value, checked: input.checked })) }));
        const { page, context } = await pageFor({ viewport: { width: 1440, height: 1000 } });
        for (const id of ['agreeTerms', 'subscribeNewsletter']) {
            assert.equal(await page.locator('#' + id).isChecked(), false);
            const css = await page.locator('#' + id).evaluate(el => ({ opacity: getComputedStyle(el).opacity, pointerEvents: getComputedStyle(el).pointerEvents, appearance: getComputedStyle(el).appearance, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, labels: el.labels.length }));
            assert.equal(css.opacity, '1'); assert.notEqual(css.pointerEvents, 'none'); assert.notEqual(css.appearance, 'none');
            assert(css.width >= 18 && css.height >= 18 && css.labels === 1);
            await page.locator('#' + id).click(); assert.equal(await page.locator('#' + id).isChecked(), true);
            await page.locator('label[for="' + id + '"]').click({ position: { x: 6, y: 8 } }); assert.equal(await page.locator('#' + id).isChecked(), false);
            await page.locator('#' + id).focus(); await page.keyboard.press('Space'); assert.equal(await page.locator('#' + id).isChecked(), true);
            const focus = await page.locator('#' + id).evaluate(el => ({ focused: document.activeElement === el, outline: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
            assert(focus.focused && focus.outline !== 'none' && parseFloat(focus.width) >= 2);
            await page.keyboard.press('Space'); assert.equal(await page.locator('#' + id).isChecked(), false);
        }
        assert.equal(await page.locator('#agreeTerms').getAttribute('required'), '');
        assert.equal(await page.locator('#subscribeNewsletter').getAttribute('required'), null);
        checks.push('Both native checkboxes start unchecked, toggle by mouse/input and associated label and Space, and expose visible native state and keyboard focus; only consent is required');
        await fill(page);
        await page.locator('#submitRegisterBtn').click();
        await page.locator('#termsError', { hasText: 'Please agree' }).waitFor();
        assert.equal(await page.evaluate(() => window.__registerCalls.length), 0);
        assert.equal(await page.locator('#agreeTerms').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.locator('#termsError').isVisible(), true);
        assert.equal(await page.locator('#agreeTerms').evaluate(el => document.activeElement === el), true);
        checks.push('Missing consent blocks registration through native required validation and shows a styled inline, associated error without any Firebase call');
        const initial = await snapshot(page);
        for (const [link, dialog, title] of [['termsLink', 'termsPolicy', 'Terms of Service'], ['privacyLink', 'privacyPolicy', 'Privacy Policy']]) {
            await page.locator('#' + link).click();
            const modal = page.locator('#' + dialog);
            assert.equal(await modal.evaluate(el => el.open && el.matches(':modal')), true);
            assert.equal(await modal.getAttribute('aria-labelledby'), dialog + 'Title');
            assert.equal(await modal.locator('h2').textContent(), title);
            assert.equal(await page.locator('#agreeTerms').isChecked(), false);
            assert.deepEqual(await snapshot(page), initial);
            assert.equal(await page.evaluate(() => window.__registerCalls.length), 0);
            for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); assert.equal(await modal.evaluate(el => el.contains(document.activeElement)), true); }
            for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Tab'); assert.equal(await modal.evaluate(el => el.contains(document.activeElement)), true); }
            assert.equal(await modal.locator('.policy-body').evaluate(el => getComputedStyle(el).fontSize), '16px');
            await modal.locator('[data-close-policy]').click();
            await page.waitForFunction(id => document.activeElement.id === id, link);
            assert.deepEqual(await snapshot(page), initial);
            await page.locator('#' + link).focus(); await page.keyboard.press('Enter');
            assert.equal(await modal.evaluate(el => el.open), true);
            await page.keyboard.press('Escape');
            await page.waitForFunction(id => document.activeElement.id === id, link);
            assert.equal(await modal.evaluate(el => el.open), false);
        }
        assert.deepEqual(await page.locator('#termsPolicy li').allTextContents(), ['Membership is non-transferable.', 'Member rates apply to direct bookings.', 'Cancellation policies apply as outlined in reservation terms.']);
        assert.equal(await page.locator('#privacyPolicy .policy-body p').nth(1).textContent(), 'Your personal information is securely stored and used solely for managing your resort stay, reservation preferences, and requested communications.');
        checks.push('Separate titled native policy dialogs preserve exact existing wording; link mouse/Enter opening neither toggles consent nor submits; Tab/Shift+Tab trap, Close/Escape and return focus verified');
        await page.locator('#agreeTerms').check();
        await page.locator('#subscribeNewsletter').check();
        const checked = await snapshot(page);
        for (const id of ['terms', 'privacy']) {
            await page.locator('#' + id + 'Link').click();
            assert.deepEqual(await snapshot(page), checked);
            await page.keyboard.press('Escape');
            await page.waitForFunction(id => document.activeElement.id === id, id + 'Link');
            assert.deepEqual(await snapshot(page), checked);
        }
        await page.locator('#subscribeNewsletter').uncheck();
        assert.equal(await page.locator('#termsError').textContent(), '');
        assert.equal(await page.locator('#agreeTerms').getAttribute('aria-invalid'), 'false');
        await page.locator('#submitRegisterBtn').click();
        assert.deepEqual(await page.evaluate(() => window.__registerCalls), [['registration@example.invalid', 'TestPassword123!', 'Registration Test']]);
        assert.equal(await page.locator('#subscribeNewsletter').isChecked(), false);
        await page.evaluate(() => window.__failRegister());
        await page.locator('#formStatus', { hasText: 'Account creation failed' }).waitFor();
        assert.equal(await page.locator('#agreeTerms').isChecked(), true);
        await page.locator('#submitRegisterBtn').click();
        await page.evaluate(() => window.__finishRegister());
        await page.locator('#formStatus', { hasText: 'created successfully' }).waitFor();
        assert.equal(await page.evaluate(() => window.__savedSession[0].email), 'registration@example.invalid');
        await context.close();
        checks.push('Values and both checked states survive dialogs; consent checked/offers unchecked reaches unchanged registration signature, failed submission retains consent, and retry follows existing success/session flow');
        const mobile = await pageFor({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        for (const id of ['agreeTerms', 'subscribeNewsletter']) {
            await mobile.page.locator('#' + id).tap(); assert.equal(await mobile.page.locator('#' + id).isChecked(), true);
            await mobile.page.locator('label[for="' + id + '"]').tap({ position: { x: 6, y: 8 } }); assert.equal(await mobile.page.locator('#' + id).isChecked(), false);
        }
        await fill(mobile.page);
        await mobile.page.locator('#agreeTerms').check();
        const mobileState = await snapshot(mobile.page);
        for (const id of ['terms', 'privacy']) {
            await mobile.page.locator('#' + id + 'Link').tap();
            const modal = mobile.page.locator('#' + id + 'Policy');
            assert.equal(await modal.evaluate(el => el.open), true);
            const bounds = await modal.boundingBox();
            assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 391 && bounds.y + bounds.height <= 845);
            await mobile.page.screenshot({ path: path.join(root, 'test-results/register-' + id + '-mobile.png'), animations: 'disabled' });
            await modal.locator('[data-close-policy]').tap();
            assert.deepEqual(await snapshot(mobile.page), mobileState);
        }
        // Exercise future long approved text without changing the actual policy.
        await mobile.page.locator('#termsLink').tap();
        await mobile.page.locator('#termsPolicy .policy-body').evaluate(el => { for (let i = 0; i < 40; i++) { const p = document.createElement('p'); p.textContent = 'Long content test fixture only. This is not policy text.'; el.appendChild(p); } });
        assert.equal(await mobile.page.locator('#termsPolicy .policy-body').evaluate(el => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto'), true);
        await mobile.page.locator('#termsPolicy .policy-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
        assert.equal(await mobile.page.locator('#termsPolicy .policy-body').evaluate(el => el.scrollTop > 0), true);
        assert.equal(await mobile.page.locator('#termsPolicy [data-close-policy]').evaluate(el => { const box = el.getBoundingClientRect(); return box.top >= 0 && box.bottom <= window.innerHeight; }), true);
        await mobile.page.locator('#termsPolicy [data-close-policy]').tap();
        assert.deepEqual(await snapshot(mobile.page), mobileState);
        await mobile.context.close();
        checks.push('390px touch emulation toggles both inputs/labels, opens/closes each policy without state loss, keeps dialogs in viewport and scrolls synthetic long content with Close visible');
        assert.deepEqual(errors, []); assert.deepEqual(nativeAlerts, []); assert.deepEqual(external, []);
        checks.push('No browser alerts, page errors, live Firebase/email/device requests or real accounts created');
        console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
