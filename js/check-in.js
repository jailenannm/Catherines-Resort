"use strict";

// No browser scan can establish physical presence. This page observes only
// server-saved shared bookings; legacy device flags and simulation are ignored.
document.addEventListener("DOMContentLoaded", async () => {
    const Shell = window.ControlShell;
    const Shared = window.SharedReservations;
    const $ = id => document.getElementById(id);
    Shell.init("check-in");
    const disabledMessage = "Live check-in is disabled: a trusted, full-UID scan source is not configured.";
    $("gateRow").style.display = "none";
    $("gateSwitch").disabled = true;
    $("simUid").disabled = true;
    $("simScanBtn").disabled = true;
    $("simScanBtn").title = "Browser simulation cannot verify a real card.";
    $("nfcSub").textContent = disabledMessage;
    $("nfcPrompt").textContent = "Live scanner unavailable";
    $("scannerStatus").textContent = "Disabled";
    $("scannerStatus").className = "cs-chip warn";
    const caption = document.querySelector(".cs-card-head small");
    if (caption) caption.textContent = "Shared reservation status; live reader verification unavailable";
    $("adminSection").style.display = "none";
    function render(records, admin) {
        $("guestInfo").classList.remove("active");
        $("nfcScanner").className = "nfc-scanner";
        $("nfcPrompt").textContent = "Live scanner unavailable";
        $("nfcSub").textContent = disabledMessage;
        $("scannerStatus").textContent = "Disabled";
        $("scannerStatus").className = "cs-chip warn";
        if (admin) {
            $("adminSection").style.display = "";
            $("arrivalsList").innerHTML = records.filter(r => ["Confirmed", "Checked In"].includes(r.status)).map(r => `
                <div class="res-item"><div><strong>${Shell.escapeHtml(r.guestName)}</strong>
                <small>${Shell.escapeHtml(r.reference)} - ${Shell.escapeHtml(r.status)}</small></div>
                <span class="cs-chip info">${r.status === "Checked In" ? "Verified check-in saved" : "Trusted scan required"}</span></div>
            `).join("") || "No confirmed arrivals.";
        }
        // A saved Checked In status is writable only by the trusted backend,
        // never by a browser role, manual button, UID entry or device flag.
        const checked = records.find(r => r.status === "Checked In");
        if (!checked) return;
        $("nfcScanner").className = "nfc-scanner success";
        $("nfcPrompt").textContent = "Verified check-in saved";
        $("nfcSub").textContent = (window.SHARED_RESERVATIONS_CONFIG?.mode === "emulator" ? "Emulator fixture only. " : "") + "Saved shared status. Facility and gate controls remain unavailable.";
        $("scannerStatus").textContent = "Checked In";
        $("scannerStatus").className = "cs-chip on";
        $("guestInfo").classList.add("active");
        $("guestName").textContent = checked.guestName;
        $("guestRef").textContent = checked.reference;
        $("guestCottage").textContent = "Facility controls locked";
    }
    try {
        const account = await Shared.identity();
        const unsubscribe = Shared.subscribeReservations(account.admin, records => render(records, account.admin), () => {
            render([], false);
            $("arrivalsList").replaceChildren();
            $("adminSection").style.display = "none";
            $("nfcSub").textContent = "Could not confirm shared status. Sign in or refresh to retry.";
        });
        window.addEventListener("pagehide", unsubscribe, { once: true });
    } catch {
        $("nfcSub").textContent = "Please sign in to view your shared check-in status. Live scanning is disabled.";
    }
});
