> Second-pass corrections and current runtime evidence: see [BACKEND-TWO-ESP32-VERIFICATION.md](BACKEND-TWO-ESP32-VERIFICATION.md). The shared helper now uses an independent output task and requires `DeviceOutputLease.h`; use the updated ESP2 merge guide. Earlier physical readiness claims remain subject to that report.

# Two-controller reservation/device integration

## Scope and current result

Implemented an opt-in emulator/LAN reservation-device synchronization path, guest cottage controls, a matching admin monitor, a separate ESP32 #1 derivative and a shared signed device client. Existing reservation, approval, RFID assignment and checkout records retain their existing schema and transitions. Existing original board sketches remain available.

**Physical integration is incomplete.** The actual working ESP32 #2 source and GPIO26 relay polarity are missing. The repository facilities sketch conflicts with the supplied wiring and cannot safely be merged by guessing. The exact merge additions and conflict list are in `esp32_firmware/shared/ESP2-INTEGRATION-REVIEW.md`. No firmware was uploaded and no physical result is claimed.

Device sync is disabled by default. It has not been enabled on the running LAN dataset or deployed Firebase. The new APIs become available only when an operator provisions the private device registry and explicitly enables the isolated trusted-LAN configuration. Existing port5001 reservation-only restrictions stay in force.

## Architecture audit

The frontend is static HTML, CSS and vanilla JavaScript. The reservation pages use Firebase compat SDK12.6.0 and a named `shared-reservations` app. `js/shared-reservations.js` performs conditional REST writes for booking/approval/RFID assignment, and subscription reads for guest/admin views. There is no SQL database or migration framework.

Reservations live under `/sharedReservations/<reference>`, including ownerUid, guestName, dates/slot, facilities, saved prices, status and historical rfidLinked. `/rfidAssignments/<UID>` is the active unique card index. `/verifiedCheckins`, `/verifiedDepartures` and `/rfidReleaseHistory` preserve audit history.

`scripts/rfid-bench-server.cjs` is a Node HTTP server on8787. `/scan` authenticates the existing HMAC tuple and calls `scripts/check-in-verifier.cjs`, which commits status/receipt atomically by root ETag compare-and-set. `/health`, `/diagnostic` and `/reader-display` retain their existing contracts. No RFID signing format or existing reader credential was changed.

Checkout requests move an owned Checked In booking to Checking Out using emulator rules. `scripts/admin-checkout-server.cjs` verifies the trusted admin claim with Auth and invokes `scripts/emulator-departure-verifier.cjs` for admin-confirmed demo completion/card release. Shared guest eligibility already requires exact Checked In status and package inclusion.

The original V4 is archived under `.local/esp1-v4-backup/2026-11-17T19-24-56-041Z`. The new ESP1 derivative builds on the separately compiled safe V4 version. The checked-in ESP2 facilities source uses a separate cloud `/diorama` connector and older button/pin mappings. Its existing functions have not been rewritten as physically tested behavior.

Source inspected includes `reservation.html`, `js/reservation.js`, `js/shared-reservations.js`, `js/guest-access.js`, `js/guest-dashboard.js`, `js/control-shell.js`, `js/cottage.js`, the guest/admin HTML wiring, the RFID and departure server/verifier modules, `shared-reservations.rules.json`, `shared-reservations.emulator.rules.json`, `tests/serve.cjs`, LAN launchers, ESP1 V4/safe source and ESP2_Lighting source. Earlier audit docs were used for context and checked against source.

## Backend and database additions

New authenticated routes on the same8787 adapter:

| Route | Authorization and result |
| --- | --- |
|POST `/guest/cottages`|Named-app bearer token verified against demo Auth, matching booking owner, exact Checked In status and cottage/buyout inclusion. Body `{reference,on,requestId}`. Saves explicit desired request and returns pending/offline/acknowledgement state.|
|GET `/guest/device-state?reference=...`|Same owned cottage eligibility. Returns desired and controller-reported status.|
|GET `/admin/device-state`|Current trusted admin claim plus matching Auth account. No guest package requirement. Read/reconcile monitoring, without new gate control.|
|POST `/device/sync`|Unique device HMAC key, current request time, nonce, acknowledgement version and reported output. Returns signed desired state and10second lease.|

The new `/reservationDeviceSync` subtree contains derived desired/version state, per-booking requests, command receipts and per-device reported status. The existing rules default-deny unknown paths, so browser SDK clients cannot directly write this subtree. Only the trusted server's emulator owner transport writes it. No production rules or Firebase deployment was performed. No existing reservation field needs a migration.

