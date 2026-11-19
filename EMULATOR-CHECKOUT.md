# Shared checkout workflow — emulator only

## Lifecycle and authorization

The named `shared-reservations` app is the only booking source. The revised owner flow is:

`Pending Verification → Confirmed → Checked In → Checking Out → Completed`

Existing approval, RFID assignment and trusted check-in behavior remains intact. Requesting checkout preserves the active RFID index. The new administrator-confirmed demo departure atomically completes the booking and releases that index only if it still points to the same booking. Historical card assignment, check-in receipts and booking details/prices remain intact.

- Only the signed-in owner of an exact `Checked In` shared booking can request `Checking Out`.
- `SharedReservations.requestCheckout` is emulator-only, rejects production/cloud-test mode, reads the owner/current record, and conditionally writes only `/sharedReservations/<reference>/status` using its server ETag. Concurrent clicks share a pending promise. A repeated request already Checking Out reuses saved state without another write. Lost acknowledgement is accepted only after a fresh owned-record read proves Checking Out/Completed. Failure keeps the page retryable and does not clear inputs, account/session or booking data.
- The permission is enforced by **`shared-reservations.emulator.rules.json`**, not merely the browser. It requires password Auth, ownership, the exact transition and the demo project's token audience. Other booking fields remain unwritable. Guests/admin clients cannot directly complete checkout or create departure receipts.
- **`shared-reservations.rules.json` is unchanged.** Emulator configs alone use the new separate rules artifact. Never publish the emulator rules to the reservations cloud project. `scripts/build-emulator-rules.cjs` regenerates that artifact from the current production rules plus the narrow demo transition, avoiding silently losing approval/RFID constraints.
- `GuestAccess` already requires exact Checked In status, so Checking Out/Completed locks facility links/direct visits and the server command policy. The dashboard and My Reservation show a selected-reference checkout link only in emulator mode. No live checkout entry is added on port5001; its route and script remain blocked.

## Legacy audit and replacement

Old `checkout.html` loaded `database.js`, `firebase-config.js`, `diorama-link.js` and `control-shell.js`. Old `js/checkout.js` trusted local role/reservation state, called `ResortDB.updateReservationStatus(reference,"Checked Out")`, then immediately presented success. `processCheckOut` cleared `/diorama/guest` reference/name/cottage/checkedIn/checkinAt, reset local cottage light/occupied/reference and Event mode/hall/stage/music/reference values, and wrote a device log. This was neither a shared booking departure nor trusted evidence. It did not directly call `localStorage.clear`; its local booking promotion and device-state clearing were the problem.

The replacement page/controller loads only shared reservations/Auth and the public header. It has no ResortDB/device connector, local completion, storage clearing, gate action, light/audio reset or browser Finish control. Its cards, typography and buttons reuse My Reservation styles. It shows loading/sign-in/unavailable/retry, Request Checkout, pending departure guidance and the shared Completed status. A successful request does not claim completed departure. The displayed reference is only a selector; shared ownership remains authoritative.

Master Reservations already understood Checking Out and Completed; it now adds “Awaiting trusted departure verification” beside Checking Out. My Reservation and Guest Dashboard have matching next-step messages, selected-reference checkout navigation and locked facility state. Approval/RFID assignment actions remain unchanged.

## Trusted completion fixture

`scripts/emulator-departure-verifier.cjs` accepts only immutable copies of **server-held** fixtures. It refuses any project except `demo-catherines-reservations` and database host except loopback9000/19000/29000. The emulator-only administrator HTTP adapter is documented below. No cloud Admin SDK/service key is used.

Completion requires all synthetic fixture evidence: known unique event ID, matching reference, fresh server time (15-second fixture window), trusted fixture source, exit confirmed, gate clear, motor stopped and facilities reset. Unknown, stale, future, incomplete or single-IR evidence is rejected; the booking must be Checking Out. An ETag root compare-and-set atomically writes Completed and `/verifiedDepartures/<eventId>` while preserving all other data. Same-event concurrent retries reuse the receipt. A failed save leaves Checking Out; lost acknowledgement requires a matching receipt and status before success is reported.

The sensor-fixture boolean fields are legitimate **only because these fixtures are constructed inside a trusted emulator process**, not accepted from a guest or device/browser flag. They are not proof of physical sensors. `scripts/complete-emulator-checkout.cjs` remains an explicit operator-run simulation. The admin UI's separate manual attestation is explicitly labeled admin-confirmed, not sensor-verified.

## Preview steps

### Administrator-confirmed LAN demo departure

Master Reservations now offers **Confirm Checkout** only to verified administrators for Checking Out bookings in emulator mode. Its dialog shows the reference and requires explicit confirmation that the guest departed and the card is ready for reuse. `SharedReservations.confirmCheckout` sends the named-app Auth token to `scripts/admin-checkout-server.cjs` on8790. The server rechecks the account's trusted admin claim with the matching Auth emulator; guest, signed-out and cloud-mode use are denied.

The server creates a separate fresh **admin-confirmed** attestation, never synthetic sensor/reset booleans. The existing departure verifier uses a stable per-booking receipt and one root ETag transaction to save Completed, `checkoutConfirmation` (confirmer UID and server time), `/verifiedDepartures` and `/rfidReleaseHistory`. It deletes an active `/rfidAssignments/<UID>` only if its value still equals this reference. Historical `rfidLinked`, card-assignment metadata and check-in receipts remain. Retries reuse the original receipt without releasing any subsequent assignment. The older sensor-fixture CLI keeps its existing semantics and does not release cards.

