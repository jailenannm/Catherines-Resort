# Backend and two-ESP32 verification

Audit: 19 November 2026, Philippine time. This supersedes conflicting assumptions in `TWO-CONTROLLER-INTEGRATION.md`. Source inspection, isolated software tests and a development-sketch compilation were performed. Neither board was flashed, no physical command was sent, no running service was restarted, and no cloud deployment was performed.

## Main findings

1. The existing LAN RFID service works at `192.168.1.39:8787`, but **reservation device synchronization is NOT enabled in that running process**. Its four device routes return 404. The served frontend configuration also omits `deviceSyncEnabled`. Defining routes in source did not register them in this launcher.
2. The private two-device registry `.local/reservation-devices.json` is absent. No credentials were generated or replaced during this audit.
3. The separate ESP1 development sketch had a fail-OFF weakness: the main loop applied relay lease expiry, but synchronous RFID HTTP could block that loop. The shared helper now applies the output from an independent task. This is compiled software, not a bench result or a safety-certified real-time guarantee.
4. The cottage browser code used `crypto.randomUUID()`, which is unavailable on ordinary HTTP LAN origins. It now uses `crypto.getRandomValues()`. Unconfirmed saves retain their request identity and error feedback rather than being overwritten by polling.
5. Device acknowledgements previously accepted a version never issued to that board. The server now requires the previously issued version. Reported output/acknowledgement also becomes unknown/unacknowledged after 10 seconds, even during the final two seconds of the heartbeat's 12-second online window.
6. The current physical ESP2 source and GPIO26 relay polarity remain missing. The old `ESP2_Lighting` sketch is not a safe replacement. Coordinated Event, audio, KTV actuation and other unverified outputs remain unavailable through the new reservation device API.

## Architecture and current runtime

The website uses the named Firebase app `shared-reservations`. The running LAN configuration points both laptops to the demo Auth/RTDB forwards on the website's hostname. The device backend independently reads the same demo namespace. The old `/diorama` integration is a separate device-project workflow; it is not the new reservation device authority.

| Service | Observed listener | PID / source |
|---|---|---|
| Website | 192.168.1.39:5000 | 18076, `.local/lcd-restart/lan-services.cjs --host=192.168.1.39` |
| RFID backend | 192.168.1.39:8787 | 18076, `startBenchServer` |
| Checkout | 192.168.1.39:8790 | 18076, `startAdminCheckoutServer` |
| Auth LAN forwarding | 192.168.1.39:9099 → 127.0.0.1:29099 | 18076 → 5340 |
| RTDB LAN forwarding | 192.168.1.39:9000 → 127.0.0.1:29000 | 18076 → Java 13120 |
| Emulator hub | 127.0.0.1:24400 | 5340 |
| Separate diagnostics | port 8788 | No listener observed; not started by this audit |

PID5340 explicitly runs `demo-catherines-reservations`, `firebase.lan-demo.json`, with import `.local/emulator-backups/lcd-stage1-20261116-233447-746-PHT`. PID13120 is the RTDB emulator jar. The current adapter has no `deviceSyncConfig` integration; `scripts/serve-reservation-lan.cjs` has the reviewed opt-in integration and no seed/reset call. Do not run a second launcher over occupied ports.

Website: `http://192.168.1.39:5000/`. Master Reservations: `http://192.168.1.39:5000/admin-reservations.html`. Guest: `http://192.168.1.39:5000/my-reservation.html`. Both boards' Wi-Fi reachability to this address still requires operator observation; a PC listener does not prove board connectivity.

### Endpoints

