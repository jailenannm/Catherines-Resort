'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const { createSignedRfidCheckIn } = require('./signed-rfid-check-in.cjs');
const { createDiagnostics } = require('./rfid-bench-diagnostics.cjs');
const { createReaderDisplay } = require('./rfid-reader-display.cjs');
const { createDeviceHttp, emulatorIdentity } = require('./reservation-device-http.cjs');
const { createFacilitiesHttp } = require('./facilities-v2-http.cjs');

function emulatorStore() {
    const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    if (process.env.GCLOUD_PROJECT !== 'demo-catherines-reservations' ||
        !['127.0.0.1:9000', '127.0.0.1:19000', '127.0.0.1:29000'].includes(host)) {
        throw Error('Use the demo project and a configured local RTDB emulator.');
    }
    const url = `http://${host}/.json?ns=demo-catherines-reservations-default-rtdb`;
    const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
    return {
        async read() {
            const response = await fetch(url, { headers: { ...headers, 'X-Firebase-ETag': 'true' }, signal: AbortSignal.timeout(5000) });
            if (!response.ok || !response.headers.get('etag')) throw Error('Cannot verify server state.');
            return { value: await response.json(), version: response.headers.get('etag') };
        },
        async compareAndSet(version, value) {
            const response = await fetch(url, { method: 'PUT', headers: { ...headers, 'if-match': version }, body: JSON.stringify(value), signal: AbortSignal.timeout(5000) });
            if (response.status === 412) return false;
            if (!response.ok) throw Error('Server rejected check-in.');
            await response.json();
            return true;
        }
    };
}

async function startBenchServer({ readerKeys, host = '0.0.0.0', port = 8787, diagnosticLog = console.log, diagnosticsOnly = false, deviceSync = null } = {}) {
    const store = emulatorStore();
    if (!readerKeys || !Object.keys(readerKeys).length || Object.entries(readerKeys).some(([id, key]) =>
        !/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof key !== 'string' || key.length < 32)) throw Error('Reader credential file is missing or invalid.');
    const receive = createSignedRfidCheckIn({ readerKeys, store });
    const diagnose = createDiagnostics({ readerKeys, log: diagnosticLog });
    const readDisplay = createReaderDisplay({ readerKeys, store });
    const deviceHandler = deviceSync && !diagnosticsOnly ? createDeviceHttp({ store, devices: deviceSync.devices, authenticate: emulatorIdentity(), webOrigin: deviceSync.webOrigin }) : null;
    const facilitiesHandler = deviceSync?.facilitiesV2 && !diagnosticsOnly ? createFacilitiesHttp({ store, devices: deviceSync.devices, authenticate: emulatorIdentity(), webOrigin: deviceSync.webOrigin, ...deviceSync.facilitiesV2 }) : null;
    const server = http.createServer(async (request, response) => {
        const reply = (status, value) => {
            if (deviceHandler && request.headers.origin === deviceSync.webOrigin) {
                response.setHeader('Access-Control-Allow-Origin', deviceSync.webOrigin);
                response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
                response.setHeader('Vary', 'Origin');
            }
            response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify(value));
        };
        if (facilitiesHandler && await facilitiesHandler(request, reply)) return;
        if (deviceHandler && await deviceHandler(request, reply)) return;
        if (request.headers.origin) return reply(403, { accepted: false, code: 'READER_ONLY' });
        if (request.method === 'GET' && request.url === '/health') {
            return reply(200, { ok: true, project: 'demo-catherines-reservations', serverTime: Date.now(), diagnosticsOnly });
        }
        if (diagnosticsOnly && request.url === '/scan') return reply(403, { accepted: false, code: 'DIAGNOSTICS_ONLY' });
        if (request.method !== 'POST' || !['/scan', '/diagnostic', '/reader-display'].includes(request.url)) return reply(404, { accepted: false, code: 'NOT_FOUND' });
        try {
            let body = '';
            for await (const chunk of request) {
                body += chunk;
                if (Buffer.byteLength(body) > 2048) return reply(413, { accepted: false, code: 'TOO_LARGE' });
            }
            const payload = JSON.parse(body);
            if (request.url === '/reader-display') {
                try { return reply(200, await readDisplay(payload, request.headers['x-reader-signature'])); }
                catch (error) {
                    if (error.message === 'INVALID_DISPLAY_REQUEST') return reply(401, { code: 'INVALID_DISPLAY_REQUEST' });
                    return reply(503, { code: 'DISPLAY_UNAVAILABLE' });
                }
            }
            if (request.url === '/diagnostic') {
                try { return reply(200, diagnose(payload, request.headers['x-reader-signature'], request.socket.remoteAddress)); }
                catch (error) { return reply(error.message === 'DIAGNOSTIC_BUSY' ? 429 : 401, { diagnosticReceived: false, code: error.message }); }
            }
            const result = await receive(payload, request.headers['x-reader-signature']);
            if (result.reused) return reply(409, { accepted: false, code: 'REPLAY', reference: result.reference, status: result.status });
            reply(200, { accepted: true, reference: result.reference, status: result.status, guestName: result.guestName });
        } catch (error) {
            if (/Unauthenticated|stale|identity was reused|Untrusted|incomplete/.test(error.message)) {
                return reply(401, { accepted: false, code: 'INVALID_READER_EVENT' });
            }
            if (error.message.includes('No Confirmed reservation')) return reply(422, { accepted: false, code: 'NO_ELIGIBLE_BOOKING' });
            if (error instanceof SyntaxError || error.message.includes('Unknown scan')) return reply(400, { accepted: false, code: 'INVALID_SCAN' });
            reply(503, { accepted: false, code: 'SAVE_UNCONFIRMED', message: 'Retry the same scan while fresh.' });
        }
    });
    server.requestTimeout = 6000;
    server.headersTimeout = 6000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
    return server;
}

module.exports = { startBenchServer };
if (require.main === module) {
    fs.readFile('.local/rfid-reader.json', 'utf8').then(JSON.parse)
        .then(readerKeys => startBenchServer({ readerKeys }))
        .then(() => console.log('RFID bench server listening on port 8787, demo emulator only. Physical tap result Pending.'))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
}