The sync registry allows only `esp1` and `esp2`, with unique private keys. The existing RFID reader ID/key remains separate. Device requests sign compact JSON `["cblr-device-sync-v1",deviceId,requestId,observedAt,ackVersion,actual]`. Responses sign `["cblr-device-state-v1",deviceId,requestId,version,desired,serverTime,validForMs]`. Request age is limited to15seconds. Changed reuse of an ID is rejected. Identical requests reuse a result. Devices verify the response MAC and matching nonce, enforce a persistent server version during that boot and fail output OFF after the lease expires. Duplicate responses do not renew the lease indefinitely.

Frontend credentials never include device keys. CORS allows only the configured website origin. This implementation targets the existing isolated LAN/emulators. Bare HTTP must be restricted to the trusted demo network. Public or untrusted-network operation requires a separately reviewed TLS endpoint/certificate setup. No claim of production device authorization is made.

## Shared relay and checkout policy

There is one GPIO26 cottage output for all12 LEDs. The implemented policy is **OR across eligible bookings requesting ON**. A guest's OFF removes only that booking's ON request. Checking Out, Completed, Cancelled, Confirmed or any other non-Checked-In status revokes its request. Other eligible bookings can keep the shared output ON. This policy was proposed to the user and remains a decision to confirm before activation.

Pathway desired state is ON while any saved booking remains Checked In. Cottages start OFF and require an explicit guest request. Gate actions, IR detection, card detection and booking creation never set those requests. Device synchronization recalculates authorization from current server records at every poll/status/request. An old command ID cannot reapply an ON after a later OFF. Checkout-driven recalculation occurs on the next sync/status poll, with an expired-controller lease forcing OFF within10seconds if communication fails.

Device versions, command receipts and ETag transactions keep concurrent updates consistent. Controller acknowledgement reports a GPIO command execution, not a physical current/light sensor measurement. An offline controller appears Offline with actual output Unknown. An online controller with a mismatched version/output appears Command pending. A matching fresh acknowledgement appears Device acknowledged. These distinctions are shown on the cottage/dashboard controls and in the Operational Center's new reservation-device card.

Current RFID policy does not enforce booking-date/time-slot windows. This integration preserves that business behavior and treats existing statuses as authoritative. A temporal-expiry policy must be agreed before real bookings depend on automatic date-based revocation. No guessed checkout deadline was added to records.

## ESP32 #1 changes

The complete separate sketch is `esp32_firmware/ESP1_Reservation_Sync/ESP1_Reservation_Sync.ino`. Existing private `bench-secrets.h` and tested UID formatter are reused. The sync worker runs network polling separately from the main loop, so manual gates can remain responsive. Only the main loop applies the pathway relay and reports its GPIO state. Existing accepted-scan LCD/welcome logic remains. With sync enabled, an accepted scan permits the server-derived pathway state on the next poll. Without sync enabled, the prior V4 accepted-scan pathway behavior remains.

Enable only after review by adding `#define CBLR_RESERVATION_SYNC_ENABLED 1` to the private bench header and supplying private `device-sync-secrets.h`. The latter defines `CBLR_DEVICE_ID "esp1"` and the unique sync key. It does not replace the RFID key.

Safe servo calibration, explicit attachment confirmation, manual hold-to-move, both-buttons stop and DISARM are inherited from the V4-safe derivative. Initial attachment still can move a permanently attached mechanism. The main loop defers original blocking RFID/HTTP functions while servos are attached. The new synchronization worker can continue separately. The original V4 relay polarity remains active-LOW.

LEFT calibration references are configurable40degrees CLOSED and160degrees OPEN. `CBLR_LEFT_PROFILE_VERIFIED` defaults0. Only after measured confirmation may it load those endpoint references, using the V4 electrical pulse mapping. It never attaches or selects an initial target automatically. RIGHT0..110degrees is a reference range only. Its direction and endpoints must be calibrated. Both move through incremental2microsecond commands with60ms manual-step spacing.

`CBLR_IR_VERIFIED` defaults0. Once receiver voltage/polarity/bias and wiring have been physically tested, an operator may configure it and use `IR_ENABLE` only after calibrated gates are armed and the beam has been CLEAR for one second. GPIO34 input uses no internal pull-up. An80ms filtered interruption requests opening. There is no timed closing. A blocked beam during enabled closing requests reopening. OPEN/CLOSE simultaneous input stops additional steps. `IR_DISABLE` retains manual control.

One beam cannot prove full clearance or distinguish every disconnected/stuck signal from a real obstruction. Hardware commissioning must establish a defined receiver output and failure behavior. Leave IR disabled until that is verified. Reset/disarm clears IR authorization and pending motion.

## ESP32 #2 dependency and proposed additions

