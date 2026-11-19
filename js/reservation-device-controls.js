"use strict";
(function (window) {
    const config = window.SHARED_RESERVATIONS_CONFIG;
    const enabled = config?.mode === "emulator" && config.deviceSyncEnabled === true && !config.cloudTest && !config.facilitiesV2Enabled;
    async function request(path, options = {}) {
        const { user } = await window.SharedReservations.identity();
        const response = await fetch("http://" + location.hostname + ":8787" + path, {
            ...options, headers: { "Content-Type": "application/json", Authorization: "Bearer " + await user.getIdToken() },
            signal: AbortSignal.timeout(5000), cache: "no-store"
        });
        if (!response.ok) throw Error("Device request could not be verified. Retry or check your booking.");
        const result = await response.json();
        if (options.method === "POST" && result.accepted !== true) throw Error("Save unconfirmed. Retry the same request.");
        return result;
    }
    function mount(container) {
        if (!enabled || !container || container.querySelector('[data-cottage-controls]')) return;
        const panel = document.createElement("section");
        panel.className = "guest-facility-card booking-card";
        panel.dataset.cottageControls = "";
        panel.innerHTML = '<h2>Cottage lighting</h2><p>All four cottage groups share one relay. Shared lighting may remain on for another checked-in booking.</p><p data-feedback role="status" aria-live="polite">Verifying controller…</p><button type="button" class="guest-facility-button" data-on="true">COTTAGES ON</button> <button type="button" class="guest-facility-button" data-on="false">COTTAGES OFF</button>';
        container.appendChild(panel);
        let busy = false, generation = 0, retry = null, failed = false;
        const buttons = panel.querySelectorAll("button");
        function allowed() { return window.GuestAccess?.accessFor("cottage"); }
        function lock() { const access = allowed(); buttons.forEach(button => { button.disabled = busy || !access?.allowed; }); }
        async function refresh() {
            const version = ++generation, access = allowed(); lock();
            if (!access?.allowed) { panel.querySelector('[data-feedback]').textContent = access?.reason || "Facility access is locked."; return; }
            if (busy || failed) return;
            try {
                const state = (await request('/guest/device-state?reference=' + encodeURIComponent(access.reservation.reference))).esp2;
                if (version !== generation || !panel.isConnected || busy || failed) return;
                panel.querySelector('[data-feedback]').textContent = state.state + '. Desired ' + (state.desired ? 'ON' : 'OFF') + '. Controller-reported output ' + (state.actual === null ? 'Unknown' : state.actual ? 'ON' : 'OFF') + '.';
            } catch { if (version === generation) panel.querySelector('[data-feedback]').textContent = "Controller state unavailable. Output Unknown."; }
        }
        panel.addEventListener('click', async event => {
            const button = event.target.closest('button[data-on]');
            if (!button || busy || !allowed()?.allowed) return;
            const reference = allowed().reservation.reference, on = button.dataset.on === 'true';
            if (!retry || retry.reference !== reference || retry.on !== on) retry = { reference, on, requestId: 'cottage_' + Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('') };
            const operation = retry;
            failed = false; busy = true; ++generation; lock(); panel.querySelector('[data-feedback]').textContent = "Command requested…";
            let saved = false;
            try { await request('/guest/cottages', { method: 'POST', body: JSON.stringify(operation) }); if (retry === operation) retry = null; saved = true; }
            catch (error) { if (allowed()?.reservation?.reference !== reference) return; failed = true; panel.querySelector('[data-feedback]').textContent = error.message; }
            finally { busy = false; lock(); if (saved) await refresh(); }
        });
        const stop = window.GuestAccess.subscribe(() => {
            if (retry && retry.reference !== allowed()?.reservation?.reference) { retry = null; failed = false; }
            refresh();
        });
        const timer = setInterval(() => { if (!panel.isConnected) { clearInterval(timer); stop(); return; } refresh(); }, 2500);
        window.addEventListener('pagehide', () => { clearInterval(timer); stop(); }, { once: true });
    }
    window.ReservationDeviceControls = { enabled, mount };
    document.addEventListener('DOMContentLoaded', () => {
        const dashboard = document.querySelector('#controlsSection');
        if (dashboard) mount(dashboard);
    });
})(window);
