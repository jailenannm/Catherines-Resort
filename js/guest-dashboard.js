"use strict";
// This page has no device transport or mutable booking actions. GuestAccess
// verifies the selected owner/status/package again; a reference is only a selector.
document.addEventListener("DOMContentLoaded", () => {
    const Access = window.GuestAccess, $ = id => document.getElementById(id);
    const requested = new URL(location.href).searchParams.get("reservation");
    let lastSummary = null;
    const checkout = document.createElement("a"); checkout.id="dashboardCheckout"; checkout.className="guest-facility-button"; checkout.hidden=true; $("dashboardMessage").after(checkout);
    const backTo = reference => "my-reservation.html" + (/^CBLR-[0-9]{6}$/.test(reference || "") ? "?reservation=" + encodeURIComponent(reference) : "");
    $("backToReservation").href = backTo(requested);
    $("dashboardSignIn").addEventListener("click", () => {
        const reference = new URL(location.href).searchParams.get("reservation");
        if (/^CBLR-[0-9]{6}$/.test(reference || "")) {
            try { sessionStorage.setItem("myReservationSignInReference", reference); }
            catch { /* Optional selector hint; never an authorization signal. */ }
        }
    });
    const stop = Access.subscribe(state => {
        const selected = new URL(location.href).searchParams.get("reservation");
        const user = window.firebase.app("shared-reservations").auth().currentUser;
        // Keep read-only text steady during a same-owner background refresh.
        // Cards still use Access.accessFor and lock immediately while verifying.
        // A selection/auth change or failed verification clears the old summary.
        const booking = state.reservation || (state.loading && lastSummary && user?.uid === lastSummary.ownerUid && (!selected || selected === lastSummary.reference) ? lastSummary : null);
        if (state.reservation) lastSummary = state.reservation;
        else if (!booking) lastSummary = null;
        $("selectedBooking").hidden = !booking;
        $("reservationNumber").textContent = booking?.reference || "";
        $("bookingStatus").textContent = booking?.status || "";
        $("reservedPackages").replaceChildren();
        const bundle = booking?.facilities.some(facility => facility.value === "event" && facility.packageVersion === 2);
        if (booking) {
            $("backToReservation").href = backTo(booking.reference);
            for (const facility of booking.facilities) {
                const item = document.createElement("li");
                item.textContent = facility.value === "event" && facility.packageVersion === 2 ? "Celebration Event Package — Event Place, Swimming Pool & Stage Band" : facility.name || "Reserved facility";
                $("reservedPackages").appendChild(item);
            }
        } else $("backToReservation").href = backTo(new URL(location.href).searchParams.get("reservation"));
        $("dashboardSignIn").hidden = Boolean(booking) || state.loading;
        $("dashboardMessage").textContent = state.loading ? "Loading your booking…" : !booking ? "Your booking could not be verified. Facility access is locked. Sign in or return to My Reservation to retry." : booking.status === "Pending Verification" ? "Your booking is waiting for approval. Facility access is locked." : booking.status === "Confirmed" ? "Your booking is confirmed. Check in at the front desk to access your reserved facilities. Facility access is locked until check-in is saved." : booking.status === "Checked In" ? "Your booking is checked in. View your reserved facilities below. Facility controls remain unavailable." : "Facility access is locked for this booking’s current status.";
        checkout.hidden = state.loading || !state.reservation || window.SHARED_RESERVATIONS_CONFIG?.mode !== 'emulator' || window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true || !booking || !['Checked In','Checking Out','Completed'].includes(booking.status);
        checkout.href = 'checkout.html?reservation=' + encodeURIComponent(booking?.reference || '');
        checkout.textContent = booking?.status === 'Checked In' ? 'Request Checkout' : 'View Checkout';
        if (booking?.status === 'Checking Out') $('dashboardMessage').textContent = 'Checkout requested. Facilities are locked while departure verification is pending.';
        if (booking?.status === 'Completed') $('dashboardMessage').textContent = 'This booking is Completed. Facility access remains locked.';
        if (booking?.status === "Checked In" && window.ReservationDeviceControls?.enabled && Access.includes(booking, "cottage")) $("dashboardMessage").textContent = "Your booking is checked in. Cottage lighting requests are verified by the backend; controller feedback appears below.";
        if (booking?.status === "Checked In" && window.SHARED_RESERVATIONS_CONFIG?.facilitiesV2Enabled) $("dashboardMessage").textContent = "Your booking is checked in. My Facility Controls below shows simulation or commissioning status; physical output is not implied.";
        $("eventTitle").textContent = bundle ? "Event Place with Stage Band" : "Event Place";
        $("eventDescription").textContent = bundle ? "Your Celebration Event Package includes Event Place, Stage Band and Swimming Pool." : "Your saved booking includes Event Place access.";
        for (const card of document.querySelectorAll(".facility-card")) {
            const kind = card.dataset.kind, access = Access.accessFor(kind), link = card.querySelector("[data-facility]");
            card.hidden = !access.allowed; card.dataset.eligible = String(access.allowed);
            link.setAttribute("aria-disabled", String(!access.allowed));
            if (access.allowed) link.href = Access.facilityUrl(kind); else link.removeAttribute("href");
        }
    });
    document.querySelectorAll("[data-facility]").forEach(link => link.addEventListener("click", event => {
        // Re-evaluate the lease/ownership/status at the moment of navigation.
        const access = Access.accessFor(link.dataset.facility);
        if (!access.allowed) { event.preventDefault(); $("dashboardMessage").textContent = "Facility access is locked. Return to My Reservation to verify your booking."; return; }
        link.href = Access.facilityUrl(link.dataset.facility);
    }));
    window.addEventListener("pagehide", stop, {once:true});
});