The user-provided map reserves GPIO26 for the physically tested cottage relay, while the repository source configures it as a button. The source also uses14 and13 for buttons where the supplied map places KTV servo and DFPlayer. A full safe facilities merge requires the current working source, exact relay polarity and confirmation of legacy cottage writers/UART usage. The supplied merge document includes setup/loop additions using the shared client and identifies the conflicting writers that must be reconciled.

No third controller or board-to-board UART is required by the new protocol. The new sync task uses Wi-Fi to the same backend. Existing unrelated TFT, pool, event, sound and KTV code should be preserved from the actual working facilities source, with unverified controls remaining unavailable.

## GPIO mapping for review

|Controller|Component|GPIO|Evidence/status|
|---|---|---|---|
|ESP1|RC522 SS/RST/SCK/MISO/MOSI|5/22/18/19/23|Preserved V4|
|ESP1|LCD SDA/SCL|16/17|Preserved V4, level shifter|
|ESP1|RIGHT/LEFT servo|14/27|Separate calibration, physical limits pending|
|ESP1|OPEN/CLOSE buttons|25/32|Preserved sampled INPUT_PULLUP|
|ESP1|Pathway relay|33|Preserved active-LOW setting|
|ESP1|IR receiver|34|Disabled pending commissioning|
|ESP1|Entrance LEDs|Main switched regulated supply|No software pin or main-power command|
|ESP2|Cottage relay|26|User-reported physical test, polarity/source required|
|ESP2|KTV servo/Hall|14/34|Supplied map, current source mismatch|
|ESP2|KTV RGB|25/27/32|Supplied map|
|ESP2|Event hall/stage relay|33/19|Supplied map|
|ESP2|Pool pump|16|Supplied map|
|ESP2|TFT|18/23/5/21/22|Supplied map|
|ESP2|DFPlayer|17/13|Supplied map, source mismatch|
|ESP2|Microphone|35|Supplied map|
|ESP2|Old wired RX|36|Review actual source before reuse|

## Files changed and created

- Server core `scripts/reservation-device-sync.cjs`, HTTP adapter `scripts/reservation-device-http.cjs`, opt-in config `scripts/device-sync-config.cjs` and private provisioning command `scripts/provision-reservation-devices.cjs`.
- `scripts/rfid-bench-server.cjs` adds optional device routes before its existing reader-only guard. Existing scan/health/diagnostic contracts retain their behavior.
- `scripts/serve-reservation-lan.cjs` starts adapters without seed/reset calls. `scripts/lan-demo.cjs` passes opt-in config to its existing startup, and `tests/serve.cjs` injects the enabled flag only on configured LAN previews.
- `js/reservation-device-controls.js`, `js/reservation-device-monitor.js`, guest dashboard/cottage script wiring, narrow cottage guard exception in `js/control-shell.js`, dashboard feedback and Operational Center monitor. The obsolete third-controller card was removed from that page.
- Separate ESP1 derivative and copied shared helper/config example, plus `esp32_firmware/shared/ReservationDeviceSync.h` and `ESP2-INTEGRATION-REVIEW.md`.
- Three focused tests for device core, real HTTP adapter and browser UI.
- `.gitignore` protects the new private per-device header and the separate ESP1 private bench header.

Original firmware references were retained, with additional private snapshots under `.local/two-controller-integration-backup`. The earlier V4 archive and fingerprints remain the baseline. No live services were restarted for this work, no live Firebase request was made, and no running dataset was intentionally modified. Automated checks use fake transport or separate emulator ports.

## Start/configuration steps after dependency review

Keep existing emulators if they are already running. Never start duplicates or blindly import an older backup over a current dataset. If the laptop has restarted, start the existing demo Auth/RTDB configuration with the operator's latest verified export, not an arbitrary old export. The project ID must be explicit because `.firebaserc` defaults to the cloud reservations project.

Private provisioning, once only:

```powershell
node scripts/provision-reservation-devices.cjs
```

This refuses to overwrite an existing registry. Copy each key privately to its respective reviewed sketch config. Keep `.local/reservation-devices.json` and both `device-sync-secrets.h` files out of Git/chat. Do not display or log those files. Review the source/polarity and shared-relay policy before enabling physical outputs.

After the current LAN adapter has been stopped using the reviewed process-specific procedure, keep the Auth/RTDB emulators running and start the new no-seed adapter in a project-root terminal:

```powershell
$env:CATHERINES_DEVICE_SYNC='1'
$env:CATHERINES_TRUSTED_DEMO_LAN='1'
node scripts/serve-reservation-lan.cjs --host=192.168.1.39
```

Use the current assigned LAN address if DHCP changes it. Website is `http://192.168.1.39:5000/`, backend is8787, checkout is8790 and Auth/RTDB forwarding is9099/9000. The existing private BENCH_SERVER must point to that backend for both reviewed board sketches. The independent diagnostic server8788 can remain on its current separate process.