| Endpoint | Source/function and contract | Running LAN status |
|---|---|---|
| GET `/health` | `rfid-bench-server.cjs:startBenchServer`; public time/project, no guest details | 200; correct demo project |
| POST `/scan` | `startBenchServer` → `signed-rfid-check-in.cjs` → `check-in-verifier.cjs:createCheckInVerifier`; reader HMAC | Registered by the running launcher; not invoked against the running dataset |
| POST `/diagnostic` | `rfid-bench-diagnostics.cjs:createDiagnostics`; separate signed diagnostic purpose; no booking write | Registered in source used by the running launcher; not physically exercised |
| POST `/reader-display` | `rfid-reader-display.cjs:createReaderDisplay`; signed read-only snapshot | Registered in source; optional notifications not integrated into the actual board here |
| POST `/guest/cottages` | `reservation-device-http.cjs:createDeviceHttp` → `reservation-device-sync.cjs:cottage` | GET probe 404; optional handler absent |
| GET `/guest/device-state` | `createDeviceHttp` → `status`; owner/eligible cottage booking | 404 |
| GET `/admin/device-state` | `createDeviceHttp` → `status`; trusted admin monitoring | 404 |
| POST `/device/sync` | `createDeviceHttp` → `sync`; separate per-board request/response HMAC | GET probe 404; optional handler absent |
| POST `/admin/confirm-checkout` on8790 | `admin-checkout-server.cjs`; trusted emulator admin, explicit departure/card-ready confirmation | Existing checkout service running; tested on isolated service only |

The four optional routes were exercised successfully through an actual HTTP server in tests. Current-LAN 404s are a configuration/deployment-state blocker, not evidence that the authenticated test adapter failed. No scan/command was sent merely to probe production behavior. Port5001 remains reservation-only; device/guest dashboard routes remain blocked there.

## Database and authorization audit

The root read was read-only. Before/after export-response SHA-256:

`2b5aecec751b188d61ef3744565025f938596ab1e453af6fb100078f7bc2341a`

The exact hash matched after testing. Current records:

| Reference | Status | Saved facilities |
|---|---|---|
| CBLR-169607 | Completed | buyout |
| CBLR-638114 | Completed | cottage, event packageVersion2 |
| CBLR-970389 | Checked In | cottage, ktv |

Three reservations, one active RFID index entry, three verified check-ins, two verified departures and two release-history entries were present. Every observed record has an owner UID and guest name. The active index matched its referenced reservation's assigned UID. Historical `rfidLinked` fields on Completed records are audit history, not active claims. `/reservationDeviceSync` was absent. A read-only Auth `accounts:batchGet` returned three accounts; account credentials were not printed. This audit made no write request to the running database or accounts.

| Path | Purpose / access |
|---|---|
| `/sharedReservations/<reference>` | Owner UID and reference bind the guest to the record; fields include `guestName`, status, canonical `rfidLinked`, saved packages and prices. Owned query/read and tightly validated guest creation; admin approval and assignment rules preserved. |
| `/rfidAssignments/<UID>` | Active exclusive card→reference index, atomically maintained with reservation assignment/release; not readable by guests. |
| `/verifiedCheckins/<eventId>` | Trusted verifier receipt committed atomically with Confirmed→Checked In; browser cannot forge it. |
| `/verifiedDepartures` | Trusted departure evidence, not a browser-local flag or a single IR reading. |
| `/rfidReleaseHistory` | Historical card release audit, retained after reuse. |
| `/reservationDeviceSync` | Server-owned derived state, requests, idempotency receipts, versions and device reports. Default-deny root rules block browser reads/writes; access is through authenticated backend routes. |

`shared-reservations.rules.json` and its emulator counterpart were inspected and **not changed**. A guest direct write to protected device state was denied in the new emulator test. Reservation owner/status/package checks run on every cottage command, not just in `GuestAccess`.

**Security boundary:** Firebase emulators issue unsigned tokens and expose privileged development interfaces. `emulatorIdentity()` checks project/audience/issuer/expiry/provider, looks up the account, and checks saved custom claims as well as token admin claims. This verifies ordinary demo sessions but does not turn emulators into a hostile-client security boundary. Do not expose these ports to the internet or untrusted Wi-Fi. HMAC authenticates device messages; it does not encrypt LAN traffic. Production needs real verified Auth tokens, restricted server identity/database permissions, reviewed TLS and independent security testing. No production authorization was enabled here.

