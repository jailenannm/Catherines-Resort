'use strict';
const { createFacilitiesV2 } = require('./facilities-v2.cjs');
function createFacilitiesHttp({ store, devices, authenticate, webOrigin, catalog, simulation, audioPolicy, loadLyrics, safetyCommissioned, onError = () => {} }) {
    const api = createFacilitiesV2({ store, devices, catalog, simulation, audioPolicy, loadLyrics, safetyCommissioned });
    return async function handle(req, reply) {
        const u = new URL(req.url, 'http://localhost');
        if (!['/device/facilities/v2/sync', '/guest/facilities/v2/state', '/guest/facilities/v2/command', '/admin/facilities/v2/state', '/admin/facilities/v2/command'].includes(u.pathname)) return false;
        if (req.headers.origin && req.headers.origin !== webOrigin) { reply(403, { error: 'ORIGIN_DENIED' }); return true; }
        if (req.method === 'OPTIONS' && u.pathname !== '/device/facilities/v2/sync') { reply(204, {}); return true; }
        try {
            let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 8192) throw Error('INVALID_SIZE'); }
            let result;
            if (u.pathname === '/device/facilities/v2/sync' && req.method === 'POST' && !req.headers.origin) result = await api.sync(JSON.parse(raw), req.headers['x-device-signature']);
            else {
                const user = await authenticate(req.headers.authorization);
                if (u.pathname === '/guest/facilities/v2/state' && req.method === 'GET') result = await api.state(user, u.searchParams.get('reference'));
                else if (u.pathname === '/guest/facilities/v2/command' && req.method === 'POST') result = await api.command(user, JSON.parse(raw));
                else if (u.pathname === '/admin/facilities/v2/command' && req.method === 'POST' && user.admin) result = await api.adminCommand(user, JSON.parse(raw));
                else if (u.pathname === '/admin/facilities/v2/state' && req.method === 'GET' && user.admin) result = await api.state(user);
                else throw Error('FORBIDDEN');
            }
            reply(200, result);
        } catch (e) { onError(e.message); const code = ['FORBIDDEN', 'INVALID_DEVICE', 'HALL_NOT_READY', 'AWAITING_VERIFICATION', 'AUDIO_BUSY', 'AUDIO_NOT_OWNER', 'RESOURCE_BUSY', 'TRACK_UNAVAILABLE', 'AUDIO_POLICY_UNAPPROVED', 'QUEUE_BOUNDARY', 'INVALID_QUEUE', 'INVALID_VOLUME', 'INVALID_PLAYER_STATE', 'TRACK_CATEGORY_DENIED', 'REQUEST_EXPIRED', 'ESP1_ROUTE_NOT_COMMISSIONED', 'MAINTENANCE_POLICY_UNAPPROVED', 'SAFETY_NOT_VERIFIED', 'MAINTENANCE_SAFETY_NOT_VERIFIED', 'INVALID_VALUE','INVALID_RGB'].includes(e.message) ? e.message : 'REQUEST_UNCONFIRMED'; reply(code === 'REQUEST_UNCONFIRMED' ? 503 : 403, { error: code }); }
        return true;
    };
}
module.exports = { createFacilitiesHttp };