For source-only preview without enabling device routes, omit the two enablement variables and run the same adapter. This does not seed accounts or data. The existing `npm run demo:lan` startup seeds demo accounts and is not the no-seed activation command recommended here.

## Compile and operator upload sequence

1. Preserve full actual working sketch folders from Laptop2, including private headers and library versions.
2. ESP1 uses the new complete `ESP1_Reservation_Sync` folder, existing private bench header and the new unique sync header. Install ArduinoJson7.4.2 alongside existing ESP32Servo3.2.1, MFRC5221.4.12 and LiquidCrystal I2C1.1.2 for the tested core3.3.12/classic ESP32 profile.
3. Run Arduino Verify for the actual board profile. Software build here used placeholder credentials. Do not flash the private build-test binaries.
4. ESP2 must first receive a reviewed merge against the actual working sketch and verified GPIO26 polarity. Its exact additions are in `ESP2-INTEGRATION-REVIEW.md`; the placeholder is intentionally non-compilable until that value is confirmed. Then run Verify against its actual TFT/audio/servo dependencies.
5. Only after operator approval, isolate actuator/load supplies and follow the existing safe USB upload arrangement for each board. Select its own COM port, upload the reviewed sketch, then use115200baud Serial Monitor. ESP1 starts gate-disarmed, and relay startup is OFF.

## End-to-end physical checklist, pending

1. Verify both controllers' keys, response authentication and same LAN backend. Confirm the admin monitor reports each real device fresh only after its signed sync.
2. Create a dedicated synthetic cottage booking through the guest website, approve and assign a card in Master Reservations. Before check-in, cottage requests must be denied and pathway OFF.
3. Perform an operator-authorized physical tap. Confirm the existing atomic receipt/status and returned actual guest name. Pathway should follow the signed active-booking lease; cottages remain OFF until explicitly requested.
4. Guest selects COTTAGES ON/OFF. Confirm one relay controls all12 LEDs. Verify requested/pending feedback before the controller acknowledges, then compare acknowledgement with observed physical output.
5. Use a second eligible booking to verify the shared OR policy. One checkout/OFF must not turn off a relay still requested by another eligible booking.
6. Request checkout and perform the existing trusted departure flow. Confirm controls revoke on Checking Out and desired states recalculate. Observe controller acknowledgements. Disconnect Wi-Fi to confirm fail-OFF after lease expiry, then reconnect to restore only a newly authenticated current state.
7. After individual servo calibration and electrical safety checks, verify OPEN, CLOSE hold/release, both-buttons behavior, DISARM and responsiveness while server/network is unavailable. Measure signal and physical result separately.
8. Verify IR polarity, signal voltage, defined bias, clear/blocked response and disconnected behavior before enabling IR. Confirm obstruction opens, manual backup works and no timer closes the gates.

No physical checklist item is marked passed without bench evidence. The actual ESP2 merge, relay polarity, IR commissioning and deployment activation remain explicit dependencies.

## Verification results from this implementation

- `node tests/reservation-device-sync.test.cjs` passed fake-store permission, state/version, acknowledgement, checkout, concurrent shared-relay and stale-command cases.
- `node tests/reservation-device-http.test.cjs` passed real local HTTP routing with fake Auth/RTDB, CORS and guest/admin/device denial cases.
- `node tests/reservation-device-ui.test.cjs` passed browser fixtures for request/acknowledgement separation, same-ID retry, lockout and desktop/mobile fit.
- `node tests/rfid-guest-name.test.cjs`, `node tests/rfid-diagnostics.test.cjs`, `node tests/rfid-production.test.cjs` and `node tests/esp1-v4-safe-servos.test.cjs` passed. Production transport was fake.
- `npm.cmd run test:guest-facilities` passed25 existing regression groups on isolated Auth19099/RTDB19000 and web15000.
- The combined isolated `checkout phase2b1 phase2b2 phase2c1` regression passed35 groups covering checkout, approval, RFID assignment and trusted check-in.
- The separate ESP1 sync sketch compiled successfully for classic ESP32 core3.3.12 with ArduinoJson7.4.2, ESP32Servo3.2.1, MFRC5221.4.12 and LiquidCrystal I2C1.1.2. Compiler coverage enabled optional synchronization and IR with placeholder credentials. Flash usage1,029,863bytes, static RAM50,612bytes. LiquidCrystal I2C emitted its existing AVR-metadata warning.
- JavaScript syntax and whitespace checks passed. Physical response signatures, lease expiry on the actual ESP32 loop, IR electrical/fault behavior, current draw, servo travel and the complete ESP2 source integration remain pending.