## RFID → reservation → pathway

The existing reader tuple remains `[readerId,eventId,uid,byteCount,observedAt]`, HMAC-SHA256 with the existing reader credential. UID remains uppercase, exactly two hex digits/byte, lengths4/7/10 bytes, leading zeros retained. The 15-second freshness window, unique event identity, immutable receipt and root compare-and-set behavior remain unchanged.

The verifier requires the index and reservation UID to agree and the reservation to be Confirmed. It atomically stores the receipt/status, and returns the name from that exact record. Actual successful fixture response:

```json
{"accepted":true,"reference":"CBLR-980001","status":"Checked In","guestName":"María \"Luz\" Santos de la Cruz"}
```

The existing HTTP replay contract remains409 `{accepted:false,code:"REPLAY",reference,status}`; it does not apply another transition. Lost-ack recovery checks the committed receipt. No firmware response parsing/signing was changed during this pass.

**Date policy remains unresolved:** the verifier's default `isBookingEligible = () => true` imposes no reservation date/time-slot window. It was not silently tightened. Set a reviewed policy before real operational check-in.

The new synchronization core derives pathway authorization from saved Checked In status across bookings. It relies on existing rules/trusted-verifier control of that status, rather than reinterpreting a browser flag. No check-in creates a cottage ON request. Main power, gate OPEN, IR and rejected RFID do not create pathway authorization. The entrance LEDs remain main-switched, independent of GPIO33.

| Scenario | Software evidence / remaining limit |
|---|---|
| Reboot before check-in | Relay startup OFF; lease default OFF; real isolated Confirmed record produces desired OFF. |
| Accepted RFID | Actual isolated HMAC HTTP scan committed Checked In/name; next signed ESP1 poll returned ON. |
| Rejected/unassigned scan | Existing RFID suites reject without changing status/receipt; therefore no new authorization. Another already checked-in booking may legitimately keep pathway ON. |
| Reboot/reconnect after check-in | New poll reconciles saved status; no local remembered ON is required. Actual board boot still pending. |
| Wi-Fi/backend unavailable | No valid lease renewal; output lease expires. Firmware class assertions verify expiry/wrap/bounds. Physical timing under board load remains pending. |
| Expired state / stale version | Lease rejects lower versions and expires after at most10seconds, adjusted for request latency; independent20ms service task applies OFF subject to normal scheduler operation. |
| Checkout / multiple stays | Checking Out is no longer eligible; another Checked In booking keeps pathway authorized. Final eligible stay ending yields OFF. Fake core and actual isolated HTTP tests cover this. |

## Cottage synchronization and permissions

`GuestAccess` still verifies the selected reference, owner and saved status and displays only included facilities. `control-shell.js` permits only the explicit opt-in cottage panel to call the new API; other guest device handlers remain read-only. `reservation-device-controls.js` uses the named app's current user token, hostname:8787, stable per-attempt request IDs, bounded request timeout and no optimistic GPIO state. The backend independently repeats owner/Checked In/cottage-or-buyout validation. Exact-origin CORS is checked by the adapter.

Proposed shared policy, **requiring owner approval before activation**: cottage lighting is ON while at least one eligible Checked In reservation has an ON request. OFF or checkout removes that booking's contribution, not another guest's request. There is one grouped GPIO26 output for all four groups/12 LEDs, not per-cottage control. An old retried ON command cannot undo a newer OFF because its command receipt is reused.

Requested, Command pending, Device acknowledged, Unknown/Offline and Failed/unconfirmed are different states. An acknowledgement means firmware executed a GPIO write for a delivered version. It is **not measured relay current, illumination, or physical success**. No such sensors are integrated.

