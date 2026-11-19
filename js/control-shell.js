"use strict";

/* =========================================================
   CATHERINE'S CONTROL SHELL
   Shared sidebar, top bar, toast, access rules and
   reservation helpers for the facility control pages:
   KTV, Pool, Cottage, Event, Check-in, Check-out,
   Manual Override.
========================================================= */

(function (window) {

    const GUEST_NAV = [
        { href: "guest-dashboard.html", icon: "fa-solid fa-gauge-high", label: "Dashboard" },
        { href: "my-reservation.html", icon: "fa-regular fa-calendar-check", label: "My Reservation" },
        { href: "check-in.html", icon: "fa-solid fa-id-card", label: "Check-in", page: "check-in" },
        { href: "cottage.html", icon: "fa-solid fa-house-chimney", label: "My Cottage", page: "cottage" },
        { href: "pool.html", icon: "fa-solid fa-water-ladder", label: "Pool Lighting", page: "pool" },
        { href: "event.html", icon: "fa-solid fa-champagne-glasses", label: "Event Mode", page: "event" },
        { href: "ktv.html", icon: "fa-solid fa-microphone-lines", label: "Lighthouse KTV", page: "ktv" },
        { href: "checkout.html", icon: "fa-solid fa-door-open", label: "Check-out", page: "checkout" }
    ];

    const ADMIN_NAV = [
        { href: "admin-dashboard.html", icon: "fa-solid fa-sliders", label: "Operational Center" },
        { href: "admin-reservations.html", icon: "fa-regular fa-calendar-days", label: "Master Reservations" },
        { href: "diorama-control.html", icon: "fa-solid fa-gamepad", label: "Diorama Overrides", page: "manual-override" },
        { href: "check-in.html", icon: "fa-solid fa-id-card", label: "Check-in Desk", page: "check-in" },
        { href: "cottage.html", icon: "fa-solid fa-house-chimney", label: "Cottages", page: "cottage" },
        { href: "pool.html", icon: "fa-solid fa-water-ladder", label: "Pool & Bridge", page: "pool" },
        { href: "event.html", icon: "fa-solid fa-champagne-glasses", label: "Event Place", page: "event" },
        { href: "ktv.html", icon: "fa-solid fa-microphone-lines", label: "Lighthouse KTV", page: "ktv" },
        { href: "checkout.html", icon: "fa-solid fa-door-open", label: "Check-out Desk", page: "checkout" },
        { href: "admin-dashboard.html#sensors", icon: "fa-solid fa-satellite-dish", label: "Sensors" }
    ];

    /* -----------------------------------------------------
       SESSION & RESERVATION HELPERS
    ----------------------------------------------------- */

    let facilityAdmin = false;
    function role() {
        if (window.GuestAccess && facilityAdmin) return "admin";
        if (window.GuestAccess) return window.GuestAccess.state.user ? (window.GuestAccess.state.admin ? "admin" : "guest") : null;
        if (localStorage.getItem("isLoggedIn") !== "true") return null;
        return localStorage.getItem("userRole") === "admin" ? "admin" : "guest";
    }

    function isAdmin() {
        return role() === "admin";
    }

    function currentReservation() {
        if (window.GuestAccess) return window.GuestAccess.state.reservation;
        let res = null;
        try {
            res = JSON.parse(localStorage.getItem("currentReservation") || "null");
        } catch (e) { res = null; }

        if (res && res.reference && window.ResortDB) {
            const fresh = window.ResortDB.findReservationByCode(res.reference);
            if (fresh) res = fresh;
        }
        return res;
    }

    function facilityNames(res) {
        return (res && Array.isArray(res.facilities) ? res.facilities : [])
            .map(f => String((f && (f.name || f.value)) || f || "").toLowerCase());
    }

    function hasFacility(res, kind) {
        if (window.GuestAccess) return window.GuestAccess.includes(res, kind);
        const names = facilityNames(res);
        if (names.some(n => n.includes("buyout"))) return true;
        const match = {
            cottage: n => n.includes("cottage"),
            pool: n => n.includes("pool") || n.includes("bridge"),
            ktv: n => n.includes("ktv"),
            event: n => n.includes("event") || n.includes("pavilion") || n.includes("celebration")
        }[kind];
        return match ? names.some(match) : false;
    }

    /* Cottage number written in the facility name, e.g. "Cottage 2 Oceanfront" */
    function cottageFromReservation(res) {
        for (const n of facilityNames(res)) {
            const m = n.match(/cottage\s*#?\s*(\d)/);
            if (m) {
                const num = Number(m[1]);
                if (num >= 1 && num <= 4) return num;
            }
        }
        return 0;
    }

    function isCheckedIn(res) {
        if (!res) return false;
        const st = String(res.status || "").toLowerCase();
        return st === "checked in";
    }

    /*
       Access rule:
         Admin  -> always allowed.
         Guest  -> must be checked in AND have reserved the facility.
    */
    function accessFor(kind) {
        if (window.GuestAccess) {
            if (facilityAdmin) return { allowed: true, admin: true };
            return window.GuestAccess.accessFor(kind);
        }
        if (isAdmin()) return { allowed: true, admin: true };

        const r = role();
        if (!r) {
            return { allowed: false, reason: "Please sign in to use this control.", action: "login" };
        }

        const res = currentReservation();
        if (!res) {
            return { allowed: false, reason: "You don't have a reservation yet.", action: "reserve" };
        }

        if (!hasFacility(res, kind)) {
            const labels = { cottage: "a Cottage", pool: "the Swimming Pool", ktv: "the Lighthouse KTV", event: "the Event Place" };
            return {
                allowed: false,
                reason: `Your reservation #${res.reference} does not include ${labels[kind] || "this facility"}.`,
                action: "reserve"
            };
        }

        if (!isCheckedIn(res)) {
            return {
                allowed: false,
                reason: `Tap your NFC card at the entrance to check in first (reservation #${res.reference}).`,
                action: "checkin"
            };
        }

        return { allowed: true, reservation: res };
    }

    /* -----------------------------------------------------
       UI
    ----------------------------------------------------- */

    function escapeHtml(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderSidebar(activePage) {
        const container = document.getElementById("controlSidebar");
        if (!container) return;

        const admin = isAdmin();
        const nav = admin ? ADMIN_NAV : GUEST_NAV;

        container.innerHTML = `
            <aside class="cs-sidebar" id="csSidebar">
                <a href="index.html" class="cs-brand">
                    <img src="assets/Catherine's Logo.png" alt="Catherine's Logo">
                    <div>
                        <strong>Catherine’s</strong>
                        <span>${admin ? "LIGHTHOUSE COMMAND" : "GUEST PORTAL"}</span>
                    </div>
                </a>

                <div class="cs-hw" id="csHardware">
                    <span class="cs-dot"></span>
                    <div>
                        <strong id="csHwTitle">Connecting…</strong>
                        <span id="csHwSub">ESP 1 · ESP 2</span>
                    </div>
                </div>

                <div class="cs-label">${admin ? "OWNER CONTROLS" : "MY STAY"}</div>

                <nav class="cs-nav">
                    ${nav.map(item => `
                        <a href="${item.href}" class="cs-nav-item ${item.page === activePage ? "active" : ""}" id="nav-${item.href.replace(".html", "")}">
                            <i class="${item.icon}"></i>
                            <span>${item.label}</span>
                        </a>
                    `).join("")}
                </nav>

                <div class="cs-footer">
                    <a href="index.html" class="cs-site"><i class="fa-solid fa-globe"></i> Visitor Site</a>
                    ${role()
                        ? `<button type="button" class="cs-logout" id="csLogout" aria-label="Log out"><i class="fa-solid fa-right-from-bracket"></i></button>`
                        : `<a href="login.html" class="cs-logout" id="csLogin" aria-label="Sign in"><i class="fa-solid fa-right-to-bracket"></i></a>`}
                </div>
            </aside>
            <button type="button" class="cs-menu" id="csMenu" aria-label="Open menu"><i class="fa-solid fa-bars"></i></button>
        `;

        const logout = document.getElementById("csLogout");
        if (logout) {
            logout.addEventListener("click", async () => {
                if (!window.confirm("Are you sure you want to log out?")) return;
                if (window.GuestAccess) {
                    try { await window.SharedReservations.signOut(); } catch { toast("Could not sign out. Please retry."); return; }
                }
                if (window.ResortDB) window.ResortDB.clearSession();
                localStorage.removeItem("currentReservation");
                window.location.href = "index.html";
            });
        }

        document.getElementById("csMenu").addEventListener("click", () => {
            document.getElementById("csSidebar").classList.toggle("open");
        });
    }

    function updateHardwarePill() {
        const link = window.DioramaLink;
        const title = document.getElementById("csHwTitle");
        const sub = document.getElementById("csHwSub");
        const box = document.getElementById("csHardware");
        const top = document.getElementById("csConnection");
        if (!link) return;

        const e1 = link.isDeviceOnline("esp1");
        const e2 = link.isDeviceOnline("esp2");

        let label, cls;
        if (link.mode === "simulation") {
            label = "Simulation Mode";
            cls = "sim";
        } else if (e1 && e2) {
            label = "Diorama Online";
            cls = "online";
        } else if (e1 || e2) {
            label = "Partially Online";
            cls = "partial";
        } else {
            label = "ESP32 Offline";
            cls = "offline";
        }

        if (title) title.textContent = label;
        if (sub) sub.textContent = `ESP 1 ${e1 ? "●" : "○"}  ·  ESP 2 ${e2 ? "●" : "○"}`;
        if (box) box.dataset.state = cls;
        if (top) {
            top.dataset.state = cls;
            top.innerHTML = `<i></i>${link.mode === "firebase" ? "Firebase" : "Simulation"} · ${label}`;
            top.title = link.mode === "simulation"
                ? "Firebase is not configured (js/firebase-config.js). Commands are simulated in this browser only."
                : "Connected to Firebase Realtime Database.";
        }
    }

    function toast(message, type = "info") {
        let el = document.querySelector(".cs-toast");
        if (!el) {
            el = document.createElement("div");
            el.className = "cs-toast";
            el.setAttribute("role", "status");
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.dataset.type = type;
        el.classList.add("show");
        clearTimeout(el.hideTimer);
        el.hideTimer = setTimeout(() => el.classList.remove("show"), 2600);
    }

    function renderLocked(container, access) {
        if (document.body.classList.contains("guest-facility-page")) {
            const page = guestCloudTest() ? "my-reservation.html" : "guest-dashboard.html";
            container.innerHTML = '<section class="guest-facility-card cs-locked"><h2>Facility access is locked</h2><p>'+escapeHtml(access.reason)+'</p><a class="guest-facility-button" href="'+guestBookingUrl(page)+'">'+(guestCloudTest()?"Back to My Reservation":"Back to Guest Dashboard")+'</a></section>';
            return;
        }
        const actions = {
            login: `<a class="cs-btn primary" href="login.html" id="lockedLogin"><i class="fa-solid fa-right-to-bracket"></i> Sign in</a>`,
            reserve: `<a class="cs-btn primary" href="reservation.html" id="lockedReserve"><i class="fa-regular fa-calendar-plus"></i> Make a reservation</a>`,
            checkin: `<a class="cs-btn primary" href="check-in.html" id="lockedCheckin"><i class="fa-solid fa-id-card"></i> Go to Check-in</a>`
        };
        container.innerHTML = `
            <section class="cs-locked">
                <div class="cs-locked-icon"><i class="fa-solid fa-lock"></i></div>
                <h2>Control locked</h2>
                <p>${escapeHtml(access.reason)}</p>
                ${actions[access.action] || ""}
            </section>
        `;
    }

    function timeAgo(ts) {
        if (!ts) return "—";
        const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
        if (s < 60) return `${s}s ago`;
        if (s < 3600) return `${Math.round(s / 60)}m ago`;
        return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }

    function init(activePage) {
        renderSidebar(activePage);
        if (window.DioramaLink) {
            window.DioramaLink.ready.then(updateHardwarePill);
            window.DioramaLink.on("status", updateHardwarePill);
            setInterval(updateHardwarePill, 3000);
        }
    }

    // Guest pages have no device connector and never register the legacy device
    // handlers. Administrators retain the separate legacy workflow after trusted
    // named-app role verification; browser-local role hints cannot select it.
﻿    const FACILITY_LABELS = { pool: "Swimming Pool", event: "Event Place", cottage: "Cottage", ktv: "KTV" };
    function selectedGuestReference() {
        return window.GuestAccess?.state.reservation?.reference || new URL(location.href).searchParams.get("reservation");
    }
    function guestBookingUrl(page) {
        const reference = selectedGuestReference();
        return page + (/^CBLR-[0-9]{6}$/.test(reference || "") ? "?reservation=" + encodeURIComponent(reference) : "");
    }
    function guestCloudTest() {
        return window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true || (["localhost", "127.0.0.1"].includes(location.hostname) && location.port === "5001");
    }
    async function prepareGuestFacilityLayout(kind) {
        document.body.classList.add("guest-facility-page", "guest-public-page");
        for (const href of ["css/public-header.css", "css/guest-facilities.css"]) {
            await new Promise((resolve, reject) => { const style = document.createElement("link"); style.rel = "stylesheet"; style.href = href; style.onload = resolve; style.onerror = reject; document.head.appendChild(style); });
        }
        document.getElementById("controlSidebar").innerHTML = '<header data-public-header id="top"><a href="index.html">Catherine’s</a></header>';
        await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "js/public-header.js"; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
        const top = document.querySelector(".cs-topbar");
        top.className = "guest-facility-heading";
        const photos = {
            pool: ['pool.png', 'Catherine’s swimming pool and arched bridge'],
            event: ['pavilion.png', 'Catherine’s pavilion venue beside the illuminated pool'],
            cottage: ['cottage.png', 'Catherine’s cottages and landscaped resort grounds at night']
        };
        const photo = photos[kind];
        top.classList.toggle('has-facility-photo', Boolean(photo));
        top.innerHTML = '<div class="guest-facility-heading-details"><p class="guest-eyebrow">CATHERINE’S · BAGASBAS BEACH</p><h1>'+FACILITY_LABELS[kind]+'</h1><p id="guestFacilityBooking"></p><p id="guestFacilityStatus" class="guest-status"></p><p>Read-only preview. Facility controls are unavailable.</p></div>'
            + (photo ? '<img class="guest-facility-header-photo" src="assets/'+photo[0]+'" alt="'+escapeHtml(photo[1])+'">' : '');
        const navigation = document.createElement("div"); navigation.className = "guest-facility-navigation";
        navigation.innerHTML = '<nav class="guest-return-links" aria-label="Booking navigation"><a id="facilityBackDashboard">Back to Guest Dashboard</a><a id="facilityBackReservation">Back to My Reservation</a></nav><nav id="guestFacilityNav" aria-label="Your eligible facilities"></nav>';
        top.before(navigation);
        navigation.addEventListener("click", event => {
            const link = event.target.closest("[data-facility]");
            if (!link) return;
            if (!window.GuestAccess.accessFor(link.dataset.facility).allowed) { event.preventDefault(); renderGuestFacility(kind, document.getElementById("pageContent")); }
            else link.href = window.GuestAccess.facilityUrl(link.dataset.facility);
        });
        document.body.classList.remove("facility-pending");
    }
    function renderGuestFacility(kind, content) {
        const Access = window.GuestAccess, access = Access.accessFor(kind), record = Access.state.reservation;
        const reference = selectedGuestReference(), suffix = /^CBLR-[0-9]{6}$/.test(reference || "") ? "?reservation="+encodeURIComponent(reference) : "";
        document.getElementById("facilityBackDashboard").href = "guest-dashboard.html"+suffix;
        document.getElementById("facilityBackDashboard").hidden = guestCloudTest();
        document.getElementById("facilityBackReservation").href = "my-reservation.html"+suffix;
        for (const link of document.querySelectorAll('.public-header a')) if (new URL(link.href).pathname.endsWith('/my-reservation.html')) link.href = "my-reservation.html"+suffix;
        document.getElementById("guestFacilityBooking").textContent = record ? "Booking " + record.reference : "No verified booking";
        document.getElementById("guestFacilityStatus").textContent = record?.status || (Access.state.loading ? "Verifying booking" : "Unknown");
        const nav = document.getElementById("guestFacilityNav"); nav.replaceChildren();
        document.querySelector(".guest-facility-heading h1").textContent = kind === "event" && record?.facilities.some(item=>item.value === "event" && item.packageVersion === 2) ? "Event Place with Stage Band" : FACILITY_LABELS[kind];
        for (const facility of ["pool", "event", "cottage", "ktv"]) {
            if (!Access.accessFor(facility).allowed) continue;
            const link = document.createElement("a"); link.dataset.facility = facility; link.href = Access.facilityUrl(facility);
            const bundle = record.facilities.some(item => item.value === "event" && item.packageVersion === 2);
            link.textContent = facility === "event" && bundle ? "Event Place with Stage Band" : FACILITY_LABELS[facility];
            if (facility === kind) link.setAttribute("aria-current", "page");
            nav.appendChild(link);
        }
        content.dataset.eligible = String(access.allowed);
        if (!access.allowed) {
            if (kind === "ktv") window.KtvPreview?.unmount();
            let reason = Access.state.loading ? "Checking your selected booking. Facility access is locked while verification is in progress." : record?.status === "Confirmed" ? "Your booking is confirmed. Facility access stays locked until check-in is saved." : record?.status === "Pending Verification" ? "Your booking is waiting for approval. Facility access is locked." : record && record.status === "Checked In" ? "This facility is not included in your selected booking." : "Your booking could not be verified for this facility. Return to My Reservation to sign in or select your booking.";
            content.innerHTML = '<section class="guest-facility-card cs-locked"><h2>Facility access is locked</h2><p>'+escapeHtml(reason)+'</p><a class="guest-facility-button" href="'+guestBookingUrl(guestCloudTest()?"my-reservation.html":"guest-dashboard.html")+'">'+(guestCloudTest()?"Back to My Reservation":"Back to Guest Dashboard")+'</a></section>';
            return;
        }
        if (kind === "cottage" && window.ReservationDeviceControls?.enabled && content.querySelector("[data-cottage-controls]")) return;
        if (kind === "ktv" && content.querySelector("#karaokePreview")) return;
        const state = (label, value) => '<div><dt>'+label+'</dt><dd>'+value+'</dd></div>';
        if (kind === "pool") {
            content.innerHTML = '<section class="guest-facility-card"><span class="guest-preview-label">Preview</span><h2>Pool RGB lighting</h2><p>Pool RGB lighting is unavailable in this read-only preview.</p><dl class="guest-device-states">'+state("RGB lighting", "Unavailable")+'</dl></section>';
        } else if (kind === "event") {
            content.innerHTML = '<section class="guest-facility-card"><span class="guest-preview-label">Preview</span><h2>Event Mode</h2><p>Preview of a coordinated Event experience. Controls and live device readings are unavailable.</p><dl class="guest-device-states">'+state("Pavilion lights", "Unknown")+state("Stage RGB", "Unavailable")+state("Event music", "Unavailable")+state("Pool effect", "Unavailable")+'</dl><p class="guest-capability">Sound-reactive stage spotlight capability: Preview only. Live sound level and lighting state: Unknown.</p></section>';
        } else if (kind === "cottage") {
            content.innerHTML = window.ReservationDeviceControls?.enabled ? '' : '<section class="guest-facility-card"><span class="guest-preview-label">Preview</span><h2>Cottage lighting</h2><dl class="guest-device-states">'+state("Lighting", "Unavailable")+'</dl><p>The lighting setup is not verified. Lighting controls and cottage assignment are unavailable in this preview.</p></section>';
        } else {
            content.innerHTML = '<section class="guest-facility-card"><span class="guest-preview-label">Preview</span><h2>KTV room</h2><dl class="guest-device-states">'+state("Sliding-door status", "Unknown")+state("Hall-confirmed readiness", "Unknown")+state("Lighting state", "Unknown")+state("Karaoke display", "Unknown")+state("Audio playback", "Unavailable")+'</dl><p>Live door, readiness, lighting and display readings are not connected in this preview.</p><p>Diorama speaker playback is unavailable. The browser-only karaoke preview is below.</p></section>';
        }
    }

    async function prepareFacility(kind) {
        const Access = window.GuestAccess;
        if (!Access) {
            await prepareGuestFacilityLayout(kind);
            document.getElementById("facilityBackDashboard").href = guestBookingUrl("guest-dashboard.html");
            document.getElementById("facilityBackDashboard").hidden = guestCloudTest();
            document.getElementById("facilityBackReservation").href = guestBookingUrl("my-reservation.html");
            renderLocked(document.getElementById("pageContent"), { reason: "Your booking could not be verified. Return to My Reservation to sign in or retry." });
            return true;
        }
        const content = document.getElementById("pageContent");
        const markup = content.innerHTML;
        renderLocked(content, { reason: "Verifying shared reservation..." });
        let account;
        try { account = await window.SharedReservations.identity(); } catch { account = null; }
        if (account?.admin) {
            facilityAdmin = true;
            let roleVersion = 0;
            const off = window.SharedReservations.watchIdentity(async user => {
                const current = ++roleVersion; facilityAdmin = false;
                if (!user || user.uid !== account.user.uid) return;
                try { const verified = await window.SharedReservations.identity(true); if (current === roleVersion) facilityAdmin = verified.user.uid === user.uid; } catch { /* Dispatch stays disabled. */ }
            });
            window.addEventListener("pagehide", off, { once: true });
            // Retain existing admin controllers/configuration, loaded only here.
            for (const name of ["database", "firebase-config", "diorama-link"]) {
                await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "js/" + name + ".js"; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); });
            }
            content.innerHTML = markup;
            document.body.classList.remove("facility-pending");
            return false;
        }
        await prepareGuestFacilityLayout(kind);
        const render = () => renderGuestFacility(kind, content);
        // Capture also blocks synthetic events and controls whose disabled
        // property was changed in DevTools; there is no guest device transport.
        if (kind === "cottage" && window.ReservationDeviceControls?.enabled) {
            const notice = document.querySelector(".guest-facility-heading-details > p:last-child");
            if (notice) notice.textContent = "Cottage controls use verified reservation access and controller acknowledgements.";
        }
        const blockAction = event => {
            if (kind === "cottage" && window.ReservationDeviceControls?.enabled && event.target.closest('[data-cottage-controls]')) return;
            if (kind === "ktv" && event.target.closest(".karaoke-preview")) return;
            if (!event.target.closest("button,input,select,textarea,[data-light],[data-song]")) return;
            event.preventDefault(); event.stopImmediatePropagation(); Access.guestAction(kind);
        };
        content.addEventListener("click", blockAction, true);
        content.addEventListener("input", blockAction, true);
        content.addEventListener("change", blockAction, true);
        const unsubscribe = Access.subscribe(() => { render(); if (kind === "cottage" && Access.accessFor(kind).allowed) window.ReservationDeviceControls?.mount(content); if (kind === "ktv" && Access.accessFor(kind).allowed) window.KtvPreview?.mount(content); else if (kind === "ktv") window.KtvPreview?.unmount(); });
        if (kind === "cottage" && Access.accessFor(kind).allowed) window.ReservationDeviceControls?.mount(content);
        window.addEventListener("pagehide", unsubscribe, { once: true });
        return true;
    }

    window.ControlShell = {
        prepareFacility,
        facilityLink() {
            const link = window.DioramaLink;
            return new Proxy(link, { get(target, key) {
                if (["set", "update", "log"].includes(key)) return (...args) => { if (facilityAdmin) return target[key](...args); };
                return typeof target[key] === "function" ? target[key].bind(target) : target[key];
            } });
        },
        init,
        role,
        isAdmin,
        currentReservation,
        hasFacility,
        cottageFromReservation,
        isCheckedIn,
        accessFor,
        toast,
        renderLocked,
        escapeHtml,
        timeAgo
    };

})(window);
