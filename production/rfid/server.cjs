'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const { createSignedRfidCheckIn } = require('../../scripts/signed-rfid-check-in.cjs');
const { PROJECT, createProductionStore } = require('./store.cjs');

function createHandler({ store, readerKeys, allowedReferences = [], enabled = false }) {
    if (!readerKeys || !Object.keys(readerKeys).length || Object.values(readerKeys).some(key => typeof key !== 'string' || key.length < 32)) throw Error('Reader secrets unavailable.');
    const receive = createSignedRfidCheckIn({ store, readerKeys, isBookingEligible: booking => allowedReferences.includes(booking.reference) });
    return async (request, response) => {
        const reply = (status, body) => {
            response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify(body));
        };
        if (request.headers.origin) return reply(403, { accepted: false, code: 'READER_ONLY' });
        if (request.method === 'GET' && request.url === '/health') return reply(200, { ok: true, enabled, serverTime: Date.now() });
        if (request.method !== 'POST' || request.url !== '/scan') return reply(404, { accepted: false, code: 'NOT_FOUND' });
        if (!enabled) return reply(503, { accepted: false, code: 'CHECKIN_DISABLED' });
        try {
            let body = '';
            for await (const chunk of request) {
                body += chunk;
                if (Buffer.byteLength(body) > 2048) return reply(413, { accepted: false, code: 'TOO_LARGE' });
            }
            const result = await receive(JSON.parse(body), request.headers['x-reader-signature']);
            reply(result.reused ? 409 : 200, { accepted: !result.reused, code: result.reused ? 'REPLAY' : 'CHECKED_IN', reference: result.reference, status: result.status });
        } catch (error) {
            if (/Unauthenticated|stale|identity was reused|Untrusted|incomplete/.test(error.message)) return reply(401, { accepted: false, code: 'INVALID_READER_EVENT' });
            if (/No Confirmed reservation|approved test scope/.test(error.message)) return reply(422, { accepted: false, code: 'NO_ELIGIBLE_BOOKING' });
            if (error instanceof SyntaxError || /Unknown scan/.test(error.message)) return reply(400, { accepted: false, code: 'INVALID_SCAN' });
            reply(503, { accepted: false, code: 'SAVE_UNCONFIRMED' });
        }
    };
}

async function main() {
    if (process.env.PROJECT_ID !== PROJECT || !process.env.K_SERVICE || process.env.FIREBASE_DATABASE_EMULATOR_HOST || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw Error('Reviewed Cloud Run service identity required.');
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email'] });
    if (await auth.getProjectId() !== PROJECT) throw Error('Service identity project mismatch.');
    const tokenProvider = async () => {
        const token = await auth.getAccessToken();
        if (!token) throw Error('Service access token unavailable.');
        return token;
    };
    const readerKeys = JSON.parse(await fs.readFile('/secrets/reader-keys.json', 'utf8'));
    const allowedReferences = (process.env.RFID_ALLOWED_REFERENCES || '').split(',').filter(Boolean);
    const store = createProductionStore({ tokenProvider, allowedReferences });
    const server = http.createServer(createHandler({ store, readerKeys, allowedReferences, enabled: process.env.RFID_CHECKIN_ENABLED === 'true' }));
    server.requestTimeout = 10000;
    server.headersTimeout = 10000;
    server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
}
module.exports = { createHandler };
if (require.main === module) main().catch(() => { console.error('RFID service startup failed. Verify reviewed identity, secret mount and configuration.'); process.exitCode = 1; });