| Guest's selected record | Pages eligible | New device command permission |
|---|---|---|
| Signed out / another owner / loading / unverifiable | None | Denied |
| Pending Verification / Confirmed, even with RFID | None | Denied |
| Checked In Pool-only | Pool only | No cottage; other controls unavailable |
| Checked In current Event version2 | Event with Stage Band and Pool | No cottage unless separately saved |
| Checked In legacy Event | Event only | Legacy meaning retained; no implied Pool |
| Checked In Cottage | Cottage | Grouped cottage request, only when explicitly configured |
| Checked In KTV | KTV | Existing preview only; no new physical playback/door contract |
| Checked In buyout | All existing mapped facilities | Cottage request; unimplemented outputs remain unavailable |
| Checking Out / Completed / Cancelled / legacy Active | None | Denied/revoked |

| Administrator capability | Actual authority |
|---|---|
| Reservations, approval, RFID | Trusted admin claim + existing database validation; no guest booking required |
| New device state | `/admin/device-state` monitor only; trusted emulator account check |
| New cottage override | **Not implemented**; do not mistake monitoring for override authority |
| Existing `/diorama` diagnostics/requests | Separate device-project authorization, freshness, clearance and Stop safeguards; emulator transport remains read-only |
| Checkout completion | Trusted emulator admin, explicit manual departure/card-ready confirmation; conditional active-index release, historical receipts retained |
| Arbitrary GPIO/audio/gate API | Not provided |

## Two-board GPIO and firmware review

The working original V4 and `ESP1_V4_Safe_Servos` were not overwritten. Original/private-file fingerprint tests passed. Pre-edit source snapshots for this pass are in `.local/backend-second-pass/before/`, with SHA-256 manifest `.local/backend-second-pass/backup-manifest.json` (14 pre-existing files). Actual Laptop2/board firmware is not claimed to match the separate development sketch automatically.

| Board | Outputs / inputs | Conflict and verification result |
|---|---|---|
| ESP1 RFID | SS5/RST22/SCK18/MISO19/MOSI23 | No conflict in reviewed mapping; existing working reader protocol preserved |
| ESP1 LCD | SDA16/SCL17 | Separate I2C bus pins; existing converter and name rendering preserved |
| ESP1 gates/buttons | right14,left27; OPEN25,CLOSE32 | No pin collision; startup disarmed, no automatic attachment; physical left40→160 reported tested, right0–110 direction still pending |
| ESP1 pathway | relay33 active LOW | Independent main-switched entrance LEDs; new development output callback is sole sync-mode GPIO writer |
| ESP1 IR | proposed34 | Input-only, no internal pull-up; default integration flag disabled pending real sensor/polarity verification; no automatic closing |
| ESP2 grouped cottage | relay26 | User-reported working output; active polarity and current source required before merge |
| ESP2 KTV | servo14,Hall34,RGB25/27/32 | Intended distinct pins; Hall freshness, servo limits and driver implementation not verified in current actual sketch |
| ESP2 Event/pool | hall33,stage19,pump16 | Intended distinct pins; not proof of present tested drivers; no new command contract enabled |
| ESP2 TFT | SCK18,MOSI23,CS5,DC21,RST22 | Verify TFT library does not claim GPIO19 as MISO: it is intended for stage relay |
| ESP2 audio | ESP TX13→DFPlayer RX; ESP RX17←DFPlayer TX; microphone35 | Correct UART direction must be confirmed; replaces outdated sketch assumptions, not silently reassigned |
| ESP2 proposed buttons | VP36/VN39 | Input-only; external pull-ups required; cannot reuse as output/UART TX |

GPIO16/17 appearing on both boards is not a conflict; boards are separate. Boot-strapping pins and attached module levels still require electrical review. The old ESP2 source assigns26/14/13 as buttons and has no complete current Facilities Controller implementation; do not flash it as the new design.

The shared helper now uses `DeviceOutputLease.h`, authenticated version/nonce-bound responses and a separate output task. Its callback must only apply GPIO/update minimal state; no HTTP/LCD/Serial/delay. It acknowledges the captured applied version, not a version received later. Main-loop `outputApplied()` is retained as an unversioned compatibility report; use `begin(callback)` for bounded fail-OFF and versioned acknowledgement. ESP2 merge instructions were corrected accordingly and intentionally contain a polarity placeholder until verified.

