"use strict";

// Read-only booking details. Auth/rules verify access; references only select.
document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    const Shared = window.SharedReservations;
    let stopAuth = () => {}, stopRecords = () => {};
    let authVersion = 0, loadVersion = 0, refreshTimer, pending;
    const money = value => Number.isFinite(value)
        ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value)
        : "Total unavailable";
    function clearDetails() {
        $("selectedHeading").hidden = true;
        $("bookingContent").hidden = true;
        document.querySelectorAll(".booking-value").forEach(element => { element.textContent = ""; });
        $("bookingStatus").textContent = "";
        $("bookedFacilities").replaceChildren();
        for (const id of ["emailDetail", "mobileDetail", "rfidDetail", "requestsCard", "subtotalRow", "taxRow", "serviceRow", "openDashboard", "openCheckout"]) $(id).hidden = true;
    }
    function showState(kind) {
        clearDetails();
        $("pageState").hidden = false;
        $("stateText").textContent = {
            loading: "Loading your reservation…",
            signedOut: "Sign in to view your reservations.",
            empty: "You have no reservations yet.",
            unavailable: "This reservation is unavailable.",
            error: "We couldn’t load your reservations. Please retry."
        }[kind];
        $("signInLink").hidden = kind !== "signedOut";
        $("bookNowLink").hidden = kind !== "empty";
        $("retryButton").hidden = kind !== "error";
    }
    function clearPicker() {
        $("bookingPicker").hidden = true;
        $("reservationSelector").replaceChildren();
    }
    function renderPicker(records, reference, found) {
        const select = $("reservationSelector");
        select.replaceChildren();
        if (!found) {
            const option = new Option("Select one of your reservations", "", true, true);
            option.disabled = true;
            select.add(option);
        }
        for (const record of records) select.add(new Option(record.reference + " — " + record.status, record.reference, false, record.reference === reference));
        $("bookingPicker").hidden = records.length < 2 && found;
    }
    function reservationDate(value) {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date unavailable";
        const date = new Date(value + "T00:00:00Z");
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Date unavailable";
        return new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeZone: "UTC" }).format(date);
    }
    function duration(value) {
        // Legacy slot options all saved "4500" despite different timings. Never
        // interpret a price-like value as a stay length or derive a departure.
        return typeof value === "string" && value.length <= 120 && /\b(hours?|nights?|days?)\b/i.test(value)
            ? value : "Duration unavailable";
    }
    function renderBooking(record) {
        clearDetails();
        $("pageState").hidden = true;
        $("bookingReference").textContent = record.reference;
        $("bookingStatus").textContent = record.status;
        $("guestName").textContent = record.guestName || "Not provided";
        $("reservationDate").textContent = reservationDate(record.checkinDate);
        $("guestCount").textContent = Number.isInteger(record.totalGuests) ? String(record.totalGuests) : "Not recorded";
        const slot = window.BookingSlots?.[record.staySlotId];
        $("stayDuration").textContent = slot && slot.label === record.duration ? slot.label : duration(record.duration);
        $("guestBreakdown").textContent = ["adults", "children", "senior"].every(key => Number.isInteger(record[key])) ? record.adults + " adults · " + record.children + " children · " + record.senior + " senior/PWD" : "Not recorded";
        for (const [key, id, row] of [["subtotal","savedSubtotal","subtotalRow"],["tourismTax","savedTax","taxRow"],["serviceCharge","savedService","serviceRow"]]) if (Number.isFinite(record.prices?.[key])) { $(id).textContent = money(record.prices[key]); $(row).hidden = false; }
        const checkedIn = record.status === "Checked In", cloud = window.SHARED_RESERVATIONS_CONFIG?.cloudTest === true || (["localhost", "127.0.0.1"].includes(location.hostname) && location.port === "5001");
        $("statusInstruction").textContent = checkedIn ? (cloud ? "Your check-in is saved. The Guest Dashboard is unavailable on this reservation-only test server." : "Your check-in is saved. Open your dashboard to view your booked facility eligibility. Physical controls remain disabled.") : ({"Pending Verification":"Your booking is pending administrator verification. Facility access remains locked.","Confirmed": cloud ? "Your booking is confirmed. RFID check-in is unavailable in this reservation test. Facility access remains locked." : "Your booking is confirmed. Check in at the front desk to access your reserved facilities.","Checking Out":"Checkout is in progress. Facility access is locked.","Completed":record.checkoutConfirmation?.source === "admin-confirmed" ? "Checkout completed. Departure admin-confirmed in this demo." : "Checkout completed. Facility access is locked."}[record.status] || "This booking does not grant facility access.");
        $("openDashboard").hidden = !checkedIn || cloud;
        $("openDashboard").href = "guest-dashboard.html?reservation=" + encodeURIComponent(record.reference);
        const checkoutEnabled = window.SHARED_RESERVATIONS_CONFIG?.mode === 'emulator' && !cloud && ['Checked In','Checking Out','Completed'].includes(record.status);
        $('openCheckout').hidden = !checkoutEnabled;
        $('openCheckout').textContent = checkedIn ? 'Request Checkout' : 'View Checkout';
        $('openCheckout').href = 'checkout.html?reservation=' + encodeURIComponent(record.reference);
        if (record.status === 'Checking Out') $('statusInstruction').textContent = 'Your checkout request is saved. Facility access is locked. Please wait for trusted departure verification.';
        if (record.status === 'Completed') $('statusInstruction').textContent = record.checkoutConfirmation?.source === 'admin-confirmed' ? 'Checkout completed. Departure admin-confirmed in this demo. Facility access remains locked.' : 'This booking is Completed. Facility access remains locked.';
        $("bookingTotal").textContent = money(record.prices?.total); // Never recalculate stored totals.
        for (const [field, id, row] of [["email", "contactEmail", "emailDetail"], ["mobile", "contactMobile", "mobileDetail"]]) {
            if (typeof record[field] === "string" && record[field].trim()) { $(id).textContent = record[field]; $(row).hidden = false; }
        }
        if (typeof record.rfidAssigned === "boolean") {
            $("rfidAssignment").textContent = record.status === "Completed" && record.checkoutConfirmation?.cardReleased ? "Released" : (record.rfidAssigned ? "Assigned" : "Unassigned");
            $("rfidDetail").hidden = false;
        }
        for (const facility of Object.values(record.facilities || {})) {
            const item = document.createElement("li");
            const photos = {
                cottage: ["cottage.png", "Catherine’s cottages and landscaped resort grounds at night"],
                pool: ["pool.png", "Catherine’s swimming pool and arched bridge"],
                event: ["pavilion.png", "Catherine’s pavilion venue beside the illuminated pool"],
                buyout: ["cottage.png", "Catherine’s resort grounds, cottages and pool"]
            };
            const photo = photos[facility.value];
            if (photo) {
                const image = document.createElement("img");
                image.className = "reserved-facility-photo";
                image.src = "assets/" + photo[0]; image.alt = photo[1]; image.loading = "lazy";
                item.appendChild(image);
            }
            const name = document.createElement("strong");
            const bundle = facility.value === "event" && facility.packageVersion === 2;
            name.textContent = bundle ? "Celebration Event Package" : facility.name || "Reserved facility";
            item.appendChild(name);
            if (bundle) {
                const inclusions = document.createElement("ul"); inclusions.className = "inclusions";
                for (const label of ["Event Place", "Swimming Pool", "Stage Band"]) { const li = document.createElement("li"); li.textContent = label; inclusions.appendChild(li); }
                item.appendChild(inclusions);
            }
            const price = document.createElement("p"); price.className = "facility-price"; price.textContent = money(facility.price); item.appendChild(price);
            $("bookedFacilities").appendChild(item);
        }
        if (typeof record.specialRequests === "string" && record.specialRequests.trim()) {
            $("specialRequests").textContent = record.specialRequests;
            $("requestsCard").hidden = false;
        }
        // No shared cottage-allocation or payment-record contract exists in this
        // checkout. Do not infer an assignment/payment from package names/status.
        $("selectedHeading").hidden = false;
        $("bookingContent").hidden = false;
    }
    function cancelLoad() { ++loadVersion; clearTimeout(refreshTimer); pending?.abort(); }
    async function refresh(user, generation) {
        cancelLoad();
        const current = loadVersion;
        // Foreground auth/selection/retry already clears details. Background
        // invalidations retain the verified view or current empty-state message.
        const controller = new AbortController(); pending = controller;
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const app = window.firebase.app("shared-reservations");
            const url = new URL(app.options.databaseURL);
            url.pathname = "/sharedReservations.json";
            url.searchParams.set("auth", await user.getIdToken());
            url.searchParams.set("orderBy", JSON.stringify("ownerUid"));
            url.searchParams.set("equalTo", JSON.stringify(user.uid));
            const response = await fetch(url, { cache: "no-store", signal: controller.signal });
            if (!response.ok) throw new Error("Booking read failed.");
            const value = await response.json();
            if (generation !== authVersion || current !== loadVersion || app.auth().currentUser?.uid !== user.uid) return;
            const records = Object.values(value || {}).filter(record => record && record.ownerUid === user.uid && typeof record.reference === "string")
                .map(record => {
                    const safe = { ...record };
                    if (typeof record.rfidLinked === "string") safe.rfidAssigned = Boolean(record.rfidLinked.trim());
                    delete safe.rfidLinked;
                    return safe;
                }).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
            const selected = new URL(window.location.href).searchParams.get("reservation");
            if (!records.length) { showState(selected ? "unavailable" : "empty"); return; }
            const reference = selected || records[0].reference;
            const record = records.find(candidate => candidate.reference === reference);
            renderPicker(records, reference, Boolean(record));
            if (!record) { showState("unavailable"); return; }
            renderBooking(record);
        } catch {
            if (generation === authVersion && current === loadVersion) { clearPicker(); showState("error"); }
        } finally { clearTimeout(timeout); }
    }
    async function handleAuth(authUser) {
        const generation = ++authVersion;
        stopRecords(); cancelLoad(); clearPicker(); showState("loading");
        try {
            const { user } = await Shared.identity(); // Waits for initial named-app Auth restoration.
            if (generation !== authVersion) return;
            try {
                const reference = sessionStorage.getItem("myReservationSignInReference");
                sessionStorage.removeItem("myReservationSignInReference");
                const url = new URL(window.location.href);
                if (!url.searchParams.has("reservation") && /^CBLR-[0-9]{6}$/.test(reference || "")) {
                    url.searchParams.set("reservation", reference); history.replaceState(null, "", url);
                }
            } catch { /* Optional selector hint; never an authorization signal. */ }
            const schedule = () => {
                if (generation !== authVersion) return;
                cancelLoad();
                refreshTimer = setTimeout(() => refresh(user, generation), 0);
            };
            stopRecords = Shared.subscribeReservations(false, schedule, () => {
                if (generation === authVersion) { cancelLoad(); clearPicker(); showState("error"); }
            });
        } catch {
            if (generation === authVersion) {
                if (!authUser) {
                    try {
                        const reference = new URL(window.location.href).searchParams.get("reservation");
                        if (/^CBLR-[0-9]{6}$/.test(reference || "")) sessionStorage.setItem("myReservationSignInReference", reference);
                    } catch { /* Fixed login return still works without storage. */ }
                }
                showState(authUser ? "error" : "signedOut");
            }
        }
    }
    function start() {
        stopAuth(); stopRecords(); cancelLoad(); clearPicker(); showState("loading");
        try { stopAuth = Shared.watchIdentity(handleAuth); } catch { showState("error"); }
    }
    $("reservationSelector").addEventListener("change", () => {
        const url = new URL(window.location.href);
        url.searchParams.set("reservation", $("reservationSelector").value);
        history.replaceState(null, "", url);
        start();
    });
    $("retryButton").addEventListener("click", start);
    window.addEventListener("pagehide", () => { ++authVersion; stopAuth(); stopRecords(); cancelLoad(); }, { once: true });
    start();
});
