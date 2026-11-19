'use strict';
const http = require('node:http');
const { createEmulatorDepartureVerifier } = require('./emulator-departure-verifier.cjs');
const PROJECT = 'demo-catherines-reservations';

async function startAdminCheckoutServer({ host, port = 8790, webPort = 5000, transport = fetch }) {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    const pairs = { '127.0.0.1:9099': '127.0.0.1:9000', '127.0.0.1:19099': '127.0.0.1:19000', '127.0.0.1:29099': '127.0.0.1:29000' };
    if (process.env.GCLOUD_PROJECT !== PROJECT || pairs[authHost] !== databaseHost) throw Error('Matching local demo emulators required.');
    const origin = 'http://' + host + ':' + webPort;
    async function administrator(authorization) {
        if (!authorization?.startsWith('Bearer ')) throw Error('Administrator authentication required.');
        const token = authorization.slice(7);
        let claims;
        try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); } catch { throw Error('Administrator authentication required.'); }
        if (claims.aud !== PROJECT || claims.iss !== 'https://securetoken.google.com/' + PROJECT || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now() || claims.admin !== true || claims.firebase?.sign_in_provider !== 'password') throw Error('Administrator authentication required.');
        const response = await transport('http://' + authHost + '/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-reservations-key', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(5000)
        });
        const user = (await response.json()).users?.[0];
        if (!response.ok || !user || user.disabled || user.localId !== claims.sub || JSON.parse(user.customAttributes || '{}').admin !== true) throw Error('Administrator authentication required.');
        return user.localId;
    }
    const server = http.createServer(async (request, response) => {
        const reply = (status, value) => {
            if (request.headers.origin === origin) response.setHeader('Access-Control-Allow-Origin', origin);
            response.setHeader('Vary', 'Origin');
            response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify(value));
        };
        if (request.headers.origin && request.headers.origin !== origin) return reply(403, { error: 'Demo origin denied.' });
        if (request.method === 'OPTIONS') {
            response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
            response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            return reply(204, {});
        }
        if (request.method === 'GET' && request.url === '/health') return reply(200, { project: PROJECT, databaseHost, authHost });
        if (request.method !== 'POST' || request.url !== '/admin/confirm-checkout') return reply(404, { error: 'Unavailable.' });
        let confirmedBy;
        try { confirmedBy = await administrator(request.headers.authorization); }
        catch { return reply(403, { error: 'Verified administrator required.' }); }
        try {
            let body = '';
            for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 1024) return reply(413, { error: 'Request too large.' }); }
            const input = JSON.parse(body);
            if (!/^CBLR-[0-9]{6}$/.test(input.reference || '') || input.guestDeparted !== true || input.cardReadyForReuse !== true) return reply(400, { error: 'Confirm departure and card readiness.' });
            const event = { eventId: 'fixture-departure-admin-' + input.reference, reference: input.reference, receivedAt: Date.now(), trusted: true, source: 'admin-confirmed', confirmedBy, guestDeparted: true, cardReadyForReuse: true };
            const complete = createEmulatorDepartureVerifier({ fixtures: [event], transport });
            reply(200, { success: true, ...await complete(event.eventId) });
        } catch (error) { reply(409, { error: error.message || 'Checkout was not confirmed. Retry.' }); }
    });
    server.requestTimeout = 6000;
    server.headersTimeout = 6000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    return server;
}
module.exports = { startAdminCheckoutServer };
if (require.main === module) {
    const host = process.argv.find(argument => argument.startsWith('--host='))?.slice(7);
    if (!host) throw Error('Supply Laptop 1 LAN address using --host.');
    startAdminCheckoutServer({ host }).then(() => console.log('Admin-confirmed demo checkout listening on port 8790.')).catch(error => { console.error(error.message); process.exitCode = 1; });
}
