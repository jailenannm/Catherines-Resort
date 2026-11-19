"use strict";

// Shared bookings are deliberately isolated from ResortDB's legacy local
// accounts/history and from the device database application.
(function (window) {
    const config = window.SHARED_RESERVATIONS_CONFIG || {};
    let services;
    function initialize() {
        if (services) return services;
        if (!window.firebase || !["emulator", "production"].includes(config.mode)) {
            throw new Error("Shared reservations are not configured. Please contact the resort.");
        }
        const emulator = config.mode === "emulator";
        const projectId = config.emulatorProjectId;
        if (emulator && (!projectId || !projectId.startsWith("demo-"))) {
            throw new Error("Emulator reservations require a demo project.");
        }
        const options = emulator ? {
            apiKey: "demo-reservations-key", projectId,
            authDomain: projectId + ".firebaseapp.com",
            databaseURL: config.databaseEmulatorUrl + "?ns=" + projectId + "-default-rtdb"
        } : config.firebaseConfig;
        if (!options || !options.databaseURL) throw new Error("Missing shared Firebase configuration.");
        const app = window.firebase.initializeApp(options, "shared-reservations");
        const auth = app.auth();
        const db = app.database();
        if (emulator) {
            auth.useEmulator(config.authEmulatorUrl, { disableWarnings: true });
            const endpoint = new URL(config.databaseEmulatorUrl);
            db.useEmulator(endpoint.hostname, Number(endpoint.port));
        }
        const ready = new Promise((resolve, reject) => {
            const off = auth.onAuthStateChanged(() => { off(); resolve(); }, reject);
        });
        services = { app, auth, db, ready, base: options.databaseURL };
        return services;
    }
    async function identity(admin = false) {
        const service = initialize();
        await service.ready;
        const user = service.auth.currentUser;
        if (!user || user.isAnonymous) throw new Error("Please sign in with your email and password to use shared reservations.");
        const token = await user.getIdTokenResult();
        if (admin && token.claims.admin !== true) throw new Error("Administrator sign-in is required to view shared reservations.");
        return { user, admin: token.claims.admin === true };
    }
    async function request(path, options = {}, includeETag = false, collection = "sharedReservations") {
        const { user } = await identity();
        const url = new URL(initialize().base);
        url.pathname = "/" + collection + path + ".json";
        url.searchParams.set("auth", await user.getIdToken());
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), ...options });
        if (!response.ok) {
            const error = new Error("Shared reservation request failed (" + response.status + "). Please retry. Your form details have been kept.");
            error.status = response.status;
            throw error;
        }
        const value = await response.json();
        return includeETag ? { value, etag: response.headers.get("ETag") } : value;
    }
    function sameAttempt(record, attempt, uid) {
        return record && record.ownerUid === uid &&
            record.submissionAttemptId === attempt.submissionAttemptId;
    }
    function normalize(record) {
        return { ...record, facilities: Object.values(record.facilities || {}).map(f => f.value === "event" && f.packageVersion === 2 ? { ...f, name: "Celebration Event Package — Event Place, Swimming Pool & Stage Band" } : f) };
    }
    async function generateReference() {
        await identity();
        for (let i = 0; i < 30; i++) {
            const reference = "CBLR-" + (100000 + window.crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
            try {
                if (!await request("/" + reference)) return reference;
            } catch (error) {
                // A reference owned by another guest is deliberately unreadable.
                if (error.status !== 401 && error.status !== 403) throw error;
            }
        }
        throw new Error("Could not allocate an unused booking reference. Please retry.");
    }
    async function createReservation(attempt) {
        const { user } = await identity();
        if (attempt.ownerUid !== user.uid) throw new Error("Please retry this booking with the original signed-in account.");
        if (!/^CBLR-[0-9]{6}$/.test(attempt.reference || "")) throw new Error("Invalid booking reference.");
        const path = "/" + attempt.reference;
        const existing = await request(path);
        if (existing) {
            if (sameAttempt(existing, attempt, user.uid)) return { success: true, reservation: normalize(existing), reused: true };
            return { success: false, error: "REFERENCE_COLLISION" };
        }
        // Explicit allowlist: never upload local accounts, demo bookings, RFID or
        // device data. Rules independently enforce the same create-only contract.
        if (attempt.facilities.some(f => f.value === "event") && attempt.facilities.some(f => f.value === "pool")) throw new Error("Pool is included in the Event Package; a separate Pool charge is not allowed.");
        const record = {};
        for (const field of ["reference", "ownerUid", "submissionAttemptId", "checkinDate", "staySlotId", "duration", "adults", "children", "senior", "totalGuests", "honorific", "guestName", "mobile", "email", "specialRequests", "facilities", "prices", "createdAt"]) {
            record[field] = attempt[field];
        }
        record.status = "Pending Verification";
        record.rfidLinked = "";
        try {
            // Conditional REST write: no optimistic SDK cache or offline queue.
            // A reference can be created once, including races between browsers.
            const saved = await request(path, {
                method: "PUT", headers: { "Content-Type": "application/json", "if-match": "null_etag" },
                body: JSON.stringify(record)
            });
            return { success: true, reservation: normalize(saved) };
        } catch (error) {
            // Recover only from a SERVER read of the exact same attempt. This
            // also covers a lost acknowledgement after the server committed.
            try {
                const saved = await request(path);
                if (sameAttempt(saved, attempt, user.uid)) return { success: true, reservation: normalize(saved), reused: true };
                if (saved) return { success: false, error: "REFERENCE_COLLISION" };
            } catch (readError) { /* Keep attempt identity for a later retry. */ }
            throw error;
        }
    }
    const approvalRequests = new Map();
    async function approvePendingReservation(reference) {
        await identity(true);
        if (!/^CBLR-[0-9]{6}$/.test(reference || "")) throw new Error("Invalid booking reference.");
        const statusPath = "/" + reference + "/status";
        const current = await request(statusPath, { headers: { "X-Firebase-ETag": "true" } }, true);
        if (current.value === "Confirmed") return { success: true, reference, status: "Confirmed", alreadyConfirmed: true };
        if (current.value !== "Pending Verification") throw new Error("Only Pending Verification bookings can be approved.");
        if (!current.etag) throw new Error("Could not verify the current booking version. Please retry approval.");
        try {
            // Write ONLY status, conditionally against the server's current version.
            // No booking details, RFID, local history, email or device state changes.
            const status = await request(statusPath, {
                method: "PUT", headers: { "Content-Type": "application/json", "if-match": current.etag },
                body: JSON.stringify("Confirmed")
            });
            if (status !== "Confirmed") throw new Error("Firebase did not confirm the approval.");
            return { success: true, reference, status, alreadyConfirmed: false };
        } catch (cause) {
            // A concurrent admin may have won, or the commit acknowledgement may
            // have been lost. Only a fresh SERVER read may confirm that outcome.
            try {
                await identity(true);
                if (await request(statusPath) === "Confirmed") {
                    return { success: true, reference, status: "Confirmed", alreadyConfirmed: true };
                }
            } catch (readError) { /* No confirmed outcome: expose failure and permit retry. */ }
            throw new Error("Approval was not confirmed. Please retry; no other booking details were changed.");
        }
    }
    function approveReservation(reference) {
        if (approvalRequests.has(reference)) return approvalRequests.get(reference);
        const operation = approvePendingReservation(reference).finally(() => approvalRequests.delete(reference));
        approvalRequests.set(reference, operation);
        return operation;
    }
    const checkoutRequests = new Map();
    function requestCheckout(reference) {
        if (checkoutRequests.has(reference)) return checkoutRequests.get(reference);
        const operation = (async () => {
            if (config.mode !== 'emulator' || config.cloudTest === true) throw new Error('Checkout is available only in the emulator.');
            if (!/^CBLR-[0-9]{6}$/.test(reference || '')) throw new Error('Reservation unavailable.');
            const { user } = await identity();
            const record = await request('/' + reference);
            if (!record || record.ownerUid !== user.uid) throw new Error('Reservation unavailable.');
            if (record.status === 'Checking Out') return {success:true,reference,status:'Checking Out',reused:true};
            if (record.status !== 'Checked In') throw new Error('Only a Checked In booking can request checkout.');
            const path = '/' + reference + '/status';
            const snapshot = await request(path, {headers:{'X-Firebase-ETag':'true'}}, true);
            if (!snapshot.etag) throw new Error('Could not verify booking version. Retry.');
            try {
                if ((await identity()).user.uid !== user.uid) throw new Error('Session changed.');
                const status = await request(path,{method:'PUT',headers:{'Content-Type':'application/json','if-match':snapshot.etag},body:JSON.stringify('Checking Out')});
                if (status !== 'Checking Out') throw new Error('Save not confirmed.');
                return {success:true,reference,status};
            } catch {
                try {
                    if ((await identity()).user.uid === user.uid) {
                        const saved = await request('/'+reference);
                        if (saved?.ownerUid === user.uid && ['Checking Out','Completed'].includes(saved.status)) return {success:true,reference,status:saved.status,reused:true};
                    }
                } catch { /* Only a fresh shared read proves success. */ }
                throw new Error('Checkout request was not confirmed. Your booking is unchanged unless a shared save is verified. Please retry.');
            }
        })().finally(()=>checkoutRequests.delete(reference));
        checkoutRequests.set(reference,operation);
        return operation;
    }
    const completionRequests = new Map();
    function confirmCheckout(reference, confirmation) {
        if (completionRequests.has(reference)) return completionRequests.get(reference);
        const operation = (async () => {
            if (config.mode !== 'emulator' || config.cloudTest === true) throw new Error('Admin checkout is available only in the emulator.');
            if (!/^CBLR-[0-9]{6}$/.test(reference || '') || confirmation?.guestDeparted !== true || confirmation?.cardReadyForReuse !== true) throw new Error('Confirm departure and card readiness.');
            const { user } = await identity(true);
            const endpoint = config.adminCheckoutUrl || 'http://' + location.hostname + ':8790/admin/confirm-checkout';
            const response = await fetch(endpoint, {
                method: 'POST', headers: { Authorization: 'Bearer ' + await user.getIdToken(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference, guestDeparted: true, cardReadyForReuse: true }), signal: AbortSignal.timeout(15000)
            });
            const result = await response.json();
            if (!response.ok || result.success !== true || result.reference !== reference || result.status !== 'Completed') throw new Error(result.error || 'Checkout was not confirmed. Retry.');
            return result;
        })().finally(() => completionRequests.delete(reference));
        completionRequests.set(reference, operation);
        return operation;
    }
    function normalizeRfidUid(input) {
        if (typeof input !== "string") throw new Error("Enter the full RFID UID as hexadecimal bytes.");
        const text = input.trim().toUpperCase();
        let uid = text;
        if (/[\s:-]/.test(text)) {
            const bytes = text.split(/[\s:-]+/);
            if (!bytes.every(byte => /^[0-9A-F]{2}$/.test(byte))) {
                throw new Error("Each UID byte must contain two hex digits, including leading zeros.");
            }
            uid = bytes.join("");
        }
        if (!/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(uid)) {
            throw new Error("Use a verified 4-, 7- or 10-byte card UID (8, 14 or 20 hex digits). Do not guess missing zeros from the ESP32 lastUid payload.");
        }
        return uid;
    }
    const rfidRequests = new Map();
    async function assignConfirmedRfid(reference, uid) {
        await identity(true);
        if (!/^CBLR-[0-9]{6}$/.test(reference || "")) throw new Error("Invalid booking reference.");
        const bookingPath = "/" + reference;
        const readPair = async () => {
            const booking = await request(bookingPath);
            const claim = await request("/" + uid, {}, false, "rfidAssignments");
            return { booking, claim };
        };
        const isAssigned = pair => pair.booking?.status === "Confirmed" && pair.booking.rfidLinked === uid && pair.claim === reference;
        const current = await readPair();
        if (!current.booking || current.booking.status !== "Confirmed") throw new Error("RFID assignment requires a Confirmed booking.");
        if (isAssigned(current)) return { success: true, reference, assigned: true, alreadyAssigned: true };
        if (current.booking.rfidLinked) throw new Error("This booking already has a card. Replacement or removal is not enabled.");
        if (current.claim === reference) {
            // The booking and index reads may straddle another admin's atomic
            // commit. Re-read rather than misreporting the same pair as reuse.
            if (isAssigned(await readPair())) return { success: true, reference, assigned: true, alreadyAssigned: true };
            throw new Error("The existing RFID binding is inconsistent. No changes were saved; please review it.");
        }
        if (current.claim) throw new Error("This card is already reserved. Card reuse or reassignment is not enabled.");
        const updates = {
            ["sharedReservations/" + reference + "/rfidLinked"]: uid,
            ["rfidAssignments/" + uid]: reference
        };
        try {
            // One atomic, rule-validated fan-out update. Immutable reciprocal
            // bindings prevent one UID from being claimed by two bookings.
            const saved = await request("", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }, false, "");
            // RTDB may expand a multi-path PATCH response into nested objects.
            // Verify both bindings in either response shape before reporting success.
            const savedCard = saved?.["sharedReservations/" + reference + "/rfidLinked"] ?? saved?.sharedReservations?.[reference]?.rfidLinked;
            const savedReference = saved?.["rfidAssignments/" + uid] ?? saved?.rfidAssignments?.[uid];
            if (savedCard !== uid || savedReference !== reference) {
                throw new Error("Firebase did not confirm both assignment entries.");
            }
            return { success: true, reference, assigned: true, alreadyAssigned: false };
        } catch (cause) {
            try {
                await identity(true);
                const recovered = await readPair();
                // It was unassigned before this write. Recovering a committed
                // save must not mislabel the request as a pre-existing binding.
                if (isAssigned(recovered)) return { success: true, reference, assigned: true, alreadyAssigned: false };
                if (recovered.claim && recovered.claim !== reference) throw new Error("CARD_IN_USE");
            } catch (readError) {
                if (readError.message === "CARD_IN_USE") throw new Error("This card was assigned to another booking. No assignment was saved for this booking.");
            }
            throw new Error("RFID assignment was not confirmed. Your UID entry has been kept; please retry.");
        }
    }
    function assignRfid(reference, input) {
        const uid = normalizeRfidUid(input);
        const current = rfidRequests.get(reference);
        if (current) {
            if (current.uid !== uid) return Promise.reject(new Error("An RFID assignment is already in progress for this booking."));
            return current.operation;
        }
        const operation = assignConfirmedRfid(reference, uid).finally(() => rfidRequests.delete(reference));
        rfidRequests.set(reference, { uid, operation });
        return operation;
    }
    function subscribeReservations(admin, next, error) {
        let cancelled = false, detach = () => {}, version = 0;
        let offAuth = () => {};
        try {
            const service = initialize();
            offAuth = service.auth.onIdTokenChanged(async () => {
                const current = ++version;
                detach();
                next([]); // Never retain another account's rows after sign-out.
                try {
                    const { user } = await identity(admin);
                    if (cancelled || current !== version) return;
                    const root = service.db.ref("sharedReservations");
                    const query = admin ? root : root.orderByChild("ownerUid").equalTo(user.uid);
                    const listener = snapshot => {
                        if (cancelled || current !== version) return;
                        next(Object.values(snapshot.val() || {}).map(record => {
                            const value = normalize(record);
                            if (!admin) {
                                value.rfidAssigned = Boolean(value.rfidLinked);
                                delete value.rfidLinked; // The guest view receives only assignment state.
                            }
                            return value;
                        }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
                    };
                    query.on("value", listener, cause => {
                        if (cancelled || current !== version) return;
                        next([]); error(cause);
                    });
                    detach = () => query.off("value", listener);
                } catch (cause) {
                    if (!cancelled && current === version) error(cause);
                }
            });
        } catch (cause) { next([]); error(cause); }
        return () => { cancelled = true; ++version; detach(); offAuth(); };
    }
    // Owner selection is a navigation hint only. Every candidate is verified by
    // an uncached server read under the named-app Firebase Auth identity.
    function subscribeOwnedReservation(reference, next) {
        const service = initialize();
        let cancelled = false, connected = false, records = [], version = 0;
        let timer, lease, interval;
        const locked = (reason, user = null, admin = false, loading = false) => next({ loading, reservation: null, user, admin, reason });
        const info = service.db.ref(".info/connected");
        async function verify() {
            const current = ++version;
            clearTimeout(lease);
            locked("Verifying shared reservation...", null, false, true);
            try {
                const account = await identity();
                if (cancelled || current !== version) return;
                const user = { uid: account.user.uid, email: account.user.email, displayName: account.user.displayName };
                if (!connected) { locked("Connection unavailable. Guest access is locked.", user); return; }
                if (reference && !/^CBLR-[0-9]{6}$/.test(reference)) throw new Error("Invalid selected booking reference.");
                const selected = reference || records[0]?.reference;
                // Admin workflow identification is trusted Auth only. It never
                // grants a guest a booking or device-command permission.
                if (!selected) { locked("No shared booking found for this account.", user, account.admin); return; }
                const saved = await request("/" + selected);
                const latestIdentity = await identity();
                if (cancelled || current !== version || latestIdentity.user.uid !== user.uid || !connected) return;
                if (!saved || saved.ownerUid !== user.uid || saved.reference !== selected) throw new Error("Selected booking is not owned by this signed-in account.");
                const reservation = normalize(saved);
                reservation.rfidAssigned = Boolean(reservation.rfidLinked);
                delete reservation.rfidLinked;
                next({ loading: false, reservation, user, admin: account.admin, verifiedAt: Date.now(), reason: "Shared reservation verified." });
                lease = setTimeout(() => { ++version; locked("Shared verification expired. Guest access is locked.", user); }, 12000);
            } catch (cause) {
                if (!cancelled && current === version) locked("Could not verify your selected booking. Sign in or retry.");
            }
        }
        function schedule() { clearTimeout(timer); timer = setTimeout(verify, 0); }
        const connectionListener = snapshot => {
            connected = snapshot.val() === true;
            ++version; clearTimeout(lease);
            locked(connected ? "Verifying shared reservation..." : "Connection unavailable. Guest access is locked.", null, false, true);
            schedule();
        };
        info.on("value", connectionListener);
        const unsubscribe = subscribeReservations(false, values => {
            records = values;
            ++version; clearTimeout(lease);
            locked("Verifying shared reservation...", null, false, true);
            schedule();
        }, () => {
            ++version; clearTimeout(lease);
            locked("Session or reservation unavailable. Guest access is locked.");
        });
        // Server verification bounds reliance on token/cache state, even if no
        // booking event arrives. A failed refresh never retains eligible state.
        interval = setInterval(verify, 5000);
        return () => { cancelled = true; ++version; clearTimeout(timer); clearTimeout(lease); clearInterval(interval); info.off("value", connectionListener); unsubscribe(); };
    }

    window.SharedReservations = {
        async recoverReservationAttempt(attempt) {
            const {user} = await identity();
            if (!/^CBLR-[0-9]{6}$/.test(attempt?.reference || '') || attempt.ownerUid !== user.uid) return null;
            const saved = await request('/' + attempt.reference);
            return sameAttempt(saved, attempt, user.uid) ? normalize(saved) : null;
        },
        watchIdentity(listener) { return initialize().auth.onIdTokenChanged(listener); },
        identity, generateReference, createReservation, approveReservation, requestCheckout, confirmCheckout, normalizeRfidUid, assignRfid, subscribeReservations, subscribeOwnedReservation,
        async signIn(email, password, remember) {
            const { auth } = initialize();
            await auth.setPersistence(remember ? window.firebase.auth.Auth.Persistence.LOCAL : window.firebase.auth.Auth.Persistence.SESSION);
            await auth.signInWithEmailAndPassword(email, password);
            return identity();
        },
        registrationContext() {
            const { app } = initialize();
            return { appName: app.name, projectId: app.options.projectId, mode: config.mode };
        },
        async register(email, password, fullName) {
            let registrationStage = "initialize", accountCreated = false;
            try {
                const { auth } = initialize();
                registrationStage = "session-persistence";
                await auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
                registrationStage = "create-account";
                const credential = await auth.createUserWithEmailAndPassword(email, password);
                accountCreated = true;
                registrationStage = "profile";
                await credential.user.updateProfile({ displayName: fullName });
                registrationStage = "verify-session";
                return await identity();
            } catch (error) {
                // Propagate only diagnostic metadata; never retain credentials,
                // raw backend messages/customData or request/response objects.
                const code = /^auth\/[a-z0-9-]{1,80}$/.test(error?.code || "") ? error.code : "registration/unknown-error";
                throw Object.assign(new Error("Shared registration failed."), { code, registrationStage, accountCreated });
            }
        },
        async signOut() { await initialize().auth.signOut(); },
        emailEnabled: config.mode === "production" && config.confirmationEmailEnabled === true
    };
})(window);