## Event, Pool, KTV, lighthouse and audio

No new endpoints were invented for unverified outputs. Cottage is the only implemented guest physical-output intent in this synchronization protocol; ESP1 pathway is derived authority, not a guest switch. Current Event includes stage and Pool in the reservation mapping, but this does not establish coordinated firmware support. Pool-only never gains Event/stage authorization. Stage/Pool RGB and beacon wiring remain unresolved and unavailable.

Future audio must have **one server-controlled playback authority**, not independent guest writes to one DFPlayer. The intended physical route is DFPlayer stereo DAC→XH-M273 mixer (mic at its microphone input)→PAM8610→speakers. Replace the reported damaged speaker and verify signal levels/power/grounds before testing. MAX9814 ADC readings do not prove this analog mixing route works.

Before implementing audio: owner must choose explicit Event-versus-KTV/welcome priority and interruption/resume policy; backend must verify reservation/status/facility per request, serialize playback ownership, enforce fresh Hall readiness for KTV and revoke playback on lost access/readiness. Device acknowledgements must report selected track/state separately from acoustic output. No priority, track mapping, volume command or source switching is currently enforced by the new backend. Existing browser karaoke preview is separate; physical DFPlayer lyrics/TFT capability is unverified. Keep lyrics in browser until TFT behavior is confirmed. No audio was sent or enabled here.

## Changes in this pass

- `scripts/reservation-device-sync.cjs`: delivered-version acknowledgement check and10-second output-report freshness.
- `js/reservation-device-controls.js`: LAN-compatible request IDs; reject unconfirmed200 responses; preserve retry identity/error feedback; ignore stale polling/old-selection errors; explain grouped shared lighting.
- `esp32_firmware/shared/ReservationDeviceSync.h` and its identical ESP1 copy: independent fail-OFF output task, captured-version acknowledgement and callback integration.
- New `esp32_firmware/shared/DeviceOutputLease.h` and identical ESP1 copy: small tested monotonic/wrap-safe lease state.
- `esp32_firmware/ESP1_Reservation_Sync/ESP1_Reservation_Sync.ino`: separate development sketch uses the callback as sync-mode relay writer; local checkout cannot compete with it. RFID/signing/LCD/gate protocol functions unchanged by this pass.
- `esp32_firmware/shared/ESP2-INTEGRATION-REVIEW.md`: corrected callback merge instructions and dependency.
- `admin-dashboard.html`, `js/admin-device-console.js`: two-board descriptions, remove residual ESP3 status, explicitly distinguish legacy diagnostics from the intended mapping.
- `tests/esp1-v4-safe-servos.test.cjs`: also compares all16 preserved development-sketch functions against the pre-edit snapshot.
- `tests/reservation-device-sync.test.cjs`, `tests/reservation-device-ui.test.cjs`: regression coverage for delivered/expired acknowledgements, missing randomUUID, malformed200 and failure feedback/retry.
- `tests/admin-workflow.test.cjs`, `tests/admin-devices.test.cjs`: replace obsolete third-board assertion with exactly two controller cards. First regression run exposed that stale assertion; subsequent full run passed.
- New `tests/device-output-lease.test.cjs`, `tests/reservation-device-emulator.test.cjs`: actual C++ class assertions and browser→HTTP→isolated Auth/RTDB integration.
- `TWO-CONTROLLER-INTEGRATION.md`: points to corrected second-pass evidence. This report is new.

No Firebase rules, reader secrets, current backend launcher, private configuration, original V4, production firmware or existing booking values were edited.

## Tests actually executed