`npm.cmd run test:admin-checkout` runs the new atomic, authorization and browser flow checks on isolated19099/19000 emulators and web15000. It verifies first-release/reuse, concurrent completion, failed writes, guest/anonymous denial, duplicates, preserved details/history, mismatched-index protection, shared statuses, desktop/mobile dialog fit and a signed fixture scan that checks in only the newly assigned booking. No physical tap or device reset is claimed. See `LAN-DEMO.md` for the current running dataset and service startup.

1. Regenerate rules if the production rules changed: `node scripts/build-emulator-rules.cjs`.
2. Stop/restart your existing **emulator preview process** when convenient so it loads the new emulator rules. From the repo run `npm.cmd run preview:guest-dashboard`. This uses the existing demo Auth/RTDB preview and seeds its known demonstration bookings; restarting/reseeding resets those demonstration fixtures. Do not point it at cloud Firebase or use live details. Automated tests below use separate private ports and leave the running preview untouched.
3. Sign in at `http://127.0.0.1:5000/login.html` with `guest-a@example.test` / `TestPass123!` (emulator-only credentials).
4. Open `http://127.0.0.1:5000/my-reservation.html?reservation=CBLR-820001` or its Guest Dashboard. The preview fixture has trusted simulated Checked In status. Follow **Request Checkout**, or open `http://127.0.0.1:5000/checkout.html?reservation=CBLR-820001`.
5. In a separate browser session sign in with the preview's trusted admin `administrator@example.test` / `TestPass123!` and open `http://127.0.0.1:5000/admin-reservations.html`. These are emulator-only credentials. Submit the guest request. Both sessions should show **Checking Out**; facility pages lock. Keep the booking pending while discussing departure/reset requirements.
6. To simulate complete departure, run in a separate PowerShell terminal (server-controlled local test only):

```powershell
$env:GCLOUD_PROJECT='demo-catherines-reservations'
$env:FIREBASE_DATABASE_EMULATOR_HOST='127.0.0.1:9000'
node scripts/complete-emulator-checkout.cjs CBLR-820001
```

7. Guest/admin views should both show **Completed** without a reload. Refresh to verify persistence. RFID remains assigned; no gate/device reset was sent. Clear these terminal environment overrides when done if you use the terminal for unrelated Firebase work.

The static pages need only a hard refresh. Port5001 needs no server restart or allowlist change and remains reservation-only. The already-running RTDB emulator **does need restart or explicit local rules reload** to adopt the changed rules configuration. No cloud rules publication is needed or authorized.

## Verification actually run

`npm.cmd run test:checkout` generates rules and runs the checkout suite on isolated demo Auth/RTDB ports19099/19000 and web15000, without stopping the existing5000 preview. The suite verifies owner/signed-out/non-owner access; direct unauthorized writes; production-mode refusal; ineligible statuses; duplicate clicks and retry reuse; forced save failure; lost acknowledgement; same reference/status in guest, My Reservation and separate admin session; refresh; facility lockout including direct Pool access; preserved booking fields/RFID/index; denied browser completion/receipt writes; rejected single-IR/stale/unknown/premature departure fixtures; failed completion save; concurrent trusted completion; desktop/mobile fit; zero diorama/live-project/email writes; and port5001-equivalent restrictions.

The combined isolated checkout/approval/RFID/check-in regression run passed **35 groups**: checkout6, approval9, RFID11 and check-in9. The targeted checkout command also passed after expanding its negative cases. Initial test setup was corrected to use shared test-tab Auth persistence; login's legacy local database script is not the checkout/device connector and was excluded from the device-block assertion. Syntax and whitespace checks were run. No physical result is claimed.

## Remaining live dependencies

Before live completion, define and bench-verify:

- A real authenticated departure controller/reader identity, unique immutable event IDs, trusted timestamps, freshness/replay policy and server receipt retention.
- Evidence the vehicle/guest has fully exited the movement envelope, using verified sensors/sequence or supervised trusted operator procedure. One clear entrance IR beam is insufficient.
- Confirmed gate clearance and safe final gate position, motor stopped independently of an echoed command/state, and timeout/fault handling.
- Confirmed facility reset and audio ownership/output shutdown with device acknowledgements; no fabricated relay feedback. Decide pathway/standby behavior from actual wiring.
- Safe handling of incomplete departure/reset, network loss and simultaneous requests. Decide RFID card release/reuse policy separately; this phase retains assignment.
- Trusted server authorization across the separate reservations and device projects, current device rules, and supervised physical validation before exposing live endpoints.

Live completion stays disabled until those dependencies are verified. Firmware and physical commands are unchanged in this task.

## Files changed

- `checkout.html`, `js/checkout.js`: replace local/device checkout with owned shared read/request flow.
- `js/shared-reservations.js`: conditional, idempotent emulator checkout method.
- `my-reservation.html`, `js/my-reservation.js`, `js/guest-dashboard.js`, `js/admin-reservations.js`: selected-reference links and shared lifecycle guidance.
- `shared-reservations.emulator.rules.json`, `scripts/build-emulator-rules.cjs`, `firebase.emulators.json`, `firebase.facility-tests.json`: isolated rules artifact/configuration; production rules unchanged.
- `scripts/emulator-departure-verifier.cjs`, `scripts/complete-emulator-checkout.cjs`: trusted fixture completion and operator CLI.
- `tests/checkout.test.cjs`, `tests/isolated-facility-ports.cjs`, `package.json`: isolated tests/command.
- `EMULATOR-CHECKOUT.md`: this report.

Existing homepage edits and all other local work were preserved.
