'use strict';
const { createReservationDeviceSync } = require('./reservation-device-sync.cjs');

function createDeviceHttp({ store, devices, authenticate, webOrigin }) {
    const sync = createReservationDeviceSync({ store, devices });
    return async function handle(request, reply) {
        if (!['/device/sync', '/guest/cottages', '/guest/device-state', '/admin/device-state'].includes(new URL(request.url, 'http://localhost').pathname)) return false;
        const url = new URL(request.url, 'http://localhost');
        if (request.headers.origin && request.headers.origin !== webOrigin) { reply(403, { error: 'Origin denied.' }); return true; }
        if (request.method === 'OPTIONS' && url.pathname !== '/device/sync') { reply(204, {}); return true; }
        try {
            let body = '';
            for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > 2048) throw Error('INVALID_REQUEST'); }
            let result;
            if (url.pathname === '/device/sync') {
                if (request.method !== 'POST' || request.headers.origin) throw Error('INVALID_DEVICE');
                result = await sync.sync(JSON.parse(body), request.headers['x-device-signature']);
            } else {
                const user = await authenticate(request.headers.authorization);
                if (url.pathname === '/guest/cottages' && request.method === 'POST') result = await sync.cottage(user, JSON.parse(body));
                else if (url.pathname === '/guest/device-state' && request.method === 'GET') result = await sync.status(user, url.searchParams.get('reference'));
                else if (url.pathname === '/admin/device-state' && request.method === 'GET' && user.admin) result = await sync.status(user);
                else throw Error('FORBIDDEN');
            }
            reply(200, result);
        } catch (error) {
            const forbidden = ['FORBIDDEN', 'INVALID_DEVICE'].includes(error.message);
            reply(forbidden ? 403 : error instanceof SyntaxError || /INVALID|REUSED/.test(error.message) ? 400 : 503,
                { error: forbidden ? 'Access denied.' : 'Request unconfirmed. Retry with the same request ID.' });
        }
        return true;
    };
}

function emulatorIdentity() {
    const project = 'demo-catherines-reservations';
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const dbHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    const pairs = { '127.0.0.1:9099': '127.0.0.1:9000', '127.0.0.1:19099': '127.0.0.1:19000', '127.0.0.1:29099': '127.0.0.1:29000' };
    if (process.env.GCLOUD_PROJECT !== project || pairs[authHost] !== dbHost) throw Error('Matching demo emulators required.');
    return async authorization => {
        try {
            if (!authorization?.startsWith('Bearer ')) throw Error();
            const token = authorization.slice(7);
            const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
            if (claims.aud !== project || claims.iss !== 'https://securetoken.google.com/' + project || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now() || claims.firebase?.sign_in_provider !== 'password') throw Error();
            const response = await fetch('http://' + authHost + '/identitytoolkit.googleapis.com/v1/accounts:lookup?key=demo-reservations-key', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), signal: AbortSignal.timeout(5000)
            });
            const user = (await response.json()).users?.[0];
            if (!response.ok || !user || user.disabled || user.localId !== claims.sub) throw Error();
            return { uid: user.localId, admin: claims.admin === true && JSON.parse(user.customAttributes || '{}').admin === true };
        } catch { throw Error('FORBIDDEN'); }
    };
}
module.exports = { createDeviceHttp, emulatorIdentity };