| Test | Result / scope |
|---|---|
| `rfid-guest-name.test.cjs` | PASS; exact/Unicode/long names, rejected/replayed scans, lost acknowledgement, receipt/index binding; fake transport |
| `rfid-diagnostics.test.cjs` | PASS; diagnostic signatures, UID lengths/zeros, unreachable backend, zero DB access |
| `rfid-production.test.cjs` | PASS; production disabled, scope/auth/replay/atomicity; cloud transport fake, no deployment |
| `esp1-v4-safe-servos.test.cjs` | PASS; original/private fingerprints,16 preserved functions, startup/manual safety, real C++ compile-time bounds/steps |
| `reservation-device-sync.test.cjs` | PASS; owner/status/package checks, concurrency, deduplication, shared OR, failed writes, checkout, response MAC, replay, delivered-version and expired-report checks |
| `reservation-device-http.test.cjs` | PASS; actual HTTP/CORS handling, fake Auth/DB, role/owner denial and signed polling |
| `reservation-device-ui.test.cjs` | PASS; browser network fixtures, ON/OFF, pending/ack, missing randomUUID, failed/unconfirmed save + stable retry, revoked access, desktop/mobile fit |
| `device-output-lease.test.cjs` | PASS; actual C++ header assertions for startup OFF, expiry, lower-version rejection, OFF, wraparound, TTL bounds; copied headers identical. Does not execute FreeRTOS on a board. |
| Isolated full regression | PASS;80 named checks across admin-workflow7, admin-devices6, master-reservations7, guest-facilities6, phase2c2 12, guest-dashboard-simple7, checkout6, phase2b1 9, phase2b2 11, phase2c1 9. Includes responsive/reflow, permissions, current/legacy packages, failed writes and zero real device/cloud/email calls. |
| `reservation-device-emulator.test.cjs` | PASS; new combined real isolated Auth/RTDB + actual RFID/device HTTP adapter + browser cottage panel; exact check-in/name, pathway before/after, direct-write/other-owner denial, GPIO-report ack and checkout revocation. Browser page/access fixture and port bridge are explicit; no physical board involved. |
| `admin-checkout-isolated.cjs` | PASS; atomic failed-save preservation, conditional release, duplicates, guest denial, history, card reuse checking in only new synthetic record; all isolated |
| ESP1 Arduino Verify equivalent | PASS; classic `esp32:esp32:esp32`, core3.3.12, ESP32Servo3.2.1, MFRC5221.4.12, LiquidCrystal I2C1.1.2, ArduinoJson7.4.2; sync/IR compile branches enabled with dummy private config. 1,029,867 bytes flash;50,628 static RAM. Library metadata warns about AVR but build succeeds. Not uploaded. |
| ESP2 compilation | BLOCKED; missing actual current integrated source/polarity/library configuration; intentionally no invented replacement |
| Running-data comparison | PASS; exact root hash unchanged; service PIDs/listeners preserved |

The first Arduino attempt was blocked by sandbox access to installed tools; the approved compilation then succeeded. Initial Auth listing URLs were unsupported; the supported read-only `accounts:batchGet` succeeded. Neither condition required data recovery or a service restart.

Repeat focused suites with `node tests/<name>.test.cjs`. For isolated regression, use the following **test-only** commands. These reset only19000; never substitute9000 or29000:

```powershell
$env:PATH=(Join-Path $env:TEMP 'catherines-phase2a2-tools\node-v22.16.0-win-x64')+';C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot\bin;'+$env:PATH
$env:FIREBASE_EMULATORS_PATH=Join-Path $env:TEMP 'catherines-phase2a2-tools\emulators'
$env:XDG_CONFIG_HOME=Join-Path $env:TEMP 'catherines-phase2a2-tools\config'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:CI='true'
& node_modules/.bin/firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json "node --require ./tests/isolated-facility-ports.cjs tests/public-guest-regression.cjs admin-workflow admin-devices master-reservations guest-facilities phase2c2 guest-dashboard-simple checkout phase2b1 phase2b2 phase2c1 reservation-device-emulator"
& node_modules/.bin/firebase.cmd emulators:exec --only auth,database --project demo-catherines-reservations --config firebase.facility-tests.json "node --require ./tests/isolated-facility-ports.cjs tests/admin-checkout-isolated.cjs"
```

