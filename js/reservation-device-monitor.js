"use strict";
document.addEventListener('DOMContentLoaded', () => {
    const config = window.SHARED_RESERVATIONS_CONFIG;
    if (config?.mode !== 'emulator' || !config.deviceSyncEnabled) return;
    const parent = document.querySelector('#adminContent');
    if (!parent) return;
    const card = document.createElement('section'); card.className = 'device-card';
    card.innerHTML = '<h2>Reservation device synchronization</h2><p data-sync-report role="status">Verifying controllers…</p>';
    parent.appendChild(card);
    let active = true;
    async function refresh() {
        try {
            const { user } = await SharedReservations.identity(true);
            const response = await fetch('http://' + location.hostname + ':8787/admin/device-state', {
                headers: { Authorization: 'Bearer ' + await user.getIdToken() }, signal: AbortSignal.timeout(5000), cache: 'no-store'
            });
            if (!response.ok) throw Error();
            const state = await response.json();
            if (!active) return;
            card.querySelector('p').textContent = ['esp1', 'esp2'].map(id => {
                const value = state[id];
                return id.toUpperCase() + ' ' + value.state + ' · desired ' + (value.desired ? 'ON' : 'OFF') + ' · reported ' + (value.actual === null ? 'Unknown' : value.actual ? 'ON' : 'OFF') + ' · last sync ' + (value.lastSyncAt ? new Date(value.lastSyncAt).toLocaleString() : 'Unknown');
            }).join(' | ');
            if (config.facilitiesV2Enabled) {
                const v2response = await fetch('http://' + location.hostname + ':8787/admin/facilities/v2/state', {headers:{Authorization:'Bearer '+await user.getIdToken()},signal:AbortSignal.timeout(5000),cache:'no-store'});
                if (!v2response.ok) throw Error();
                const v2 = await v2response.json(); if(!active)return;
                card.querySelector('p').textContent += ' | Facilities v2 ' + (v2.simulation ? 'SIMULATION' : 'Awaiting Verification') + ': ' + v2.device.state + ' | requested outputs ' + JSON.stringify(v2.desired) + ' | reported ' + JSON.stringify(v2.device.report);
            }
        } catch { if (active) card.querySelector('p').textContent = 'Device synchronization unavailable or administrator session expired.'; }
    }
    refresh(); const timer = setInterval(refresh, 3000);
    window.addEventListener('pagehide', () => { active = false; clearInterval(timer); }, { once: true });
});
