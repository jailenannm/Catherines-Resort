"use strict";
// Shared guest eligibility only. This module never loads a device connector.
(function (window) {
    let state = { loading: true, reservation: null, user: null, admin: false, reason: "Verifying shared reservation..." };
    const listeners = new Set();
    let stop = () => {};
    function publish(next) { state = Object.freeze(next); listeners.forEach(listener => listener(state)); }
    function start() {
        stop();
        publish({ loading: true, reservation: null, user: null, admin: false, reason: "Verifying shared reservation..." });
        const reference = new URL(window.location.href).searchParams.get("reservation");
        stop = window.SharedReservations.subscribeOwnedReservation(reference, publish);
    }
    function includes(reservation, kind) {
        // Match the existing saved package IDs, not descriptive text or device
        // effects. Buyout includes all four facilities; the version 2 Event bundle also includes Pool.
        const packages = (reservation?.facilities || []).map(f => f.value);
        return ["cottage", "pool", "ktv", "event"].includes(kind) && (packages.includes(kind) || packages.includes("buyout") || (kind === "pool" && (reservation?.facilities || []).some(f => f.value === "event" && f.packageVersion === 2)));
    }
    function accessFor(kind) {
        if (!state.user || state.loading || !state.reservation) return { allowed: false, reason: state.reason, action: state.user ? "reserve" : "login" };
        if (!Number.isFinite(state.verifiedAt) || Date.now() - state.verifiedAt > 12000 || Date.now() < state.verifiedAt) return { allowed: false, reason: "Shared verification expired. Guest access is locked." };
        if (state.reservation.ownerUid !== state.user.uid) return { allowed: false, reason: "This booking could not be verified for your account.", action: "reserve" };
        if (state.reservation.status !== "Checked In") return { allowed: false, reason: "Reservation #" + state.reservation.reference + " is " + state.reservation.status + ". A saved Checked In status is required; live check-in remains disabled.", action: "checkin" };
        if (!includes(state.reservation, kind)) return { allowed: false, reason: "Your selected booking does not include " + kind.toUpperCase() + ".", action: "reserve" };
        return { allowed: true, reservation: state.reservation, deviceAuthorized: false };
    }
    window.GuestAccess = {
        get state() { return state; }, accessFor, includes,
        subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
        selectReservation(reference) {
            const url = new URL(window.location.href);
            if (reference) url.searchParams.set("reservation", reference); else url.searchParams.delete("reservation");
            window.history.replaceState(null, "", url); start();
        },
        facilityUrl(kind) {
            const reference = state.reservation?.reference || new URL(window.location.href).searchParams.get("reservation");
            return kind + ".html" + (reference ? "?reservation=" + encodeURIComponent(reference) : "");
        },
        // Guest handlers always refuse dispatch, even if a DOM control is enabled
        // or an event is invoked programmatically. Eligibility is not authority.
        guestAction(kind) {
            const access = accessFor(kind);
            const message = access.allowed ? "This facility is eligible. Guest device commands are disabled in this phase." : access.reason;
            window.ControlShell?.toast(message, "info");
            return false;
        }
    };
    start();
    window.addEventListener("pagehide", () => { stop(); publish({ loading: false, reservation: null, user: null, admin: false, reason: "Session closed." }); }, { once: true });
})(window);
