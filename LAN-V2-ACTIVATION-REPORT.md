# LAN V2 activation report — 19 November 2026

The approved no-seed adapter is running at http://192.168.1.39:5000/.

## Processes and configuration

- Previous adapter PID 18076 was absent and its five ports were released before activation.
- New Node adapter PID **7388**: `scripts/serve-reservation-lan.cjs --host=192.168.1.39`.
- Adapter owns LAN ports **5000, 8787, 8790, 9099, 9000**.
- Existing Firebase CLI/Auth PID **5340** and Java RTDB PID **13120** remain unchanged on localhost 29099/24400 and 29000.
- Project `demo-catherines-reservations`; namespace `demo-catherines-reservations-default-rtdb`.
- V1 device sync and Facilities V2 enabled; simulation false. All physical V2 capabilities remain Awaiting Verification/uncommissioned. No actuator command submitted.
- Served browser config uses the visitor's hostname for Auth9099 and RTDB9000. Confirmation email is disabled.

## Integrity and credentials

Before activation, all four backup hashes passed and the entire database matched `.local/emulator-backups/lcd-stage1-20261116-233447-746-PHT`. Stable Auth identity/credential/provider/role fields matched for all three accounts.

After activation, every original database subtree matches that backup: sharedReservations, rfidAssignments, rfidReleaseHistory, verifiedCheckins and verifiedDepartures. The only added root is the authorized `reservationFacilitiesV2` derived state. Consequently whole-root equality is now false, as expected; original booking/history equality is true. All three stable Auth accounts still match. No restore or reseeding occurred.

Distinct ESP1/ESP2 device-sync keys were generated in `.local/reservation-devices.json`, which Git ignores. Keys were not printed or copied to boards. Existing `.local/rfid-reader.json` hash remains unchanged. No firmware or website source was modified.

## HTTP verification

| Request | Result |
| --- | --- |
| RFID `/health` | 200 |
| Anonymous admin V2 state | 403 |
| Anonymous guest V2 state | 403 |
| Authorized existing emulator admin V2 state | 200 |
| Home, Master Reservations, Diorama Overrides, Guest Dashboard, My Reservation HTML | 200 each |

Admin verification used a temporary emulator-only identity for the existing administrator, checked by the backend against its authoritative Auth account. No token was logged or persisted, and no sign-in/account mutation was needed. It is not a production authentication test. The returned device state is Unknown; physical capability availability is Awaiting Verification.

Laptop 1 LAN HTTP reachability passed. Laptop 2 must still confirm Home and My Reservation load at http://192.168.1.39:5000/; a request was sent to the operator. HTTP HTML checks do not establish full browser rendering or remote-laptop reachability.

## Remaining boundaries

ESP1 V4 remains untouched. Neither board was flashed, given new sync credentials or sent an actuator command. Hardware commissioning, relay polarity, lease/fail-OFF behavior on physical devices and remote Laptop 2 verification remain pending. V1 sync can derive pathway desired state from an existing checked-in booking: do not install the new sync keys on hardware before separate review.

Logs: `.local/lan-v2-adapter.stdout.log` and `.local/lan-v2-adapter.stderr.log` (empty at final check). PID: `.local/lan-v2-adapter.pid`. Safe test evidence: `.local/lan-v2-activation-http.json` and `.local/lan-v2-post-activation.json`.

Rollback remains adapter-only as documented in LAN-V2-ACTIVATION-CHECKLIST.md. The replacement adapter runs hidden, so reverify its PID/command line before any future stop; do not assume an old terminal controls it. Do not stop emulators or import the old backup for ordinary adapter rollback.