## Next steps before activation — not performed

1. Supply/export the complete current working ESP2 sketch and library/board configuration; confirm cottage26 polarity with loads isolated and reconcile all existing GPIO writers. Preserve Laptop2's working ESP1 original/private config.
2. Approve or revise the proposed shared-cottage OR policy. Decide check-in date/time-window and future audio priority policies separately.
3. Provision separate device keys privately once using `node scripts/provision-reservation-devices.cjs`. This refuses overwrite. Copy each board's own key to its private `device-sync-secrets.h`; never use the RFID signing key as the device-sync key.
4. Review the separate ESP1 development sketch against the exact uploaded firmware. Verify startup relay OFF, no gate attachment, safe manual button response, RFID name flow, and relay lease expiry under deliberately blocked HTTP. ESP2 requires its reviewed merge, then its own compilation.
5. Back up current emulators, then arrange a controlled stop of **only the current LAN adapter** before enabling the no-seed replacement. Keep Auth/RTDB running; never rerun a seed launcher. Do not use this command while existing ports are occupied:

```powershell
$env:CATHERINES_DEVICE_SYNC='1'
$env:CATHERINES_TRUSTED_DEMO_LAN='1'
node scripts/serve-reservation-lan.cjs --host=192.168.1.39
```

6. Recheck DHCP address, Windows private-network firewall and both boards' backend reachability. Configured guest/admin routes should return403 without credentials, not404; a signed device poll must succeed with that board's unique key. Do not expose emulator ports beyond the trusted demo network. Port8788 is currently absent; restoring independent diagnostics is a separate operator choice, not required for `/diagnostic` on8787.
7. With explicit upload/physical-test approval, isolate actuators first. Test fail-OFF on boot/network loss/lease expiry, backend-confirmed pathway ON, rejected scan, checkout, two concurrent stays and grouped cottage ON/OFF. Verify GPIO acknowledgement separately from actual relay/load behavior. Right gate orientation, IR, KTV Hall/servo, TFT, pumps, stage/audio and damaged speaker remain separate bench tasks.

A browser hard refresh loads static page changes. Loading modified backend modules or enabling optional routes requires a later controlled adapter restart; it was not performed. Loading firmware requires a separately approved upload; the current working board remains unchanged.

## Final status matrix

| Feature | Status |
|---|---|
| Existing RFID HMAC/name/atomic check-in contract | **PASS — Verified in code and tests** |
| Approval, assignment, guest ownership, current/legacy package mapping | **PASS — Verified in code and tests** |
| Device API/HTTP/browser cottage path in isolated emulators | **PASS — Verified in code and tests** |
| Independent output lease/version handling and ESP1 compilation | **PASS — Verified in code and tests**; physical scheduler/relay behavior pending |
| Emulator checkout/release/reuse | **PASS — Verified in code and tests**; departure remains admin-confirmed demo evidence |
| Actual pathway/cottage application and network-loss response | **PENDING — Implemented but requires hardware verification** |
| Running LAN reservation-device routes | **BLOCKED — Missing configuration**;404, private registry absent, controlled activation required |
| Current integrated ESP2 firmware/build | **BLOCKED — Missing code and relay-polarity evidence** |
| Final shared-cottage operating policy | **BLOCKED — Owner approval required** |
| Production-grade hostile-client authentication/TLS deployment | **BLOCKED — Emulator trust model unsuitable** |
| Coordinated Event Mode, guest Pool/stage RGB, beacon | **NOT IMPLEMENTED** in new reservation device authority |
| Trusted shared DFPlayer audio arbitration/physical playback | **NOT IMPLEMENTED** |
| New admin hardware override API | **NOT IMPLEMENTED**; monitoring only, separate legacy safeguards retained |
