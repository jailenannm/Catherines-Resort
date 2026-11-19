# Admin audit — 15 November 2026

**RFID feedback follow-up:** The first-assignment message issue below has now been fixed in `js/shared-reservations.js` and `js/admin-reservations.js`. RTDB returned a nested multi-path PATCH response, which the flat-key-only check misclassified as uncertain; recovery then incorrectly returned `alreadyAssigned: true`. Both response shapes are now verified, and a recovered first save remains a first assignment. `RFID card assigned` and `This reservation already has this card` distinguish new and pre-existing bindings. Six targeted port-5000 emulator groups passed in `tests/rfid-feedback.test.cjs`, including failed saves and saved-but-response-lost recovery. All 11 existing Phase 2B.2 groups also passed on isolated emulator ports, including concurrent assignment races and rules denial. Latest comparison fixture: `CBLR-823268`, still Confirmed with Assigned RFID and facility access locked. The audit findings below describe the earlier snapshot; device authorization/acknowledgement limitations remain unresolved.

Audited the existing running **http://127.0.0.1:5000** preview with Auth on 9099 and RTDB on 9000, project `demo-catherines-reservations`. No emulator reset, production request, firmware change, live email, or physical command was performed. Existing local edits and pre-existing bookings were preserved. Device-action tests used intercepted fake transport; the normal emulator device transport remained read-only.

## Compare the same synthetic booking

Primary reference: **CBLR-156442**. Guest: `guest-a@example.test`. Administrator: `administrator@example.test`. Emulator-only password for both: `TestPass123!`. Use separate browser profiles/private sessions.

- Sign in at `http://127.0.0.1:5000/login.html`.
- Admin: `http://127.0.0.1:5000/admin-reservations.html`, search `CBLR-156442`, then View Details.
- Guest: `http://127.0.0.1:5000/my-reservation.html?reservation=CBLR-156442`.
- Dashboard: `http://127.0.0.1:5000/guest-dashboard.html?reservation=CBLR-156442`.

The booking contains version-2 Celebration Event Package: **Event Place, Swimming Pool, Stage Band**, one PHP15,000 charge, PHP250 tax, PHP1,200 service charge, **PHP16,450 saved total**. The fixture UID is **00AD626A** (four bytes; not a physically scanned card). The current saved status is **Checked In**, established by the existing server-held emulator verifier, not the row button or browser-local state. Pool and Event are eligible; guest controls remain read-only. No Checking Out transition was exercised in this audit.

The first two audit-harness runs stopped on test-assertion problems (substring `Assigned` also matched `Unassigned`; an RTDB ID token was incorrectly supplied as a Bearer header instead of the REST `auth` query). The harness was corrected. Their synthetic records remain: `CBLR-794106` Confirmed/unassigned and `CBLR-380446` Checked In/fixture-assigned. They are additional audit data, not duplicates from a repeated Confirm Reservation click. Use the primary reference above for comparison. No existing records were removed.

## Page results

| Page | Result | Evidence / exact implementation |
|---|---|---|
| Master Reservations | **Needs a fix** (feedback wording); functional flow passed | `admin-reservations.html`, `js/admin-reservations.js` `renderDetails`, `save`; `js/shared-reservations.js` `approveReservation`, `assignConfirmedRfid`, `assignRfid`; `shared-reservations.emulator.rules.json`. Real form submission, View Details inclusions, approval, UID assignment and shared guest/admin updates passed. Approval/assignment alone stayed Confirmed and locked. First-time UID assignment displayed the retry-style message described below. |
| Operational Center | **Pass** for emulator/software; physical readings pending | `admin-dashboard.html`, `js/admin-dashboard.js`, `js/admin-device-console.js` `start`, `render`, `health`, `fresh`. Initial/missing/disconnected values Unknown; heartbeat changes establish Online; an observed heartbeat aging past 15 seconds gives Offline; stale sensor values become Unknown. ESP3 is **Not integrated**. Fixed beacon is correctly described as stationary/manual. |
| Sensors | **Pass** for navigation/software; physical readings pending | `admin-dashboard.html#sensors`, `js/admin-layout.js` `selected`, `contentReady`; `sensors.html`, `js/sensors.js`. All sidebar entry points, same-page click, direct alias, refresh, Back/Forward, heading visibility and active highlight passed. |
| Diorama Overrides / Manual Override alias | **Needs a fix before live use**; **Needs a physical test** for outputs | `diorama-control.html`, `manual-override.html`, corresponding entry scripts; `js/admin-device-console.js` `send`; `js/admin-device-transport.js` `create`, `refresh`, `send`. Fake command/failure/safety tests passed, but device-project server authorization and correlated acknowledgement remain missing/unverified as detailed below. Coordinated Event Mode stays visibly Unavailable. |
| Demo Walkthrough | **Pass** | `demo.html`, `js/demo.js`; six section links work. No control runner, booking mutation, device transport, or physical command. Full database snapshot and monitored writes remained unchanged throughout this test. |
| My Reservation / Guest Dashboard / Pool / Event | **Pass** | Existing `js/my-reservation.js`, `js/guest-dashboard.js`, `js/guest-access.js`, `js/control-shell.js`. Same reference, saved total and status; no access before trusted fixture check-in; only included Pool/Event eligibility afterward; both pages retain read-only controls. |

All audited admin routes passed desktop 1440px, mobile 390px, and 720px reflow checks: consistent sidebar, correct highlight, 16px body, readable controls, no horizontal page overflow. Screenshots were generated and desktop/mobile samples inspected in `test-results/`.

