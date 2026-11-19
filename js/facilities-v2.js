'use strict';
(function () {
    if (!window.SHARED_RESERVATIONS_CONFIG?.facilitiesV2Enabled || window.SHARED_RESERVATIONS_CONFIG.mode !== 'emulator' || window.SHARED_RESERVATIONS_CONFIG.cloudTest) return;
    const Access = window.GuestAccess;
    const name = location.pathname.split('/').pop();
    const pageKind = ['cottage.html','event.html','pool.html','ktv.html'].includes(name) ? name.slice(0,-5) : null;
    const target = document.querySelector('.dashboard-main') || document.querySelector('main');
    if (!Access || !target) return;
    const panel = document.createElement('section'); panel.className = 'booking-card facilities-v2'; panel.hidden = true;
    panel.innerHTML = '<h2>My Facility Controls</h2><p data-mode></p><p data-system role="status"></p><div data-controls></div><p data-feedback role="status" aria-live="polite"></p>';
    target.appendChild(panel);
    const notice = document.querySelector('.read-only-notice p');
    if (notice) notice.textContent = 'The controls below show verified requests and reported state. Simulation is labeled explicitly; uncommissioned physical controls remain disabled.';
    let receivedAt = 0;
    let knownUid;
    let reference, epoch = 0, busy = false, retry, state, timer, renewAt = 0;
    const controls = panel.querySelector('[data-controls]');
    const eligible = kind => !Access.state.admin && Access.accessFor(kind).allowed && (!pageKind || kind===pageKind || pageKind==='event' && kind==='pool');
    function element(tag, text, parent) { const e = document.createElement(tag); if (text) e.textContent = text; parent?.appendChild(e); return e; }
    async function request(path, body) {
        const { user } = await window.SharedReservations.identity();
        const response = await fetch('http://' + location.hostname + ':8787' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000), cache: 'no-store' });
        const result = await response.json(); if (!response.ok || body && result.accepted !== true) throw Error(result.error || 'Save unconfirmed. Retry.'); return result;
    }
    function button(parent, label, type, value) { const b = element('button', label, parent); b.type = 'button'; b.disabled = true; b.className = 'booking-button'; b.dataset.type = type; b.dataset.value = JSON.stringify(value); return b; }
    const stageEligible = () => (Access.state.reservation?.facilities||[]).some(f=>f.value==='buyout'||f.value==='event'&&f.packageVersion===2);
    function rgbCard(kind,title,type) {
        const card=element('section',null,controls);card.dataset.rgbCard=type;element('h3',title,card);
        element('p',type==='ktv_rgb'?'Planned KTV driver; simulation is labeled.':'Preview only: independent output resource is unassigned. No command can be sent.',card);
        let l=element('label','Color',card),c=element('input',null,l);c.type='color';c.value='#ffffff';c.dataset.color='';
        l=element('label','Brightness (%)',card);c=element('input',null,l);c.type='range';c.min='0';c.max='100';c.value='50';c.dataset.brightness='';c.setAttribute('aria-label',title+' brightness');
        l=element('label','Effect',card);const select=element('select',null,l);select.dataset.effect='';for(const mode of ['solid','disco','off']){const o=element('option',mode,select);o.value=mode;}
        const apply=button(card,'Apply color',type,'draft');apply.dataset.rgbApply='';element('p','Reported RGB: Unknown',card).dataset.rgbReport=type;
    }
    function build() {
        controls.replaceChildren();
        const mapping = [['cottage', 'Cottage lighting — all four groups', 'cottage_lights'], ['event', 'Event Hall Lighting', 'event_lights'], ['event', 'Stage Lighting', 'stage_lights']];
        for (const [kind, title, type] of mapping) if (eligible(kind) && (type!=='stage_lights' || stageEligible())) { const card = element('section', null, controls); element('h3', title, card); element('p', 'Awaiting Verification', card).dataset.stateFor = type; button(card, 'ON', type, true); button(card, 'OFF', type, false); }
        if (eligible('pool')) rgbCard('pool','Swimming Pool RGB','pool_rgb');
        if (eligible('event')&&stageEligible()) rgbCard('event','Stage RGB','stage_rgb');
        if (eligible('ktv')) {
            const card = element('section', null, controls); element('h3', 'KTV Karaoke readiness', card); element('p', 'Door/Hall: Unknown — magnetic state, not occupancy', card).dataset.hall = '';
            element('p','Door movement is controlled by authorized staff only. TFT follows the device-selected song and playback state.',card);
            rgbCard('ktv','KTV RGB','ktv_rgb');
        }
        if (eligible('ktv') || eligible('event')) {
            const card = element('section', null, controls); element('h3', 'Song library — shared audio player', card);
            const searchLabel = element('label', 'Search title or artist', card), search = element('input', null, searchLabel); search.type = 'search'; search.dataset.search = '';
            const label = element('label', 'Select a track', card), select = element('select', null, label); select.dataset.songs = ''; select.setAttribute('aria-label', 'Song library');
            element('p', 'No device playback confirmed', card).dataset.player = '';
            for (const action of ['play', 'pause', 'resume', 'previous', 'next', 'stop']) button(card, action[0].toUpperCase() + action.slice(1), 'audio_playback', { action });
            const volumeLabel = element('label', 'Volume (DFPlayer 0–30)', card), volume = element('input', null, volumeLabel); volume.type = 'range'; volume.min = '0'; volume.max = '30'; volume.value = '15'; volume.dataset.volume = '';
            element('p', '', card).dataset.lyrics = ''; search.addEventListener('input', () => { songs(); update(); }); select.addEventListener('change', update);
        }
    }
    function songs() {
        const select = controls.querySelector('[data-songs]'); if (!select || !state) return;
        const prior = select.value, search = controls.querySelector('[data-search]').value.toLocaleLowerCase(); select.replaceChildren();
        for (const t of state.catalog.tracks) if (['ktv', 'event'].includes(t.category) && eligible(t.category) && (String(t.title || '') + ' ' + (t.artist || '')).toLocaleLowerCase().includes(search)) {
            const o = element('option', (t.title || 'Untitled track ' + String(t.id).padStart(4, '0')) + (t.artist ? ' — ' + t.artist : '') + (!t.verified ? ' — Unverified / unavailable' : ''), select); o.value = t.id; o.disabled = !t.verified;
        }
        if ([...select.options].some(o => o.value === prior && !o.disabled)) select.value = prior;
        else select.selectedIndex = [...select.options].findIndex(o => !o.disabled);
    }
    function update() {
        if (!state) return;
        panel.querySelector('[data-mode]').textContent = state.simulation ? 'Simulation only — no physical device operation' : 'Physical controls await commissioning';
        panel.querySelector('[data-system]').textContent = 'ESP32 #2: ' + state.device.state + '. ESP32 #1 pathway status remains in the existing reservation device monitor.';
        for (const line of controls.querySelectorAll('[data-state-for]')) { const key = line.dataset.stateFor; line.textContent = state.capabilities[key] + ' · Requested ' + (state.desired[key] ? 'ON' : 'OFF') + ' · Reported ' + (state.device.report?.outputs?.[key] === undefined ? 'Unknown' : state.device.report.outputs[key] ? 'ON' : 'OFF'); }
        const hall = controls.querySelector('[data-hall]'); if (hall) hall.textContent = 'Door/Hall: ' + (state.hallReady ? 'Fresh readiness confirmed' : 'Unknown / not ready');
        const rgb = controls.querySelector('[data-rgb]');if(rgb)rgb.textContent='RGB requested '+(state.desired.ktv_rgb_effect||'off')+' | Reported '+(state.device.report?.outputs?.ktv_rgb?.join(', ')||'Unknown');
        const player = controls.querySelector('[data-player]'); if (player) {
            const reported = state.device.report?.audio, track = state.catalog.tracks.find(t => t.id === reported?.trackId);
            player.textContent = !state.catalog.tracks.some(t=>t.verified && ['ktv','event'].includes(t.category) && eligible(t.category)) ? 'No verified SD tracks available. Verify the catalog before playback.' : reported && state.device.acknowledged ? 'Device ' + (state.simulation ? 'simulation ' : '') + reported.state + ': ' + (track?.title || 'No track') : 'Requested ' + state.audio.state + '; device playback unconfirmed';
        }
        for (const b of controls.querySelectorAll('button')) {
            b.disabled = busy || state.capabilities[b.dataset.type] !== 'Simulation';
            if (b.dataset.type === 'ktv_rgb' && !state.hallReady) b.disabled = true;
            if (b.dataset.type === 'audio_playback') {
                const action = JSON.parse(b.dataset.value).action, id = Number(controls.querySelector('[data-songs]')?.value);
                const track = state.catalog.tracks.find(t => t.id === id && t.verified);
                if (action === 'play' ? !track || track.category === 'ktv' && !state.hallReady : state.audio.owner !== reference) b.disabled = true;
            }
        }
        for(const card of controls.querySelectorAll('[data-rgb-card]')){const type=card.dataset.rgbCard;card.querySelectorAll('input,select').forEach(e=>e.disabled=busy||!state.simulation);card.querySelector('[data-rgb-report]').textContent=(state.capabilities[type]||'Awaiting Verification')+' | Requested '+(type==='ktv_rgb'?state.desired.ktv_rgb_effect:'Unavailable')+' | Reported '+(type==='ktv_rgb'?state.device.report?.outputs?.ktv_rgb?.join(', ')||'Unknown':'Unknown - driver unassigned');}
        const volume = controls.querySelector('[data-volume]'); if (volume) volume.disabled = busy || state.capabilities.audio_playback !== 'Simulation' || state.audio.owner !== reference;
    }
    async function refresh() {
        const current = epoch, ref = reference;
        if (!ref || busy || !['cottage','event','pool','ktv'].some(eligible)) return;
        try { const next = await request('/guest/facilities/v2/state?reference=' + encodeURIComponent(ref)); if (current !== epoch) return; state = next; receivedAt = Date.now(); songs(); update();
            if (state.audio.owner === ref && Date.now() - renewAt > 10000 && state.audio.state !== 'stopped') { renewAt = Date.now(); await send('audio_playback', { action: 'renew' }, state.audio.category); }
        } catch (e) { if (current === epoch) { state = null; panel.querySelector('[data-system]').textContent = 'State unavailable. Controls locked.'; controls.querySelectorAll('button,input[type=range]').forEach(b => b.disabled = true); } }
    }
    async function send(type, value, category) {
        if (busy || !reference) return;
        const current = epoch;
        const body = { reference, type, value, ...(category ? { category } : {}) };
        const fingerprint = JSON.stringify(body);
        if (!retry || retry.fingerprint !== fingerprint) retry = { fingerprint, body: { ...body, requestId: 'facility_' + Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('') } };
        const attempt = retry; busy = true; update(); panel.querySelector('[data-feedback]').textContent = 'Request pending…';
        try { const result = await request('/guest/facilities/v2/command', attempt.body); if (current !== epoch) return; state = result; retry = null; panel.querySelector('[data-feedback]').textContent = 'Request accepted. Waiting for device acknowledgement.'; }
        catch (e) { if (current === epoch) panel.querySelector('[data-feedback]').textContent = e.message + '. Retry preserves the request identity.'; }
        finally { busy = false; if (current === epoch) update(); }
    }
    panel.addEventListener('click', event => {
        const b = event.target.closest('button[data-type]'); if (!b || b.disabled) return;
        const type = b.dataset.type; let value = JSON.parse(b.dataset.value), category;
        if(b.hasAttribute('data-rgb-apply')){const card=b.closest('[data-rgb-card]'),hex=card.querySelector('[data-color]').value,level=Number(card.querySelector('[data-brightness]').value)/100,mode=card.querySelector('[data-effect]').value;value=mode==='disco'?{mode:'disco',brightness:Math.round(level*255)}:mode==='off'?[0,0,0]:[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*level));}
        if (type === 'audio_playback') { const id = Number(controls.querySelector('[data-songs]').value), t = state.catalog.tracks.find(t => t.id === id && t.verified); if (value.action === 'play' && !t) { panel.querySelector('[data-feedback]').textContent = 'No verified song available.'; return; } category = value.action === 'play' ? t.category : state.audio.category; if (value.action === 'play') { value.trackId = id; value.queue = state.catalog.tracks.filter(x => x.verified && x.category === category).map(x => x.id); } }
        send(type, value, category);
    });
    controls.addEventListener('change', e => { if (e.target.matches('[data-volume]') && state?.audio.owner === reference) send('audio_playback', { action: 'volume', volume: Number(e.target.value) }, state.audio.category); });
    const off = Access.subscribe(snapshot => {
        const ref = Access.state.reservation?.reference;
        const allowed = (!pageKind || Access.accessFor(pageKind).allowed) && ['cottage', 'event', 'pool', 'ktv'].some(eligible);
        let currentUid;try{currentUid=window.firebase?.app('shared-reservations').auth().currentUser?.uid;}catch{}
        if (!allowed && snapshot?.loading && reference && knownUid && currentUid===knownUid && new URL(location.href).searchParams.get('reservation')===reference) {
            ++epoch; controls.querySelectorAll('button,input[type=range]').forEach(b=>b.disabled=true);panel.querySelector('[data-system]').textContent='Verifying your booking. Controls locked.';return;
        }
        if (!allowed) { ++epoch; reference = null; state = null; retry = null; controls.replaceChildren(); panel.hidden = true; return; }
        if (ref !== reference) { ++epoch; reference = ref; knownUid = Access.state.reservation?.ownerUid; state = null; retry = null; build(); }
        panel.hidden = false; refresh();
    });
    const lyricTimer = setInterval(() => {
        const el = controls.querySelector('[data-lyrics]'), audio = state?.device.report?.audio;
        if (!el) return;
        if (!['ktv','event'].some(eligible) || !state?.device.acknowledged || !audio || Date.now() - receivedAt > 3500 || !['playing','paused'].includes(audio.state)) { el.textContent = ''; return; }
        const position = (audio.positionMs || 0) + (audio.state === 'playing' ? Date.now() - receivedAt : 0) + (state.lyricWindow?.offsetMs || 0);
        el.textContent = (state.lyricWindow?.cues || []).filter(c => c.at <= position).at(-1)?.text || state.lyricWindow?.status || 'Missing lyrics';
    }, 100);
    timer = setInterval(refresh, 2500);
    window.addEventListener('pagehide', () => { ++epoch; clearInterval(timer); clearInterval(lyricTimer); off(); panel.remove(); }, { once: true });
})();
