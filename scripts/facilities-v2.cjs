'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const { audioManager } = require('./facility-audio.cjs');
const { validateCatalog, parseLrc } = require('./song-catalog.cjs');
const canonical = value => JSON.stringify(value, function (key, v) { if (v == null) return undefined; return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v; });
const TYPES = { cottage_lights: 'cottage', event_lights: 'event', stage_lights: 'event', pool_pump: 'pool', pool_rgb: 'pool', stage_rgb: 'event', ktv_door: 'ktv', ktv_rgb: 'ktv', audio_playback: 'audio', tft_status: 'system' };
const requestFields = p => JSON.stringify(['cblr-facilities-request-v2', p.deviceId, p.requestId, p.observedAt, p.ackVersion, p.report, p.simulation]);
const responseFields = p => JSON.stringify(['cblr-facilities-state-v2', p.deviceId, p.requestId, p.version, p.desired, p.serverTime, p.validForMs, p.simulation]);
const includes = (b, kind) => Object.values(b?.facilities || {}).some(f => f.value === kind || f.value === 'buyout' || kind === 'pool' && f.value === 'event' && f.packageVersion === 2);
const guestAllowed = (b, type) => !['pool_pump','ktv_door'].includes(type) && (type==='stage_lights'||type==='stage_rgb' ? Object.values(b?.facilities||{}).some(f=>f.value==='buyout'||f.value==='event'&&f.packageVersion===2) : includes(b,TYPES[type]));
function createFacilitiesV2({ store, devices, catalog, now = Date.now, simulation = false, commissioned = {}, audioPolicy = null, loadLyrics = () => null, safetyCommissioned = {} }) {
    catalog = validateCatalog(catalog);
    if (!devices?.esp2?.key || devices.esp2.key.length < 32) throw Error('INVALID_DEVICE_CONFIG');
    if (!simulation && Object.values(commissioned).some(Boolean)) throw Error('PHYSICAL_V2_ACTIVATION_REQUIRES_DRIVER_REVIEW');
    const lyricCache = new Map();
    function lyricWindow(trackId, positionMs) {
        const t = catalog.tracks.find(t => t.id === trackId);
        if (!t?.verified || !t.lyrics) return { cues: [], offsetMs: 0, status: 'Missing lyrics' };
        if (!lyricCache.has(t.id)) { try { lyricCache.set(t.id, parseLrc(loadLyrics(t.lyrics))); } catch { lyricCache.set(t.id, []); } }
        const cues = lyricCache.get(t.id), at = Math.max(0, positionMs + t.offsetMs);
        let index = 0; for (let i = 0; i < cues.length; i++) if (cues[i].at <= at) index = i;
        return { cues: cues.slice(index, index + 8), offsetMs: t.offsetMs, status: cues.length ? 'Estimated timing' : 'Missing lyrics' };
    }
    const manager = audioManager({ catalog, now, policy: audioPolicy });
    const enabled = type => simulation && type in TYPES && !['pool_rgb','stage_rgb'].includes(type);
    const replay = new Map();
    async function tx(fn) {
        for (let n = 0; n < 8; n++) { const { value, version } = await store.read(); const root = structuredClone(value || {}); const result = fn(root); if (await store.compareAndSet(version, root)) return result; }
        throw Error('CONCURRENT_UPDATE');
    }
    function initialize(root) {
        const state = root.reservationFacilitiesV2 ||= { version: 0, claims: {}, commands: {}, events: {}, audio: { owner: null, state: 'stopped', trackId: null, positionMs: 0, changedAt: now(), revision: 0, volume: 15, pending: [], queue: [], index: 0 }, hall: { ready: false, receivedAt: 0 } };
        state.adminClaims ||= {}; state.adminAudit ||= {}; state.claims ||= {}; state.commands ||= {}; state.events ||= {};
        state.audio.pending = Object.values(state.audio.pending || []); state.audio.queue = Object.values(state.audio.queue || []);
        state.audio.owner ??= null; state.audio.trackId ??= null;
        return state;
    }
    function valid(root, reference, kind) { const b = root.sharedReservations?.[reference]; return Boolean(b && b.status === 'Checked In' && (kind === 'system' || includes(b, kind))); }
    function owner(root, user, reference) { const b = root.sharedReservations?.[reference]; if (!user || user.admin || b?.ownerUid !== user.uid || b.status !== 'Checked In') throw Error('FORBIDDEN'); return b; }
    function ready(s) { return enabled('ktv_door') && s.hall.ready === true && now() >= s.hall.receivedAt && now() - s.hall.receivedAt < 3000; }
    function reconcile(root) {
        const s = initialize(root), hallReady = ready(s);
        for (const ref of Object.keys(s.claims)) if (root.sharedReservations?.[ref]?.status !== 'Checked In') delete s.claims[ref];
        const desired = { cottage_lights: false, event_lights: false, stage_lights: false, pool_pump: false, ktv_door: 'stop', ktv_rgb: [0, 0, 0], ktv_rgb_effect: 'off' };
        for (const [ref, claims] of Object.entries(s.claims)) for (const [kind, claim] of Object.entries(claims)) {
            if (!enabled(kind) || !valid(root, ref, TYPES[kind]) || !guestAllowed(root.sharedReservations?.[ref],kind)) { delete claims[kind]; continue; }
            if (typeof desired[kind] === 'boolean') desired[kind] ||= claim.value;
            // Door/RGB are exclusive resources, not last-writer-wins shared actuators.
            else if (kind === 'ktv_door' && claim.expiresAt > now()) desired[kind] = claim.value;
            else if (kind === 'ktv_rgb' && hallReady) { const disco=claim.value==='disco'||claim.value?.mode==='disco'; const brightness=claim.value?.brightness??128; desired.ktv_rgb=disco?[brightness,0,brightness]:claim.value;desired.ktv_rgb_effect=disco?'disco':claim.value.some(n=>n>0)?'solid':'off'; }
        }
        for (const [uid,claims] of Object.entries(s.adminClaims)) for(const [kind,claim] of Object.entries(claims)) {
            const observation=s.safetyObservation,freshSafety=observation&&now()>=observation.at&&now()-observation.at<3000;
            if(claim.expiresAt<=now() || kind==='pool_pump'&&(!safetyCommissioned.pump||!freshSafety||observation.value?.pump?.operatingSafe!==true) || kind==='ktv_door'&&claim.value!=='stop'&&(!safetyCommissioned.ktv||!freshSafety||observation.value?.ktv?.clear!==true)){delete claims[kind];continue;}
            if(typeof desired[kind]==='boolean')desired[kind] ||= claim.value;
            else if(kind==='ktv_door')desired[kind]=claim.value;
            else if(kind==='ktv_rgb'&&hallReady){const disco=claim.value==='disco'||claim.value?.mode==='disco';const brightness=claim.value?.brightness??128;desired.ktv_rgb=disco?[brightness,0,brightness]:claim.value;desired.ktv_rgb_effect=disco?'disco':claim.value.some(n=>n>0)?'solid':'off';}
        }
        // Retain legitimate v1 cottage claims when migrating a board, without a second GPIO writer.
        if (enabled('cottage_lights')) for (const [ref, claim] of Object.entries(root.reservationDeviceSync?.requests || {})) if (valid(root, ref, 'cottage') && claim.on) desired.cottage_lights = true;
        const audioValid = (ref, category) => ref?.startsWith('@admin:') ? s.adminAudioOwner===ref && now()<s.adminAudioExpires : category === 'checkout' ? root.sharedReservations?.[ref]?.status === 'Completed' && Object.values(root.verifiedDepartures || {}).some(r => r.reference === ref) : category === 'welcome' ? valid(root, ref, 'system') : valid(root, ref, category);
        // Receipt-driven, fresh-event-only announcements. Old imported receipts are never replayed.
        for (const [category, receipts] of [['welcome', root.verifiedCheckins], ['checkout', root.verifiedDepartures]]) for (const [id, receipt] of Object.entries(receipts || {})) {
            const key = category + ':' + id; if (s.events[key]) continue;
            s.events[key] = { consideredAt: now(), reference: receipt.reference };
            const at = receipt.checkedInAt ?? receipt.completedAt;
            const t = catalog.tracks.find(t => t.category === category && t.verified);
            if (enabled('audio_playback') && audioPolicy && t && Number.isSafeInteger(at) && now() >= at && now() - at < 30000 && audioValid(receipt.reference, category) && s.audio.pending.length < 32) s.audio.pending.push({ reference: receipt.reference, category, trackId: t.id });
        }
        if (!enabled('audio_playback')) { if (s.audio.owner) manager.stop(s.audio); s.audio.pending = []; }
        manager.reconcile(s.audio, audioValid, hallReady);
        desired.audio = { title: catalog.tracks.find(t => t.id === s.audio.trackId)?.title || '', revision: s.audio.revision, owner: s.audio.owner, trackId: s.audio.trackId, category: s.audio.category || null, state: s.audio.state, positionMs: s.audio.positionMs, volume: s.audio.volume };
        // Time-dependent estimated position is not versioned; changes only on player state transitions.
        if (canonical(s.desired) !== canonical(desired)) s.version++;
        s.desired = desired; // Reconstruct explicit wire nulls stripped by RTDB even when version is stable.
        return s;
    }
    function view(s, reference, admin) {
        const age = s.device ? now() - s.device.seenAt : Infinity;
        const fresh = age >= 0 && age < 10000;
        const acknowledged = fresh && s.device.ackVersion === s.version && !s.device.report?.error;
        const ownAudio = admin || s.audio.owner === reference;
        return { serverTime:now(), ...(admin?{adminAudit:Object.values(s.adminAudit).slice(-20).map(a=>({...a,state:a.outcome==='rejected'?'Rejected':a.expiresAt<=now()?'Expired':a.type!=='audio_playback'&&s.adminClaims[a.uid]?.[a.type]?.requestId!==a.requestId?'No longer active':s.device?.ackVersion===a.desiredVersion&&a.desiredVersion===s.version&&now()-s.device.seenAt<10000&&!s.device.report.error?'Acknowledged request':'Pending acknowledgement'})),adminCapabilities:{entrance_gate:'Routing not commissioned',pathway_override:'Policy derived; no routine override',lighthouse_maintenance:'Driver unverified',pool_pump:safetyCommissioned.pump?'Safety validation required':'Not commissioned',ktv_door:safetyCommissioned.ktv?'Safety validation required':'Not commissioned'}}:{}), simulation, version: s.version, capabilities: Object.fromEntries(Object.keys(TYPES).map(k => [k, !admin&&['pool_pump','ktv_door'].includes(k)?'Administrator only':enabled(k) ? 'Simulation' : 'Awaiting Verification'])),
            desired: { ...s.desired, audio: ownAudio ? s.desired.audio : { state: s.audio.owner ? 'busy' : 'stopped', trackId: null } },
            device: { lastSyncAt:s.device?.seenAt||null,expired:!fresh,error:s.device?.report?.error||null, state: !s.device ? 'Unknown' : age >= 12000 ? 'Offline' : acknowledged ? simulation ? 'Simulation acknowledged' : 'Device acknowledged' : 'Command pending', acknowledged, report: fresh ? { ...s.device.report, audio: ownAudio ? s.device.report.audio : !s.audio.owner && s.device.report.audio?.state === 'stopped' ? {state:'stopped',trackId:null,positionMs:0,revision:s.device.report.audio.revision} : null } : null },
            hallReady: ready(s), catalog, audio: ownAudio ? { ...s.audio, pending: undefined, positionMs: manager.position(s.audio) } : { state: s.audio.owner ? 'busy' : 'stopped', trackId: null },
            lyricWindow: ownAudio ? lyricWindow(s.audio.trackId, s.device?.report?.audio?.trackId===s.audio.trackId && s.device?.report?.audio?.revision===s.audio.revision ? s.device.report.audio.positionMs || 0 : 0) : { cues: [] },
            lyrics: ownAudio && s.audio.trackId ? catalog.tracks.find(t => t.id === s.audio.trackId)?.lyrics || null : null };
    }
    return {
        async state(user, reference) { return tx(root => { if (!user?.admin) owner(root, user, reference); return view(reconcile(root), reference, user?.admin); }); },
        async adminCommand(user, p) {
            if (!user?.admin || typeof user.uid !== 'string') throw Error('FORBIDDEN');
            if (!/^[\w-]{16,100}$/.test(p?.requestId || '') || typeof p.type !== 'string' || !Number.isSafeInteger(p.issuedAt) || !Number.isSafeInteger(p.expiresAt) || p.issuedAt > now() || p.expiresAt <= now() || p.expiresAt - p.issuedAt > 10000 || now() - p.issuedAt > 15000) throw Error('REQUEST_EXPIRED');
            const result = await tx(root => {
                const s = reconcile(root), fingerprint = JSON.stringify([user.uid,p.type,p.value,p.issuedAt,p.expiresAt,p.operatorClearance===true,p.maintenance===true,p.category||null]);
                const previous = s.adminAudit[p.requestId];
                if (previous) {
                    if (previous.fingerprint !== fingerprint) throw Error('REQUEST_ID_REUSED');
                    return {accepted:previous.outcome==='accepted',error:previous.error,reused:true,...view(s,undefined,true)};
                }
                let error;
                const stop = p.type==='ktv_door' && p.value==='stop';
                if (['entrance_gate','entrance_stop'].includes(p.type)) error='ESP1_ROUTE_NOT_COMMISSIONED';
                else if (['pathway_override','lighthouse_maintenance'].includes(p.type)) error='MAINTENANCE_POLICY_UNAPPROVED';
                else if (!Object.hasOwn(TYPES,p.type) || !enabled(p.type) || p.type==='tft_status') error='AWAITING_VERIFICATION';
                else if ((p.type.endsWith('_lights') || p.type==='pool_pump') && typeof p.value!=='boolean') error='INVALID_VALUE';
                else if (p.type==='ktv_door' && !['open','close','stop'].includes(p.value)) error='INVALID_VALUE';
                else if (p.type==='ktv_rgb' && p.value!=='disco' && !(p.value?.mode==='disco' && Number.isInteger(p.value.brightness) && p.value.brightness>=0 && p.value.brightness<=255) && !(Array.isArray(p.value)&&p.value.length===3&&p.value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))) error='INVALID_RGB';
                const fresh = s.device && now()>=s.device.seenAt && now()-s.device.seenAt<3000;
                if (!error && p.type==='ktv_door' && !stop) {
                    const safety=s.device?.report?.safety?.ktv;
                    const limits=safetyCommissioned.ktvLimits;
                    const calibrated=limits && ['min','max','open','closed'].every(k=>Number.isInteger(limits[k])&&limits[k]>=1000&&limits[k]<=2000) && limits.min<limits.max && [limits.open,limits.closed].every(n=>n>=limits.min&&n<=limits.max) && limits.open!==limits.closed;
                    if (!safetyCommissioned.ktv || !calibrated || !fresh || !safety || !['open','closed'].includes(safety.position) || safety.motion!=='stopped' || safety.clear!==true || p.operatorClearance!==true) error='SAFETY_NOT_VERIFIED';
                }
                if (!error && p.type==='pool_pump' && (!safetyCommissioned.pump || p.maintenance!==true || !fresh || s.device.report?.safety?.pump?.operatingSafe!==true)) error='MAINTENANCE_SAFETY_NOT_VERIFIED';
                if (!error && p.type==='ktv_rgb' && !ready(s)) error='HALL_NOT_READY';
                if (!error && p.type.startsWith('ktv_') && !stop) {
                    if (Object.values(s.claims).some(c=>c[p.type]) || Object.entries(s.adminClaims).some(([uid,c])=>uid!==user.uid&&c[p.type]?.expiresAt>now())) error='RESOURCE_BUSY';
                }
                if (!error) {
                    try {
                        if (p.type==='audio_playback') {
                            if (!['ktv','event'].includes(p.category)) throw Error('FORBIDDEN');
                            if (p.category==='ktv'&&!ready(s)) throw Error('HALL_NOT_READY');
                            const ref='@admin:'+user.uid;
                            manager.apply(s.audio,ref,p.value||{},p.category);
                            s.adminAudioOwner=ref;s.adminAudioExpires=p.expiresAt;
                        } else {
                            if(stop)for(const claims of Object.values(s.adminClaims))delete claims.ktv_door;
                            s.adminClaims[user.uid] ||= {};
                            s.adminClaims[user.uid][p.type]={value:p.value,expiresAt:p.expiresAt,requestId:p.requestId};
                        }
                    } catch(e) {error=e.message;}
                }
                s.adminAudit[p.requestId]={requestId:p.requestId,fingerprint,uid:user.uid,type:p.type,value:p.value,issuedAt:p.issuedAt,expiresAt:p.expiresAt,recordedAt:now(),outcome:error?'rejected':'accepted',...(error?{error}:{})};
                const current=reconcile(root);s.adminAudit[p.requestId].desiredVersion=current.version;
                return {accepted:!error,...(error?{error}:{}),...view(current,undefined,true)};
            });
            if (!result.accepted) throw Error(result.error || 'REQUEST_REJECTED');
            return result;
        },
        async command(user, p) {
            if(['pool_pump','ktv_door','entrance_gate','entrance_stop','pathway_override','lighthouse_maintenance'].includes(p?.type))throw Error('FORBIDDEN');
            if (!/^CBLR-\d{6}$/.test(p?.reference || '') || !/^[\w-]{16,100}$/.test(p.requestId || '') || !Object.hasOwn(TYPES, p.type) || p.type === 'tft_status') throw Error('INVALID_COMMAND');
            return tx(root => {
                const b = owner(root, user, p.reference), s = reconcile(root);
                const entitlement = p.type === 'audio_playback' ? p.category : TYPES[p.type];
                if (['pool_pump','ktv_door'].includes(p.type) || !['cottage', 'event', 'pool', 'ktv'].includes(entitlement) || !includes(b, entitlement) || p.type!=='audio_playback'&&!guestAllowed(b,p.type)) throw Error('FORBIDDEN');
                if (!enabled(p.type)) throw Error('AWAITING_VERIFICATION');
                const fingerprint = JSON.stringify([user.uid, p.reference, p.type, p.value, p.category || null]);
                if (s.commands[p.requestId]) { if (s.commands[p.requestId] !== fingerprint) throw Error('REQUEST_ID_REUSED'); return { accepted: true, reused: true, ...view(s, p.reference) }; }
                if (p.type === 'audio_playback') { if (p.category === 'ktv' && !ready(s)) throw Error('HALL_NOT_READY'); manager.apply(s.audio, p.reference, p.value || {}, p.category); }
                else {
                    if (p.type.endsWith('_lights') || p.type === 'pool_pump') { if (typeof p.value !== 'boolean') throw Error('INVALID_VALUE'); }
                    else if (p.type === 'ktv_rgb') { if (!ready(s)) throw Error('HALL_NOT_READY'); if (p.value !== 'disco' && !(p.value?.mode==='disco'&&Number.isInteger(p.value.brightness)&&p.value.brightness>=0&&p.value.brightness<=255) && (!Array.isArray(p.value) || p.value.length !== 3 || p.value.some(n => !Number.isInteger(n) || n < 0 || n > 255))) throw Error('INVALID_RGB'); }
                    else if (p.type === 'ktv_door' && !['open', 'close', 'stop'].includes(p.value)) throw Error('INVALID_DOOR');
                    for(const claims of Object.values(s.adminClaims))if(p.type==='ktv_rgb'&&claims.ktv_rgb?.expiresAt>now())throw Error('RESOURCE_BUSY');
                    for (const [ref, claims] of Object.entries(s.claims)) if (ref !== p.reference && p.type.startsWith('ktv_') && claims[p.type]) throw Error('RESOURCE_BUSY');
                    s.claims[p.reference] ||= {}; s.claims[p.reference][p.type] = { value: p.value, expiresAt: now() + 2000 };
                }
                s.commands[p.requestId] = fingerprint; return { accepted: true, ...view(reconcile(root), p.reference) };
            });
        },
        async sync(p, signature) {
            if (p?.deviceId !== 'esp2' || p.simulation !== simulation || !/^[\w-]{16,100}$/.test(p.requestId || '') || !Number.isSafeInteger(p.observedAt) || now() < p.observedAt || now() - p.observedAt > 15000 || !Number.isSafeInteger(p.ackVersion) || p.ackVersion < -1 || typeof p.report !== 'string' || Buffer.byteLength(p.report) > 2048 || !/^[a-f0-9]{64}$/.test(signature || '')) throw Error('INVALID_DEVICE');
            const fingerprint = requestFields(p), expected = createHmac('sha256', devices.esp2.key).update(fingerprint).digest();
            if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw Error('INVALID_DEVICE');
            const report = JSON.parse(p.report);
            if (!report || typeof report !== 'object' || Array.isArray(report) || report.error && (typeof report.error !== 'string' || report.error.length > 100) || report.audio && (!Number.isSafeInteger(report.audio.revision) || report.audio.revision < -1 || !['playing','paused','stopped','ended'].includes(report.audio.state) || !(report.audio.trackId === null || Number.isInteger(report.audio.trackId) && report.audio.trackId >= 1 && report.audio.trackId <= 9999) || report.audio.positionMs !== undefined && (!Number.isInteger(report.audio.positionMs) || report.audio.positionMs < 0 || report.audio.positionMs > 7200000))) throw Error('INVALID_REPORT');
            for (const [id, event] of replay) if (now() - event.time > 15000) replay.delete(id);
            if (replay.has(p.requestId)) { const prior = replay.get(p.requestId); if (prior.fingerprint !== fingerprint) throw Error('REPLAY_CHANGED'); return prior.result; }
            if (replay.size >= 1000) throw Error('BUSY');
            const result = tx(root => {
                const s = initialize(root), prior = s.device;
                if(report.safety&&typeof report.safety==='object'&&!Array.isArray(report.safety))s.safetyObservation={at:now(),value:report.safety};else delete s.safetyObservation;
                if (report.hall && typeof report.hall.ready === 'boolean' && Number.isInteger(report.hall.ageMs) && report.hall.ageMs >= 0 && report.hall.ageMs < 3000) s.hall = { ready: report.hall.ready, receivedAt: now() - report.hall.ageMs };
                else s.hall = { ready: false, receivedAt: 0 };
                if ((report.audio?.state === 'ended' || report.error) && report.audio?.revision === s.audio.revision && report.audio?.trackId === s.audio.trackId) manager.stop(s.audio);
                reconcile(root);
                // A GPIO/player ack must match the issued desired payload, not just an invented version.
                const matches = prior?.issuedVersion === p.ackVersion && report.outputs && Object.entries(prior.issuedOutputs || {}).every(([k, v]) => k === 'ktv_rgb' && prior.issuedOutputs.ktv_rgb_effect === 'disco' ? Array.isArray(report.outputs[k]) && report.outputs[k].length===3 && report.outputs[k].every(n=>Number.isInteger(n)&&n>=0&&n<=Math.max(...v)) : JSON.stringify(report.outputs[k]) === JSON.stringify(v)) &&
                    report.audio?.revision === prior.issuedAudio?.revision && report.audio?.state === prior.issuedAudio?.state && (report.audio?.trackId ?? null) === (prior.issuedAudio?.trackId ?? null);
                s.device = { seenAt: now(), ackVersion: matches ? p.ackVersion : -1, report, issuedVersion: s.version, issuedOutputs: Object.fromEntries(Object.entries(s.desired).filter(([k]) => k !== 'audio')), issuedAudio: s.desired.audio };
                const response = { deviceId: 'esp2', requestId: p.requestId, version: s.version, desired: JSON.stringify({ ...s.desired, lyricWindow: lyricWindow(s.audio.trackId, report.audio?.trackId===s.audio.trackId && report.audio?.revision===s.audio.revision ? report.audio.positionMs || 0 : 0) }), serverTime: now(), validForMs: 10000, simulation };
                response.signature = createHmac('sha256', devices.esp2.key).update(responseFields(response)).digest('hex'); return response;
            });
            replay.set(p.requestId, { time: now(), fingerprint, result });
            try { return await result; } catch (error) { replay.delete(p.requestId); throw error; }
        }
    };
}
module.exports = { guestAllowed, createFacilitiesV2, requestFields, responseFields, includes, TYPES };