## Issues and reproduction

### 1. First assignment can use misleading retry feedback

Observed on the fresh synthetic primary booking: after starting with empty RFID, explicitly entering the unused fixture UID and saving once, the feedback became `#CBLR-156442 already has this card. No additional assignment was applied.` Both the booking/index were correctly saved and guest RFID status became Assigned. This is a feedback issue, not a lost assignment or access grant.

Reproduce using a **new synthetic** Confirmed/unassigned booking on port 5000, enter an unused full UID in Assign RFID, and inspect the feedback after the save. Capture the root PATCH response and recovery branch to distinguish first confirmed assignment from an already-existing binding. `js/shared-reservations.js` `assignConfirmedRfid` checks the PATCH response, then returns `alreadyAssigned: true` when its catch/recovery read confirms the binding; `js/admin-reservations.js` `save` uses that flag for the quoted message. Recovery success should have neutral saved/verified wording if the original outcome was uncertain. Reassignment/reuse must remain disabled.

### 2. Device authorization is not established by the reservation administrator claim

`js/admin-device-transport.js:24` and `:25` issue GET and PUT/PATCH to the separate device-project URL without an Auth token or Authorization header. `SharedReservations.identity(true)` protects the browser workflow but cannot enforce access to that separate database by itself. The named device observer app also has no authenticated device-project principal in this factory.

Reproduce safely: run `node tests/admin-transport-boundary.test.cjs`. A fake `device.invalid` endpoint records the exact requests; both carry no credential. No live request is needed. Secure device rules would reject these requests; permissive rules would not enforce the reservation administrator role. **Deployed device rules were not queried**, so this audit does not claim that the live database is open. A trusted server/device-project authorization path is required before enabling real controls. Keep existing rules and deployment unchanged during this audit.

### 3. Database request persistence is not device acknowledgement

The same fake probe returns a matching database JSON echo; `send` returns `{accepted:true}` without any controller receipt. There is no correlated command-ID acknowledgement consumed here. The UI correctly says `Command request saved. Physical action is not confirmed by this page.` Pump/pavilion/spotlight values are request labels, and KTV readiness follows Hall state rather than a click. However, transport errors use “acknowledgement” for the database echo, which must not be treated as ESP32 confirmation.

Reproduce: on fake transport, Request Pump On can save while the output report remains Unknown. A command-correlated, fresh controller receipt is needed to claim device acknowledgement, and physical feedback/bench observation is separately needed to confirm the output. Existing gate/motor reports are not command-correlated clearance evidence.

## Tests actually run

1. `tests/admin-event-audit.test.cjs` — **4 functional groups passed**, attached to actual port 5000. Owner form creates pending Event booking; trusted admin approval; explicit zero-preserving UID assignment; matching live guest/admin status; server-controlled check-in fixture; package eligibility/read-only pages; foreign reference denial; unauthenticated/guest admin-list REST denial; Master Reservations guest/signed-out denial; desktop/mobile table. Existing reservation values and emulator `/diorama` data unchanged except the deliberately created audit records/check-in receipts.
2. `tests/admin-workflow.test.cjs` via attach harness — **7 groups passed**, actual port 5000. Shared sidebar and every destination, Sensors alias/hash/history, Unknown/Offline readings, ESP3, both overrides, six-step Demo with zero mutations, denied users and layout.
3. `tests/admin-devices.test.cjs` via attach harness — **6 groups passed**, actual port 5000. Transport allowlist and emulator lock; trusted administrator / denied guest; fake requests; failure/retry/busy feedback; gate/IR/motor/Hall and one-use visual-clearance safeguards; Stop; reactive spotlight ownership; no optimistic physical reports; desktop/mobile/reflow. Restricted-mode test server on 5017 retains the port-5001 reservation-only restrictions.
4. `tests/admin-transport-boundary.test.cjs` — **probe passed**, confirming the missing credential and database-echo/acknowledgement limits with fake fetch only.
5. JavaScript syntax checks and `git diff --check` passed.

To repeat without resetting the running emulator, use PowerShell from the checkout (Node available on PATH):

```powershell
$env:GCLOUD_PROJECT = 'demo-catherines-reservations'
$env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
node tests/admin-event-audit.test.cjs
node --require ./tests/attach-admin-audit.cjs tests/admin-workflow.test.cjs
node --require ./tests/attach-admin-audit.cjs tests/admin-devices.test.cjs
node tests/admin-transport-boundary.test.cjs
```

The Event audit creates another new fixture when rerun. The attach harness reuses the running 5000 server and only starts/closes the additional restricted-mode test server. **Do not use `public-guest-regression.cjs` against the existing 9000 emulator for this audit: that runner deliberately clears RTDB.** Normal preview: `npm.cmd run preview:guest-dashboard` when no existing preview occupies the ports; this seeds its known demo fixtures. Current preview was left running, with no restart needed.

## Remaining physical tests

**Needs a physical test:** authenticated full-UID reader ingress, gate/IR/clearance and entrance motor, KTV door travel and Hall confirmation, pump/pavilion/spotlight/KTV RGB outputs, actual controller heartbeat/sensor reports and physical output feedback. Verify controllers/wiring/polarity and safe isolated power before actuation. Coordinated Event RGB/audio/pool behavior and ESP3 remain unintegrated; do not infer readiness from a fake-transport result. Live checkout/departure/reset was not tested. Guest hardware dispatch stays disabled.

Only audit tests, this report, and generated evidence were added. No application code, rules, firmware, Firebase configuration or deployment was changed for this audit.
