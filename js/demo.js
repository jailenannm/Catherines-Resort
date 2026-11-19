"use strict";
// Presenter-led information only: no device transport, demo runner, timers,
// booking mutation, simulated sensor stream or emergency-stop command.
document.addEventListener("DOMContentLoaded", () => {
    const Shared = window.SharedReservations;
    const $ = id => document.getElementById(id);
    let version = 0;
    const off = Shared.watchIdentity(async () => {
        const current = ++version;
        $("adminContent").hidden = true;
        try {
            await Shared.identity(true);
            if (current !== version) return;
            $("adminContent").hidden = false;
            $("adminSignIn").hidden = true;
            $("adminState").textContent = "Administrator verified. Informational walkthrough; no actions are performed.";
        } catch {
            if (current !== version) return;
            $("adminSignIn").hidden = false;
            $("adminState").textContent = "Administrator access required. Sign in with a trusted administrator account.";
        }
    });
    $("logoutButton").addEventListener("click", async () => {
        try { await Shared.signOut(); window.location.href = "login.html"; }
        catch { $("adminState").textContent = "Sign-out failed. Please retry."; }
    });
    window.addEventListener("pagehide", () => { ++version; off(); }, { once: true });
});
